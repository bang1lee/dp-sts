"""Prepare a quiet 30-second original hi-hat stem for later mixing."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
DURATION = 30


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def read_score(path: Path) -> dict:
    score=json.loads(path.read_text())
    events=score.get('events')
    if score.get('duration')!=30 or score.get('bpm')!=60 or not isinstance(events,list) or len(events)!=30:
        raise ValueError('expected a 30-second, 60 BPM, 30-event score')
    for index,event in enumerate(events):
        expected_velocity=.26 if index%2==0 else .20
        if (event.get('track')!='hat' or event.get('beat')!=index or event.get('gridSeconds')!=index
                or not isinstance(event.get('timeSeconds'),(float,int))
                or not math.isfinite(event['timeSeconds'])
                or abs(event['timeSeconds']-(index+.25))>.010001
                or event.get('velocity')!=expected_velocity):
            raise ValueError(f'invalid hi-hat event at index {index}')
    return score


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--score',type=Path,default=Path('compositions/gujora-hihat/score.json'))
    parser.add_argument('--out',type=Path,default=Path('runs/dp-sts-gujora-hihat-prep-v01'))
    args=parser.parse_args()
    output=args.out.resolve()
    if output.exists():
        raise FileExistsError(f'{output} already exists; choose a new --out')
    score=read_score(args.score)
    generator=Path('tools/gujora-hihat-score.mjs')
    if sha256(generator)!=score.get('generatorSha256'):
        raise ValueError('Strudel score generator has changed since the score was created')
    sample=Path('assets/original-kit/hat.wav')
    manifest_path=Path('assets/original-kit/manifest.json')
    manifest=json.loads(manifest_path.read_text())
    hat=next((item for item in manifest['files'] if item.get('id')=='hat'),None)
    if not hat or sha256(sample)!=hat.get('sha256'):
        raise ValueError('project hat sample does not match the original-kit manifest')
    rate,data=wavfile.read(sample)
    if rate!=SR or data.ndim!=1 or data.dtype!=np.int16:
        raise ValueError('expected the original mono 48 kHz 16-bit project hat sample')
    mono=data.astype(np.float64)/32768
    filtered=sosfilt(butter(4,[850,6500],btype='bandpass',fs=SR,output='sos'),mono)
    # A brief taper softens the transient and prevents edge clicks without changing the pattern.
    fade_in=np.minimum(np.arange(len(filtered))/(SR*.010),1)
    fade_out=np.minimum(np.arange(len(filtered))[::-1]/(SR*.020),1)
    filtered*=fade_in*fade_out
    pcm=np.zeros((DURATION*SR,2),dtype=np.float32)
    for event in score['events']:
        at=round(event['timeSeconds']*SR)
        signal=np.asarray(filtered*event['velocity'],dtype=np.float32)
        end=min(len(pcm),at+len(signal))
        pcm[at:end,0]+=signal[:end-at]
        pcm[at:end,1]+=signal[:end-at]
    peak=float(np.max(np.abs(pcm)))
    if not np.isfinite(pcm).all() or not 0<peak<=.08:
        raise ValueError(f'prepared stem must be finite and peak at or below 0.08; got {peak}')
    output.parent.mkdir(parents=True,exist_ok=True)
    temp=Path(tempfile.mkdtemp(prefix='.gujora-hihat-',dir=output.parent))
    try:
        raw=temp/'hat.f32'; pcm.astype('<f4',copy=False).tofile(raw)
        audio=temp/'hihat.wav'
        subprocess.run(['ffmpeg','-v','error','-xerror','-nostdin','-n','-f','f32le','-ar','48000','-ac','2',
                        '-i',str(raw),'-c:a','pcm_s24le',str(audio)],check=True)
        raw.unlink()
        decoded=subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(audio),'-f','f32le',
                                '-acodec','pcm_f32le','pipe:1'],capture_output=True,check=True)
        samples=np.frombuffer(decoded.stdout,dtype='<f4').reshape(-1,2)
        if samples.shape!=(DURATION*SR,2) or not np.isfinite(samples).all():
            raise ValueError('decoded stem is not 30 seconds of finite 48 kHz stereo')
        actual_peak=float(np.max(np.abs(samples)))
        if not 0<actual_peak<=.08:
            raise ValueError('decoded stem exceeds the intended peak or is silent')
        shutil.copy2(args.score,temp/'pattern.json')
        (temp/'events.json').write_text(json.dumps(score['events'],indent=2)+'\n')
        shutil.copy2(sample,temp/'original-hat.wav')
        shutil.copy2(manifest_path,temp/'original-kit-manifest.json')
        shutil.copy2(generator,temp/'score-generator.mjs')
        shutil.copy2(Path(__file__),temp/'hihat-preparation.py')
        info={'duration_seconds':30,'sample_rate_hz':48000,'channels':2,'bit_depth':24,
              'bpm':60,'events':len(score['events']),'jitter_max_seconds':.01,'seed':score['seed'],
              'sample_peak':actual_peak,'rms':float(np.sqrt(np.mean(samples.astype(np.float64)**2))),
              'samples_at_or_above_full_scale':int(np.count_nonzero(np.abs(samples)>=1)),
              'audio_sha256':sha256(audio),'pattern_sha256':sha256(temp/'pattern.json'),
              'events_sha256':sha256(temp/'events.json'),'sample_source':str(sample),
              'sample_sha256':sha256(temp/'original-hat.wav'),'kit_manifest_sha256':sha256(temp/'original-kit-manifest.json'),
              'score_generator_sha256':sha256(temp/'score-generator.mjs'),
              'preparation_sha256':sha256(temp/'hihat-preparation.py'),
              'method':'30 actual Strudel onsets; one hat per second, 250ms grid offset, seeded ±10ms and alternating low velocities; 850–6500Hz soft bandpass and 10ms attack taper.',
              'limitations':'Independent hi-hat stem only; not mixed with any music or video. Final balance requires listening.'}
        (temp/'audio-prepare.json').write_text(json.dumps(info,indent=2)+'\n')
        os.rename(temp,output)
    finally:
        shutil.rmtree(temp,ignore_errors=True)
    print(f'Prepared hi-hat stem: {output}',flush=True)


if __name__=='__main__':
    main()
