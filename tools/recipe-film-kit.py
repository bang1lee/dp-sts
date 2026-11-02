#!/usr/bin/env python3
"""Create Ambient Lab's original, deterministic mono PCM drum one-shots.

The generated sounds are synthesized from noise and oscillators. No outside recordings
or artist samples are used. The checked-in WAVs are the samples used in the mix.
"""
import hashlib
import json
import math
import random
import struct
import wave
from pathlib import Path

RATE = 48000
ROOT = Path('assets/original-kit')
VOICES = {
    'kick': (0.32, 'Descending sine body with a short noise transient'),
    'snare': (0.27, 'Filtered noise with a decaying low tonal body'),
    'hat': (0.13, 'Short high-frequency noise and metallic tones'),
    'rim': (0.18, 'Tuned wooden-metallic transient with a short noise burst'),
}


def synth(name, duration):
    rng=random.Random(20261103 + list(VOICES).index(name))
    samples=[]
    phase=0.0
    previous=0.0
    for i in range(round(duration*RATE)):
        t=i/RATE
        noise=rng.uniform(-1,1)
        high=noise-previous*.93
        previous=noise
        if name=='kick':
            frequency=47+123*math.exp(-t*38)
            phase += 2*math.pi*frequency/RATE
            value=math.sin(phase)*math.exp(-t*14)+noise*.13*math.exp(-t*110)
            value=math.tanh(value*1.5)
        elif name=='snare':
            body=math.sin(2*math.pi*185*t)*math.exp(-t*19)
            value=.62*high*math.exp(-t*17)+.38*body
        elif name=='hat':
            metal=math.sin(2*math.pi*6079*t)+.6*math.sin(2*math.pi*8291*t)
            value=(.48*high+.23*metal)*math.exp(-t*44)
        else:
            metal=math.sin(2*math.pi*690*t)+.5*math.sin(2*math.pi*1127*t)
            value=.5*metal*math.exp(-t*30)+.22*high*math.exp(-t*75)
        fade=min(1,max(0,(duration-t)/.008))
        samples.append(value*fade)
    peak=max(map(abs,samples)) or 1
    return [max(-32768,min(32767,round(v/peak*.92*32767))) for v in samples]


def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    files=[]
    for name,(duration,description) in VOICES.items():
        target=ROOT/(name+'.wav')
        if target.exists(): raise FileExistsError(f'Preserving existing sample: {target}')
        samples=synth(name,duration)
        with wave.open(str(target),'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE)
            w.writeframes(struct.pack('<'+'h'*len(samples),*samples))
        files.append({'id':name,'file':target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'frames':len(samples),'description':description})
    manifest={'version':1,'id':'ambient-lab-original-kit-v1','sampleRate':RATE,
              'origin':'original-procedural-one-shots','license':'project-original-not-publicly-licensed',
              'generator':'tools/recipe-film-kit.py','files':files}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Created {len(files)} original WAV one-shots in {ROOT}')


if __name__=='__main__': main()
