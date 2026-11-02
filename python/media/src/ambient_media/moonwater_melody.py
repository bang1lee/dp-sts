"""Low-register public-domain Gounod melody and renewed video energy mapping."""

import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np

from .moonwater import DURATION, FPS, SR, run, smooth


def main():
    out=Path('runs/dp-sts-moonwater-ave-v01')
    out.mkdir(parents=True,exist_ok=False)
    source=json.loads(Path('assets/scores/ave-maria/melody.json').read_text())
    mix=np.zeros((SR*DURATION,2),np.float32)
    seconds_per_beat=3.36
    events=[]
    for e in source['events']:
        at=15+e['beat']*seconds_per_beat
        duration=e['beats']*seconds_per_beat
        note=e['note']-24
        length=min(int((duration+.8)*SR),len(mix)-round(at*SR))
        if length<=0:
            continue
        t=np.arange(length,dtype=np.float32)/SR
        f=440*2**((note-69)/12)
        attack=min(.65,duration*.20)
        env=smooth(0,attack,t)*(1-smooth(duration*.88,duration+.8,t))
        # Gentle cello/organ-like fundamental with just enough harmonic definition.
        phase=2*np.pi*f*t+.025*np.sin(t*2*np.pi*.7)
        signal=(np.sin(phase)+.18*np.sin(2*phase)+.035*np.sin(3*phase))*env
        signal*=.14*(.8+.2*e['velocity']/90)
        start=round(at*SR)
        mix[start:start+length,0]+=signal*.73
        mix[start:start+length,1]+=signal*.70
        events.append({'t':at,'duration':duration,'note':note,'frequency':f})
    # A restrained root pulse leaves the melody, rather than a chord cloud, in front.
    for at in np.arange(20,565,2.5):
        t=np.arange(int(1.6*SR),dtype=np.float32)/SR
        pulse=np.sin(2*np.pi*43.6535*t)*(1-np.exp(-t/.14))*np.exp(-t/.40)*.017
        start=round(at*SR)
        mix[start:start+len(pulse)]+=pulse[:,None]
    # Long reflections remain well beneath the dry melody to retain note identity.
    for delay,gain in [(2.73,.10),(6.37,.065),(10.91,.035)]:
        d=round(delay*SR)
        mix[d:]+=mix[:-d,::-1]*gain
    for sec in range(DURATION):
        t=sec+np.arange(SR,dtype=np.float32)/SR
        mix[sec*SR:(sec+1)*SR]*=(smooth(0,12,t)*(1-smooth(568,600,t)))[:,None]
    mix*=.50/max(np.max(np.abs(mix)),1e-8)
    raw=out/'mix.f32';mix.astype('<f4').tofile(raw)
    wav=out/'dp-sts-moonwater-ave.wav'
    run(['ffmpeg','-v','error','-f','f32le','-ar',str(SR),'-ac','2','-i',str(raw),
         '-af','highpass=f=25,lowpass=f=1500','-c:a','pcm_s24le',str(wav)])
    del mix
    pcm=run(['ffmpeg','-v','error','-i',str(wav),'-f','f32le','pipe:1'],capture_output=True).stdout
    samples=np.frombuffer(pcm,dtype='<f4').reshape(-1,2)
    rms=np.sqrt(np.mean(samples.reshape(14400,2000,2)**2,axis=(1,2)))
    np.save(out/'rms.npy',rms)
    old=np.load('runs/dp-sts-moonwater-v02/rms.npy')
    ratio=(.91+.09*rms/max(np.percentile(rms,98),1e-8))/(.91+.09*old/max(np.percentile(old,98),1e-8))
    # Reuse the approved full geometry, replacing its low-depth brightness response.
    decoder=subprocess.Popen(['ffmpeg','-v','error','-i','runs/dp-sts-moonwater-v02/dp-sts-moonwater-10min.mp4',
        '-an','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
    movie=out/'dp-sts-moonwater-ave-10min.mp4'
    encoder=subprocess.Popen(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720',
        '-r',str(FPS),'-i','pipe:0','-i',str(wav),'-map','0:v','-map','1:a','-c:v','libx264',
        '-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k',
        '-movflags','+faststart',str(movie)],stdin=subprocess.PIPE)
    for i in range(14400):
        data=decoder.stdout.read(1280*720*3)
        if len(data)!=1280*720*3:
            raise RuntimeError(f'Incomplete decoded frame {i}')
        frame=np.frombuffer(data,dtype=np.uint8)
        frame=np.uint8(np.clip(frame.astype(np.float32)*ratio[i],0,255))
        encoder.stdin.write(frame.tobytes())
        if i%1440==0:
            print(f'Resound {i}/14400',flush=True)
    decoder.stdout.close();encoder.stdin.close()
    if decoder.wait()!=0 or encoder.wait()!=0:
        raise RuntimeError('Video processing failed')
    (out/'source.py').write_text(Path(__file__).read_text())
    (out/'melody.json').write_text(json.dumps(source,indent=2))
    (out/'render.json').write_text(json.dumps({'duration':600,'fps':24,'frames':14400,
        'source':source['source'],'source_edition':source['edition'],'transpose_semitones':-24,
        'melody_bpm':60/seconds_per_beat,'events':events,
        'sync':'Existing geometry and narrative, brightness remapped from old WAV RMS to new WAV RMS; approximate due to encoded pixels and additive particles',
        'audio':'New synthesis from public-domain melody; no recording sampled; no new Strudel query for this revision',
        'sha256':hashlib.file_digest(movie.open('rb'),'sha256').hexdigest()},indent=2))
    print(movie,flush=True)


if __name__=='__main__':
    main()
