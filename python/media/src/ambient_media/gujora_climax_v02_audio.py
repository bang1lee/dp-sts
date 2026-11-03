"""Synthesize a native 30-second sustained BWV 846 ambient excerpt."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.signal import butter, oaconvolve, sosfilt

from ambient_media.gujora_climax_audio import analyze

SR = 48000
DURATION = 30


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def smooth01(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0, 1)
    return x*x*(3-2*x)


def voice(note: int, duration: float, gain: float, kind: str) -> np.ndarray:
    if kind not in ('pad','melody','bass') or duration <= 0 or not 0 <= note <= 127:
        raise ValueError('invalid voice')
    attack = {'pad':6., 'melody':3.8, 'bass':7.}[kind]
    release = {'pad':8., 'melody':8., 'bass':8.}[kind]
    time = np.arange(round((duration+release)*SR), dtype=np.float32)/SR
    envelope = smooth01(time/attack)*(1-smooth01((time-duration)/release))
    freq = 440*2**((note-69)/12)
    phase = np.asarray(2*np.pi*freq*time, dtype=np.float32)
    drift = .07*np.sin(2*np.pi*.035*time+note*.1)
    if kind == 'bass':
        signal = np.sin(phase+drift) + .05*np.sin(2*phase)
    else:
        signal = np.zeros_like(time)
        for cents in (-4, 0, 4):
            p = phase*(2**(cents/1200))+drift
            signal += (np.sin(p) + (.11+.02*np.sin(.1*time))*np.sin(2*p) + .025*np.sin(3*p))/3
    return np.asarray(signal*envelope*gain,dtype=np.float32)


def reverb_impulse(rng: np.random.Generator) -> np.ndarray:
    time=np.arange(8*SR,dtype=np.float32)/SR
    noise=rng.standard_normal(len(time)).astype(np.float32)
    dark=sosfilt(butter(2,[120,4000],btype='bandpass',fs=SR,output='sos'),noise)
    impulse=np.asarray(dark*np.exp(-time/2.4)*smooth01(time/.16),dtype=np.float32)
    power=float(np.sqrt(np.sum(impulse.astype(np.float64)**2)))
    return impulse/max(power,1e-12)


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--score',type=Path,default=Path('compositions/gujora-spatial/score.json'))
    parser.add_argument('--out',type=Path,default=Path('runs/dp-sts-gujora-climax-v02'))
    args=parser.parse_args()
    score_path=args.score.resolve(); output=args.out.resolve()
    if output.exists():
        raise FileExistsError(f'{output} exists; choose a new --out')
    score=json.loads(score_path.read_text())
    if (score.get('duration') != 464 or score.get('melody') != 'bwv846'
            or score.get('arrangement',{}).get('secondsPerNote') != 2.5):
        raise ValueError('expected the verified slow BWV 846 Strudel score')
    melody_path=Path(score['melodyScorePath']); original_path=Path(score['originalScorePath'])
    generator=Path('tools/gujora-spatial-score.mjs')
    if (sha256(melody_path) != score['melodyScoreSha256'] or sha256(original_path) != score['originalScoreSha256']
            or sha256(generator) != score['scoreGeneratorSha256']):
        raise ValueError('score source provenance mismatch')
    events=score['events']
    first_pad=[event for event in events if event['track']=='pad' and event['t']==0]
    next_pad=[event for event in events if event['track']=='pad' and event['t']==50]
    bass=[event for event in events if event['track']=='bass' and event['t']==0]
    melody=[event for event in events if event['track']=='melody' and 10 <= event['t'] < 37]
    if len(first_pad)!=4 or len(next_pad)!=4 or len(bass)!=1 or len(melody)<8:
        raise ValueError('the verified score does not contain the expected pad and melody voices')
    output.parent.mkdir(parents=True,exist_ok=True)
    temp=Path(tempfile.mkdtemp(prefix='.gujora-climax-v02-audio-',dir=output.parent))
    try:
        for source,name in ((score_path,'score.json'),(melody_path,'melody-source.json'),
                            (original_path,'bwv846-source.ly'),(generator,'score-generator.mjs'),
                            (Path(__file__),'audio-preparation.py')):
            shutil.copy2(source,temp/name)
        mix=np.zeros((DURATION*SR,2),dtype=np.float32)
        def add(note: int, at: float, duration: float, gain: float, kind: str, pan: float) -> None:
            start=round(at*SR)
            data=voice(note,duration,gain,kind)[:len(mix)-start]
            mix[start:start+len(data),0]+=data*np.sqrt((1-pan)/2)
            mix[start:start+len(data),1]+=data*np.sqrt((1+pan)/2)
        for index,event in enumerate(first_pad):
            add(event['note'],0,20,.055,'pad',(-.34,-.12,.12,.34)[index])
        for index,event in enumerate(next_pad):
            add(event['note'],15,15,.048,'pad',(-.30,-.1,.1,.30)[index])
        add(bass[0]['note'],0,26,.012,'bass',0)
        for index,event in enumerate(melody):
            start=event['t']-7
            if start >= DURATION:
                break
            add(event['note'],start,event['duration'],.034,'melody',-.10 if index%2==0 else .10)
        rng=np.random.default_rng(20261103)
        send=np.asarray((mix[:,0]+mix[:,1])*.5,dtype=np.float32)
        for channel in (0,1):
            wet=oaconvolve(send,reverb_impulse(rng),mode='full')[:len(mix)]
            mix[:,channel]+=.17*wet
        for sec in range(DURATION):
            time=sec+np.arange(SR,dtype=np.float32)/SR
            part=mix[sec*SR:(sec+1)*SR]
            np.tanh(part*1.05,out=part)
            part*=(1-smooth01((time-24)/6))[:,None]
        peak_before=float(np.max(np.abs(mix)))
        if not np.isfinite(mix).all() or peak_before < 1e-8:
            raise ValueError('synthesized mix is silent or non-finite')
        mix*=.56/peak_before
        raw=temp/'mix.f32'; mix.astype('<f4',copy=False).tofile(raw)
        audio=temp/'audio.wav'
        subprocess.run(['ffmpeg','-v','error','-xerror','-nostdin','-n','-f','f32le','-ar','48000','-ac','2',
                        '-i',str(raw),'-af','highpass=f=28,lowpass=f=4200','-c:a','pcm_s24le',str(audio)],check=True)
        raw.unlink()
        decoded=subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(audio),'-f','f32le','-acodec','pcm_f32le','pipe:1'],
                               capture_output=True,check=True)
        pcm=np.frombuffer(decoded.stdout,dtype='<f4').reshape(-1,2)
        audio_hash=sha256(audio)
        features,attacks=analyze(pcm,audio_hash,str(output/'audio.wav'),str(score_path))
        for item in (features,attacks):
            item.pop('sourceOriginal',None)
            item['sourceScore']=str(score_path)
        peak=float(np.max(np.abs(pcm))); clipped=int(np.count_nonzero(np.abs(pcm)>=1))
        if peak>=1 or clipped:
            raise ValueError(f'output clips: peak={peak}, samples={clipped}')
        (temp/'audio-features.json').write_text(json.dumps(features,separators=(',',':')))
        (temp/'audio-attacks.json').write_text(json.dumps(attacks,separators=(',',':')))
        metadata={'duration_seconds':DURATION,'sample_rate_hz':SR,'channels':2,'bit_depth':24,
                  'sample_peak':peak,'rms':float(np.sqrt(np.mean(pcm.astype(np.float64)**2))),
                  'samples_at_or_above_full_scale':clipped,'audio_sha256':audio_hash,
                  'features_sha256':sha256(temp/'audio-features.json'),'attacks_sha256':sha256(temp/'audio-attacks.json'),
                  'score_path':str(score_path),'score_sha256':sha256(temp/'score.json'),
                  'melody_source_sha256':sha256(temp/'melody-source.json'),'original_score_sha256':sha256(temp/'bwv846-source.ly'),
                  'score_generator_sha256':sha256(temp/'score-generator.mjs'),'preparation_sha256':sha256(temp/'audio-preparation.py'),
                  'source_provenance':'Original synthesized ambient interpretation using notes from Bach BWV 846 and a Strudel-generated score; no reference recording sampled.',
                  'method':'Native 30-second synthesis; no atempo or pitch-changing compression. Slow detuned oscillators, overlapping envelopes, dark diffuse reverb and low-pass.',
                  'controls':'Actual 30–140 Hz bass RMS and positive low-band changes; 30 ms attack, 260 ms release.',
                  'limitations':'Subjective similarity, sound quality and musical balance require listening; no claim of identical instruments or reference recording.'}
        (temp/'audio-prepare.json').write_text(json.dumps(metadata,indent=2)+'\n')
        os.rename(temp,output)
    finally:
        shutil.rmtree(temp,ignore_errors=True)
    print(f'Prepared original 30-second audio and controls: {output}',flush=True)


if __name__=='__main__':
    main()
