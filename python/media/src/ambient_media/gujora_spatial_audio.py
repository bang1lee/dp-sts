"""Render a new 464-second sustained BWV 846 ambient interpretation."""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.signal import butter, oaconvolve, sosfilt, sosfilt_zi

SR = 48000
DURATION = 464
FPS = 24


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def smooth01(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0, 1)
    return x*x*(3-2*x)


def synthesize(event: dict) -> np.ndarray:
    track, duration, note = event['track'], float(event['duration']), float(event['note'])
    if track not in ('pad', 'bass', 'melody') or duration <= 0 or not 0 <= note <= 127:
        raise ValueError('invalid score event')
    release = {'pad': 6., 'bass': 6., 'melody': 4.}[track]
    attack = {'pad': 5., 'bass': 5., 'melody': 2.1}[track]
    attack = min(attack, max(.3, duration*.9))
    t = np.arange(round((duration+release)*SR), dtype=np.float32)/SR
    env = smooth01(t/attack) * (1-smooth01((t-duration)/release))
    freq = 440*2**((note-69)/12)
    phase = np.asarray(2*np.pi*freq*t, dtype=np.float32)
    drift = .055*np.sin(2*np.pi*.031*t+note*.11)
    if track == 'bass':
        sig = np.sin(phase+drift) + .055*np.sin(phase*2)
    else:
        sig = np.zeros_like(t)
        for cents in (-3, 0, 3):
            p = phase * (2**(cents/1200)) + drift
            if track == 'pad':
                sig += (np.sin(p) + (.16+.025*np.sin(.09*t))*np.sin(2*p)
                        + .045*np.sin(3*p))/3
            else:
                sig += (np.sin(p) + (.12+.025*np.sin(.065*t))*np.sin(2*p)
                        + .04*np.sin(3*p))/3
    return np.asarray(sig*env*float(event['gain']), dtype=np.float32)


def read_score(path: Path) -> dict:
    score = json.loads(path.read_text())
    if (score.get('duration'), score.get('sampleRate'), score.get('fps')) != (DURATION, SR, FPS):
        raise ValueError('score must be 464 seconds, 48000 Hz, and 24 fps')
    events = score.get('events')
    if not isinstance(events, list) or not events:
        raise ValueError('score contains no events')
    for event in events:
        if not isinstance(event, dict) or not all(k in event for k in ('track','note','duration','t','gain','pan')):
            raise ValueError('invalid score event fields')
        nums = [event[k] for k in ('note','duration','t','gain','pan')]
        if (not all(isinstance(v, (int, float)) and math.isfinite(v) for v in nums)
                or not 0 <= event['t'] < DURATION or not 0 < event['duration'] <= 50
                or not 0 <= event['gain'] <= 1 or not -1 <= event['pan'] <= 1
                or not 0 <= event['note'] <= 127 or event['track'] not in ('pad','bass','melody')):
            raise ValueError('score contains an out-of-range event')
    melody = [e for e in events if e['track'] == 'melody']
    if len(melody) < 2 or melody[0]['t'] != 10:
        raise ValueError('score must start the melody at 10 seconds')
    if any(not math.isclose(b['t']-a['t'], 2.5, abs_tol=1e-6) for a,b in itertools.pairwise(melody)):
        raise ValueError('melody onsets must be spaced by 2.5 seconds')
    if any(not 59 <= e['note'] <= 77 or not math.isclose(e['duration'], min(2.5, DURATION-e['t']), abs_tol=1e-6)
           for e in melody):
        raise ValueError('melody must stay in the score register and last 2.5 seconds except at the end')
    return score


def smooth_curve(values: np.ndarray, width: int = 15) -> np.ndarray:
    padded = np.pad(values, (width//2, width//2), mode='edge')
    return np.convolve(padded, np.ones(width)/width, mode='valid')


def read_reference(path: Path) -> dict[str, np.ndarray]:
    data = json.loads(path.read_text())
    rows = data.get('rows')
    if not isinstance(rows, list) or len(rows) < 2:
        raise ValueError('reference analysis must contain timed rows')
    fields = ('second', 'rms', 'spectral_centroid_hz', 'stereo_width', 'onset_strength',
              'band_low', 'band_mid', 'band_high')
    try:
        result = {key: np.asarray([float(row[key]) for row in rows], dtype=np.float64) for key in fields}
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f'reference analysis missing a required numerical field: {exc}') from exc
    t = result['second']
    if (not all(np.isfinite(v).all() for v in result.values()) or t[0] != 0 or t[-1] < DURATION-1
            or not np.all(np.diff(t)>0) or any(np.any(result[k]<0) for k in fields[1:])):
        raise ValueError('reference analysis must cover 0–463 seconds with finite nonnegative measurements')
    has_bandwidth = ['spectral_bandwidth_hz' in row for row in rows]
    if any(has_bandwidth) and not all(has_bandwidth):
        raise ValueError('reference spectral bandwidth must be present for every row or none')
    if all(has_bandwidth):
        bandwidth = np.asarray([float(row['spectral_bandwidth_hz']) for row in rows], dtype=np.float64)
        if not np.isfinite(bandwidth).all() or np.any(bandwidth < 0):
            raise ValueError('reference spectral bandwidth must be finite and nonnegative')
    else:
        bands = np.array([result['band_low'], result['band_mid'], result['band_high']])
        centers = np.array([100., 600., 3500.])[:, None]
        total = np.maximum(np.sum(bands, axis=0), 1e-12)
        mean = np.sum(bands*centers, axis=0)/total
        bandwidth = np.sqrt(np.sum(bands*(centers-mean)**2, axis=0)/total)
    result['spectral_bandwidth_hz'] = bandwidth
    result['bandwidth_measured'] = np.array([all(has_bandwidth)])
    return result


def reference_curves(reference: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    seconds = np.arange(DURATION+1)
    def interp(name: str) -> np.ndarray:
        return smooth_curve(np.interp(seconds, reference['second'], reference[name]))
    rms = interp('rms')
    rms_max = max(float(np.percentile(rms, 95)), 1e-9)
    level = .38+.62*np.clip(rms/rms_max, 0, 1)
    lo, mid, hi = interp('band_low'), interp('band_mid'), interp('band_high')
    fraction = hi / np.maximum(lo+mid+hi, 1e-9)
    active = rms > rms_max*.1
    anchor = max(float(np.median(fraction[active])) if active.any() else .01, 1e-6)
    valid_centroid = reference['rms'] > max(float(np.max(reference['rms']))*.02, 1e-9)
    if np.count_nonzero(valid_centroid) >= 2:
        centroid = smooth_curve(np.interp(seconds, reference['second'][valid_centroid],
                                          reference['spectral_centroid_hz'][valid_centroid]))
        centroid_anchor = max(float(np.median(centroid[active])) if active.any() else 1, 1e-6)
        bandwidth = smooth_curve(np.interp(seconds, reference['second'][valid_centroid],
                                           reference['spectral_bandwidth_hz'][valid_centroid]))
        bandwidth_anchor = max(float(np.median(bandwidth[active])) if active.any() else 1, 1e-6)
        brightness = (np.clip(fraction/anchor, .8, 1.2)
                      + np.clip(centroid/centroid_anchor, .8, 1.2)
                      + np.clip(bandwidth/bandwidth_anchor, .8, 1.2))/3
    else:
        brightness = np.clip(fraction/anchor, .8, 1.2)
    width_raw = interp('stereo_width')
    width_anchor = max(float(np.median(width_raw[active])) if active.any() else 1, 1e-6)
    width = np.clip(width_raw/width_anchor, .75, 1.25)
    onset = interp('onset_strength')
    onset_anchor = max(float(np.percentile(onset, 95)), 1e-9)
    level *= .98 + .02*np.clip(onset/onset_anchor, 0, 1)
    return {'seconds': seconds, 'level': level, 'brightness': brightness, 'width': width}


def impulse(rng: np.random.Generator) -> np.ndarray:
    t = np.arange(SR*10, dtype=np.float32)/SR
    raw = rng.standard_normal(len(t)).astype(np.float32)
    filtered = sosfilt(butter(2,[130,9000],btype='bandpass',fs=SR,output='sos'),raw)
    result = np.asarray(filtered*np.exp(-t/2.25)*smooth01(t/.12), dtype=np.float32)
    norm = float(np.sqrt(np.sum(result.astype(np.float64)**2)))
    return result/max(norm,1e-12)


def audio_controls(pcm: np.ndarray, wav_hash: str, source_audio: str) -> dict:
    if pcm.shape != (DURATION*SR,2):
        raise ValueError('decoded WAV sample count is not 464 seconds of stereo')
    mono = np.mean(pcm,axis=1)
    if not np.isfinite(mono).all():
        raise ValueError('decoded WAV contains non-finite samples')
    padded = np.pad(mono,(2048,2048))
    window = np.hanning(4096)
    freq = np.fft.rfftfreq(4096,1/SR)
    masks = [(freq>=a)&(freq<b) for a,b in ((30,140),(140,1500),(1500,10000))]
    values = np.empty((DURATION*FPS,4),np.float64)
    for i in range(len(values)):
        at=i*(SR//FPS)
        power = np.abs(np.fft.rfft(padded[at:at+4096]*window))**2
        values[i] = [np.sqrt(np.mean(mono[at:at+SR//FPS].astype(np.float64)**2)),
                     *(np.sqrt(power[mask].sum()) for mask in masks)]
    values = np.clip(values/np.maximum(np.percentile(values,98,axis=0),1e-9),0,1)
    smooth = np.zeros_like(values)
    for i,row in enumerate(values):
        prev=smooth[i-1] if i else np.zeros(4)
        tau=np.where(row>prev,.18,1.1)
        smooth[i]=prev+(row-prev)*(1-np.exp(-1/(FPS*tau)))
    return {'sourceAudio':source_audio,'sourceStart':0,'duration':DURATION,'fps':FPS,
            'columns':['rms','low30_140','mid140_1500','high1500_10000'],
            'wav_sha256':wav_hash,'frames':smooth.round(6).tolist()}


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--score',type=Path,default=Path('compositions/gujora-spatial/score.json'))
    parser.add_argument('--reference-analysis',type=Path,default=Path('runs/dp-sts-gujora-spatial-v01/reference-analysis.json'))
    parser.add_argument('--out',type=Path,default=Path('runs/dp-sts-gujora-spatial-audio-v01'))
    args=parser.parse_args()
    score=read_score(args.score)
    out=args.out.resolve()
    if out.exists():
        raise FileExistsError(f'{out} already exists; choose a new --out')
    melody_path, original_path = Path(score['melodyScorePath']),Path(score['originalScorePath'])
    generator=Path('tools/gujora-spatial-score.mjs')
    if (digest(melody_path)!=score['melodyScoreSha256'] or digest(original_path)!=score['originalScoreSha256']
            or digest(generator)!=score['scoreGeneratorSha256']):
        raise ValueError('score source provenance mismatch')
    out.parent.mkdir(parents=True,exist_ok=True)
    temp=Path(tempfile.mkdtemp(prefix='.gujora-spatial-audio-',dir=out.parent))
    try:
        for source, name in ((args.score,'score.json'),(melody_path,'melody-source.json'),
                             (original_path,'bwv846-source.ly'),(generator,'score-generator.mjs'),
                             (Path(__file__),'synthesizer.py'),(args.reference_analysis,'reference-envelope.json')):
            shutil.copy2(source,temp/name)
        score=read_score(temp/'score.json')
        if (digest(temp/'melody-source.json')!=score['melodyScoreSha256']
                or digest(temp/'bwv846-source.ly')!=score['originalScoreSha256']
                or digest(temp/'score-generator.mjs')!=score['scoreGeneratorSha256']):
            raise ValueError('source snapshot differs from score provenance')
        reference=read_reference(temp/'reference-envelope.json')
        curves=reference_curves(reference)
        length=DURATION*SR
        mix=np.zeros((length,2),dtype=np.float32)
        for i,event in enumerate(score['events']):
            start=round(event['t']*SR)
            sig=synthesize(event)[:length-start]
            pan=event['pan']
            mix[start:start+len(sig),0]+=sig*np.sqrt((1-pan)/2)
            mix[start:start+len(sig),1]+=sig*np.sqrt((1+pan)/2)
            if i%50==0:
                print(f'Voices {i}/{len(score["events"])}',flush=True)
        rng=np.random.default_rng(20261103)
        send=np.asarray((mix[:,0]+mix[:,1])*.5,dtype=np.float32)
        print('Rendering diffuse stereo reverb...',flush=True)
        for channel in (0,1):
            wet=oaconvolve(send,impulse(rng),mode='full')[:length]
            mix[:,channel]+=.18*wet
            del wet
        del send
        sos=butter(2,1600,fs=SR,output='sos')
        state=np.repeat(sosfilt_zi(sos)[:,:,None],2,axis=2)*0
        for sec in range(DURATION):
            t=sec+np.arange(SR,dtype=np.float32)/SR
            part=mix[sec*SR:(sec+1)*SR]
            low,state=sosfilt(sos,part,axis=0,zi=state)
            bright=np.interp(t,curves['seconds'],curves['brightness'])[:,None]
            part[:]=low+(part-low)*bright
            mid=(part[:,0]+part[:,1])*.5
            side=(part[:,0]-part[:,1])*.5
            side*=np.interp(t,curves['seconds'],curves['width'])
            part[:,0]=mid+side
            part[:,1]=mid-side
            np.tanh(part*1.08,out=part)
            env=smooth01(t/7)*(1-smooth01((t-450)/14))
            env*=np.interp(t,curves['seconds'],curves['level'])
            part*=env[:,None]
        peak_before=float(np.max(np.abs(mix)))
        if not np.isfinite(mix).all() or peak_before<1e-8:
            raise ValueError('mix is silent or non-finite')
        mix*=.60/peak_before
        raw=temp/'mix.f32'
        mix.astype('<f4',copy=False).tofile(raw)
        del mix
        audio=temp/'audio.wav'
        subprocess.run(['ffmpeg','-v','error','-n','-f','f32le','-ar',str(SR),'-ac','2','-i',str(raw),
                        '-af','highpass=f=27,lowpass=f=13500','-c:a','pcm_s24le',str(audio)],check=True)
        raw.unlink()
        decoded=temp/'decoded.f32'
        subprocess.run(['ffmpeg','-v','error','-xerror','-n','-i',str(audio),'-f','f32le','-acodec',
                        'pcm_f32le',str(decoded)],check=True)
        pcm=np.memmap(decoded,dtype='<f4',mode='r').reshape(-1,2)
        wav_hash=digest(audio)
        controls=audio_controls(pcm,wav_hash,str(out/'audio.wav'))
        peak=float(np.max(np.abs(pcm)))
        clipped=int(np.count_nonzero(np.abs(pcm)>=1))
        rms=float(np.sqrt(np.mean(pcm.astype(np.float64)**2)))
        if peak>=.99 or clipped:
            raise ValueError(f'final WAV exceeds headroom: peak={peak}, clipped={clipped}')
        del pcm
        decoded.unlink()
        (temp/'audio-features.json').write_text(json.dumps(controls,separators=(',',':')))
        manifest={'duration_seconds':DURATION,'sample_rate_hz':SR,'channels':2,'bit_depth':24,
                  'sample_peak':peak,'rms':rms,'samples_at_or_above_full_scale':clipped,
                  'audio_sha256':wav_hash,'features_sha256':digest(temp/'audio-features.json'),
                  'score_sha256':digest(temp/'score.json'),'synthesizer_sha256':digest(temp/'synthesizer.py'),
                  'score_generator_sha256':digest(temp/'score-generator.mjs'),
                  'melody_source_sha256':digest(temp/'melody-source.json'),
                  'original_score_sha256':digest(temp/'bwv846-source.ly'),
                  'reference_envelope_sha256':digest(temp/'reference-envelope.json'),
                  'reference_analysis_source':str(args.reference_analysis),
                  'reference_bandwidth_source':('measured' if reference['bandwidth_measured'][0]
                                                else 'coarse estimate from three frequency bands'),
                  'reference_analysis_method':'Smoothed measured RMS, spectral bands, centroid, bandwidth, stereo width and onset energy guide bounded mix dynamics; no reference audio is included.',
                  'melody':score.get('melody'),'melody_status':score.get('melodyStatus'),
                  'melody_attribution':score.get('melodyAttribution'),'reference':score.get('reference'),
                  'notes':'Original synthesized audio; subjective similarity and quality require listening.'}
        (temp/'audio-render.json').write_text(json.dumps(manifest,indent=2)+'\n')
        os.rename(temp,out)
    finally:
        shutil.rmtree(temp,ignore_errors=True)
    print(f'Audio complete: {out}',flush=True)


if __name__=='__main__':
    main()
