"""Mix a 1× speed master excerpt and the prepared sparse hi-hat stem."""
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

from ambient_media.gujora_climax_audio import analyze

SR = 48000
DURATION = 30


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def fades() -> np.ndarray:
    time=np.arange(DURATION*SR,dtype=np.float64)/SR
    start=np.sin(np.pi/2*np.clip(time/.8,0,1))**2
    end=np.sin(np.pi/2*np.clip((DURATION-time)/2.5,0,1))**2
    return np.asarray(start*end,dtype=np.float32)


def read_audio(path: Path, start: int | None = None) -> np.ndarray:
    cmd=['ffmpeg','-v','error','-xerror']
    if start is not None:
        cmd += ['-ss',str(start)]
    cmd += ['-i',str(path),'-t',str(DURATION),'-f','f32le','-acodec','pcm_f32le','pipe:1']
    data=subprocess.run(cmd,capture_output=True,check=True).stdout
    pcm=np.frombuffer(data,dtype='<f4').reshape(-1,2)
    if pcm.shape!=(DURATION*SR,2) or not np.isfinite(pcm).all():
        raise ValueError(f'{path}: expected 30 seconds of finite 48 kHz stereo')
    return pcm


def verify_format(path: Path, expected_duration: int) -> None:
    output=subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)],
                          capture_output=True,check=True)
    info=json.loads(output.stdout)
    audio=[stream for stream in info['streams'] if stream['codec_type']=='audio']
    if (len(audio)!=1 or audio[0].get('sample_rate')!='48000' or audio[0].get('channels')!=2
            or not math.isclose(float(info['format']['duration']),expected_duration,abs_tol=.001)):
        raise ValueError(f'{path}: invalid audio duration, channels or sample rate')


def write_audio(path: Path, pcm: np.ndarray) -> None:
    subprocess.run(['ffmpeg','-v','error','-xerror','-nostdin','-n','-f','f32le','-ar','48000',
                    '-ac','2','-i','pipe:0','-c:a','pcm_s24le',str(path)],
                   input=pcm.astype('<f4',copy=False).tobytes(),check=True)


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--master',type=Path,default=Path('runs/dp-sts-gujora-spatial-audio-v01/audio.wav'))
    parser.add_argument('--hihat',type=Path,default=Path('runs/dp-sts-gujora-hihat-prep-v01/hihat.wav'))
    parser.add_argument('--out',type=Path,default=Path('runs/dp-sts-gujora-continuum-v01'))
    args=parser.parse_args()
    master=args.master.resolve(); hihat=args.hihat.resolve(); output=args.out.resolve()
    if output.exists():
        raise FileExistsError(f'{output} already exists; choose a new --out')
    for path in (master,hihat):
        if not path.is_file():
            raise FileNotFoundError(f'input audio not found: {path}')
    verify_format(master,464); verify_format(hihat,30)
    source_manifest=json.loads((master.parent/'audio-render.json').read_text())
    hat_manifest=json.loads((hihat.parent/'audio-prepare.json').read_text())
    source_hash=sha256(master); hat_hash=sha256(hihat)
    if source_manifest.get('audio_sha256')!=source_hash or hat_manifest.get('audio_sha256')!=hat_hash:
        raise ValueError('input audio does not match its preparation metadata')
    fade=fades()[:,None]
    original=read_audio(master,50)
    hat_original=read_audio(hihat)
    ambient=np.asarray(original*fade,dtype=np.float32)
    hat=np.asarray(hat_original*fade,dtype=np.float32)
    mixed=np.asarray(ambient+hat,dtype=np.float32)
    peak=float(np.max(np.abs(mixed)))
    if not np.isfinite(mixed).all() or peak>=.99 or peak<1e-7:
        raise ValueError(f'mix is silent, non-finite, or exceeds headroom: peak={peak}')
    output.parent.mkdir(parents=True,exist_ok=True)
    temp=Path(tempfile.mkdtemp(prefix='.gujora-continuum-audio-',dir=output.parent))
    try:
        for name,pcm in (('ambient-stem.wav',ambient),('hihat-stem.wav',hat),('audio.wav',mixed)):
            write_audio(temp/name,pcm)
            verify_format(temp/name,30)
        decoded=read_audio(temp/'audio.wav')
        ambient_decoded=read_audio(temp/'ambient-stem.wav')
        hat_decoded=read_audio(temp/'hihat-stem.wav')
        source_error=float(np.max(np.abs(ambient_decoded-ambient)))
        hat_error=float(np.max(np.abs(hat_decoded-hat)))
        sum_error=float(np.max(np.abs(decoded-(ambient_decoded+hat_decoded))))
        if max(source_error,hat_error,sum_error)>4e-7:
            raise ValueError('decoded stems do not match the intended 1× excerpt and direct mix')
        audio_hash=sha256(temp/'audio.wav')
        features,attacks=analyze(decoded,audio_hash,str(output/'audio.wav'),str(master))
        (temp/'audio-features.json').write_text(json.dumps(features,separators=(',',':')))
        (temp/'audio-attacks.json').write_text(json.dumps(attacks,separators=(',',':')))
        shutil.copy2(Path(__file__),temp/'audio-preparation.py')
        manifest={'duration_seconds':30,'sample_rate_hz':48000,'channels':2,'bit_depth':24,
                  'sample_peak':float(np.max(np.abs(decoded))),
                  'rms':float(np.sqrt(np.mean(decoded.astype(np.float64)**2))),
                  'samples_at_or_above_full_scale':int(np.count_nonzero(np.abs(decoded)>=1)),
                  'audio_sha256':audio_hash,'features_sha256':sha256(temp/'audio-features.json'),
                  'attacks_sha256':sha256(temp/'audio-attacks.json'),
                  'ambient_stem_sha256':sha256(temp/'ambient-stem.wav'),'hihat_stem_sha256':sha256(temp/'hihat-stem.wav'),
                  'source_audio':str(master),'source_sha256':source_hash,
                  'source_start_seconds':50,'source_end_seconds':80,'playback_rate':1.0,
                  'hihat_source':str(hihat),'hihat_source_sha256':hat_hash,
                  'fade_in_seconds':.8,'fade_out_seconds':2.5,
                  'source_provenance':'Original synthesized BWV 846 ambient master, 50–80 seconds at original speed, plus project-original 60 BPM hi-hat; not an Aphex Twin master.',
                  'method':'Direct 1× sample-rate-preserving excerpt and 1× hi-hat sum. No atempo, resynthesis, additional percussion or gain normalization.',
                  'max_absolute_ambient_stem_error':source_error,'max_absolute_hihat_stem_error':hat_error,
                  'max_absolute_sum_error':sum_error,'preparation_sha256':sha256(temp/'audio-preparation.py'),
                  'limitations':'Technical waveform checks do not replace listening or establish artistic acceptance.'}
        (temp/'audio-prepare.json').write_text(json.dumps(manifest,indent=2)+'\n')
        os.rename(temp,output)
    finally:
        shutil.rmtree(temp,ignore_errors=True)
    print(f'Prepared 1× ambient excerpt, hi-hat and controls: {output}',flush=True)


if __name__=='__main__':
    main()
