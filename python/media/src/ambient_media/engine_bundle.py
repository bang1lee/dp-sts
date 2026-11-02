"""Export a portable, explicitly selected audio/timeline/Fourier bundle."""

import argparse
import csv
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np


def smooth(a, b, t):
    u = np.clip((t-a)/(b-a),0,1)
    return u*u*(3-2*u)


def sha(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle,'sha256').hexdigest()


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--audio',required=True)
    p.add_argument('--out',required=True)
    p.add_argument('--start',type=float,default=0)
    p.add_argument('--duration',type=float,default=30)
    args=p.parse_args()
    source=Path(args.audio).resolve()
    if not source.is_file() or not np.isfinite([args.start,args.duration]).all() or args.start<0 or args.duration<=0:
        p.error('Existing audio, finite nonnegative start and positive duration required')
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-of','json',str(source)]))
    if args.start+args.duration>float(probe['format']['duration'])+.001:
        p.error('Requested interval exceeds audio duration')
    if abs(args.duration*24-round(args.duration*24))>1e-7:
        p.error('Duration must contain a whole number of 24fps frames')
    out=Path(args.out)
    out.mkdir(parents=True,exist_ok=False)
    wav=out/'audio.wav'
    subprocess.run(['ffmpeg','-v','error','-i',str(source),'-ss',str(args.start),'-t',str(args.duration),
                    '-ar','48000','-ac','2','-c:a','pcm_s24le',str(wav)],check=True)
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(wav),'-f','f32le','pipe:1'])
    pcm=np.frombuffer(raw,dtype='<f4').reshape(-1,2)
    count=round(args.duration*24)
    if len(pcm)!=count*2000:
        raise ValueError('Decoded audio duration differs from requested frame count')
    blocks=pcm.reshape(count,2000,2)
    rms=np.sqrt(np.mean(blocks**2,axis=(1,2)))
    t=args.start+np.arange(count)/24
    channels=['rms','alignment','separation','breath']
    frames=np.column_stack([rms,smooth(350,555,t),smooth(190,325,t)*(1-smooth(355,510,t)),(.5-.5*np.cos(t*2*np.pi/12))])
    theta=np.arange(768)*2*np.pi/768
    curve=(1+.065*np.cos(3*theta)+.025*np.sin(5*theta))*np.exp(1j*theta)
    modes=np.array([-4,-2,1,4,6])
    coeff=(np.fft.fft(curve)/768)[modes%768]
    phases=np.random.default_rng(20261102).uniform(-np.pi,np.pi,(768,5))
    bundle={'version':1,'duration':args.duration,'fps':24,'sourceStart':args.start,
            'audio':{'file':'audio.wav','sha256':sha(wav),'sourceSha256':sha(source)},
            'channels':channels,'frames':frames.tolist(),
            'fourier':{'modes':modes.tolist(),'coefficients':[[z.real,z.imag] for z in coeff],'phases':phases.tolist()}}
    (out/'bundle.json').write_text(json.dumps(bundle,separators=(',',':')))
    with (out/'controls.csv').open('w') as handle:
        writer=csv.writer(handle)
        writer.writerow(['seconds',*channels])
        writer.writerows([[i/24,*row] for i,row in enumerate(frames.tolist())])
    for name in ['td_bridge.py','cables-op.js']:
        shutil.copy2(Path('packages/engine-bridge/adapters')/name,out/name)
    (out/'provenance.json').write_text(json.dumps({'source':str(source),'start':args.start,'duration':args.duration,
        'channels':{'rms':'measured from exported WAV','alignment':'Moonwater authored 350–555s curve',
                    'separation':'Moonwater authored 190–510s curve','breath':'authored 12s gesture; not measured breathing'},
        'scope':'Fourier points only; not a complete native scene or all environmental objects',
        'nativeStatus':'Import adapters supplied; native app validation separate'},indent=2))
    print(out.resolve())


if __name__=='__main__':
    main()
