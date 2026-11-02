"""Thirty-second dp-sts body-flow revision; preserves the full-length master."""
import hashlib
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np

from . import psy_audio as sound
from .psy_visual import Renderer

ROOT = Path.cwd()
OUT = ROOT / 'runs/dp-sts-body-flow-v01'
SR = 48000
FPS = 30
DURATION = 30


def breath(t):
    return 0.5 - 0.5 * np.cos(2 * np.pi * t / 5)


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


class Features:
    def __init__(self, frames):
        self.frames = frames

    def at(self, t):
        return self.frames[min(899, max(0, round((t - 40) * FPS)))]


class BodyRenderer(Renderer):
    def positions(self, t, index, local, audio):
        p = super().positions(t, index, local, audio)
        seconds = t - 40
        expansion = breath(seconds)
        p *= 1.05 + 0.27 * expansion
        radius = np.linalg.norm(p, axis=1)
        wave = np.exp(-((radius - (seconds * 1.7 % 1.8)) / 0.19) ** 2)
        p *= (1 + 0.045 * float(audio[4]) * wave)[:, None]
        p[:, 2] += 0.16 * np.sin(p[:, 1] * 2.3 + seconds * 0.19) * expansion
        p[:, 0] += 0.06 * np.sin(seconds * 0.14)
        return p


def main():
    OUT.mkdir(parents=True, exist_ok=False)
    score = json.loads((ROOT / 'runs/psytrance-audio-v02/score.json').read_text())
    n = SR * DURATION
    mix = np.zeros((n, 2), dtype=np.float32)
    gains = {'bass': .23, 'hat': .14, 'tick': .09, 'openhat': .11,
             'clap': .11, 'perc': .12, 'tom': .13, 'snare': .1,
             'acid': .105, 'lead': .09, 'bell': .06, 'fm': .04}
    # Revoice the existing Strudel-derived first-return passage, not a new score label.
    for e in score['events']:
        if 300 <= e['t'] < 330 and e['track'] in gains:
            at = e['t'] - 300
            signal = sound.synth(e['track'], e['note'], e.get('variant', 0), e['duration'])
            gain = gains[e['track']] * e.get('velocity', 1)
            if e['track'] in ('acid', 'lead', 'fm', 'bell'):
                gain *= .45 + .55 * breath(at)
            sound.add(mix, signal, at, gain, e.get('pan', 0))
    for beat in range(72):
        at = beat * sound.BEAT
        sound.add(mix, sound.synth('kick', 30, 0, .34), at, .5 * (1 if beat % 2 == 0 else .86))
        if beat % 2 == 0:
            tt = np.arange(int(.20 * SR)) / SR
            pulse = np.sin(2*np.pi*(58*tt + .6*(1-np.exp(-tt/.02))))
            pulse *= sound.envelope(tt, .004, .045) * np.minimum(1, (.2-tt)/.012)
            sound.add(mix, pulse.astype(np.float32), at + .18, .22)
    t = np.arange(n) / SR
    b = breath(t)
    # Air and harmonic bed carry the long gesture; the kick is not volume-pumped.
    air = sound.band_noise(n, 450, 2900) * (.003 + .013 * b**1.6)
    mix[:, 0] += air * (.8 + .2 * np.sin(t*.31))
    mix[:, 1] += air * (.8 - .2 * np.sin(t*.31))
    for j, note in enumerate([42, 49, 57]):
        f = sound.hz(note)
        pad = np.sin(2*np.pi*f*t + .35*np.sin(t*.24+j))
        pad += .19 * b * np.sin(2*np.pi*f*2*t)
        pad *= .016 * (.25 + .75*b) * (.65+.35*np.minimum(1, (t/sound.BEAT%1)/.28))
        mix[:, j % 2] += pad
        mix[:, 1-j % 2] += pad*.65
    fade = np.minimum(1, t/.45) * np.minimum(1, (DURATION-t)/1.3)
    mix *= fade[:, None]
    mix *= .73 / max(np.max(np.abs(mix)), 1e-6)
    (OUT/'mix.f32').write_bytes(mix.astype('<f4').tobytes())
    wav = OUT/'dp-sts-body-flow.wav'
    run(['ffmpeg','-v','error','-f','f32le','-ar',str(SR),'-ac','2','-i',str(OUT/'mix.f32'),
         '-af','highpass=f=22,lowpass=f=12000','-c:a','pcm_s24le',str(wav)])
    pcm = run(['ffmpeg','-v','error','-i',str(wav),'-f','f32le','pipe:1'], capture_output=True).stdout
    samples = np.frombuffer(pcm, dtype='<f4').reshape(-1,2)
    frequencies = np.fft.rfftfreq(1600, 1/SR)
    frames = []
    for block in samples.reshape(900,1600,2):
        power = np.abs(np.fft.rfft(block.mean(axis=1)*np.hanning(1600)))**2
        frames.append([np.sqrt(np.mean(block**2))]+[np.sqrt(power[(frequencies>=lo)&(frequencies<hi)].sum()) for lo,hi in [(25,180),(180,3000),(3000,16000)]])
    frames = np.array(frames)
    flux = np.maximum(0,np.diff(frames[:,1],prepend=0))
    frames = np.column_stack([frames, flux])
    frames = np.clip(frames / np.maximum(1e-8,np.percentile(frames,98,axis=0)),0,1)
    (OUT/'features.json').write_text(json.dumps(frames.tolist()))
    renderer = BodyRenderer(Features(frames),1280,720,65536)
    movie = OUT/'dp-sts-body-flow-30s.mp4'
    cmd = ['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','gray','-s','1280x720','-r','30','-i','pipe:0',
           '-i',str(wav),'-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-crf','18',
           '-pix_fmt','yuv420p','-c:a','aac','-b:a','320k','-movflags','+faststart','-metadata','title=dp-sts — body flow',str(movie)]
    encoder = subprocess.Popen(cmd,stdin=subprocess.PIPE)
    tiles=[]
    for i in range(900):
        frame,_ = renderer.frame(40+i/FPS)
        frame = np.uint8(frame.astype(np.float32)*min(1,(i/FPS)/.45)*min(1,(30-i/FPS)/1.3))
        encoder.stdin.write(frame.tobytes())
        if i in [60,135,210,360,510,735]:
            tiles.append(cv2.resize(frame,(426,240)))
        if i%150==0:
            print(f'Render {i}/900',flush=True)
    encoder.stdin.close()
    if encoder.wait()!=0:
        raise RuntimeError('Encoder failed')
    cv2.imwrite(str(OUT/'contact-sheet.png'),np.vstack([np.hstack(tiles[:3]),np.hstack(tiles[3:])]))
    (OUT/'source.py').write_text(Path(__file__).read_text())
    (OUT/'render.json').write_text(json.dumps({'title':'dp-sts','revision':'body-flow-v01','duration':30,'fps':30,'size':[1280,720],
        'score_source':'psytrance-audio-v02/score.json; events300–330s revoiced','bpm':144,'breath_phrase_seconds':5,
        'audio_features':'Measured from sample WAV; RMS, FFT bands and positive low-band flux',
        'video_sha256':hashlib.sha256(movie.read_bytes()).hexdigest(),'perceptual_status':'User comparison sample; no claim of direct auditory approval'},indent=2))
    print(movie,flush=True)


if __name__ == '__main__':
    main()
