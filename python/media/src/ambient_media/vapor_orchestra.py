"""Electronic chamber orchestra and perspective fractal vapor particles."""

import argparse
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np

from .moonwater import SR, run, smooth

FPS=24
OUT=Path('runs/dp-sts-vapor-base-v02')


def synth(e):
    kind=e['track'];duration=e['duration']
    length=duration+(.9 if kind in ['strings','pad','brass'] else .45)
    if kind in ['pulse','air','brush']:length=.35
    if kind in ['harp','guitarpick']:length=2.0
    t=np.arange(round(length*SR),dtype=np.float32)/SR
    f=440*2**((e['note']-69)/12);phase=2*np.pi*f*t
    if kind in ['strings','pad']:
        sig=sum(np.sin(phase*h+.06*np.sin(t*(3.7+h))) / h**1.8 for h in range(1,7))
        sig+=.18*np.sin(phase*1.002)
        env=smooth(0,min(4 if kind=='pad' else .45,duration*.22),t)*(1-smooth(duration*.85,length,t))
    elif kind=='woodwind':
        sig=np.sin(phase+.22*np.sin(phase*2))+.12*np.sin(phase*3)
        env=smooth(0,min(.12,duration*.2),t)*(1-smooth(duration*.92,length,t))
    elif kind=='brass':
        sig=np.tanh(1.2*(np.sin(phase)+.2*np.sin(phase*2)))
        env=np.sin(np.pi*np.clip(t/length,0,1))**2
    elif kind in ['guitar','guitarpick']:
        sig=np.zeros_like(t)
        # Pluck-position harmonics, frequency-dependent damping and wooden body.
        for h in range(1,13):
            sig+=np.sin(phase*h)*np.sin(h*np.pi*.23)/h**1.35*np.exp(-t*(.25+h*.17))
        sig+=.13*np.sin(2*np.pi*190*t)*np.exp(-t/.11)
        env=(1-np.exp(-t/.006))*(1-smooth(max(.1,length-.35),length,t))
    elif kind=='harp':
        sig=np.sin(phase)+.3*np.sin(phase*2)+.13*np.sin(phase*3)
        env=(1-np.exp(-t/.008))*np.exp(-t/.48)
    elif kind=='bass':
        sig=np.sin(phase)+.15*np.sin(phase*2)
        env=smooth(0,.035,t)*np.exp(-t/1.2)*(1-smooth(duration,length,t))
    elif kind=='pulse':
        sig=np.sin(phase+2*(1-np.exp(-t/.035)))
        env=(1-np.exp(-t/.009))*np.exp(-t/.095)
    else:
        rng=np.random.default_rng(int(e['t']*1000))
        sig=rng.normal(0,1,len(t)).astype(np.float32)
        sig=cv2.GaussianBlur(sig[:,None],(1,9),2)[:,0]
        env=(1-np.exp(-t/.018))*np.exp(-t/.085)
    return (sig*env*e['gain']).astype(np.float32)


def make_audio(out,score_path):
    score=json.loads(Path(score_path).read_text())
    mix=np.zeros((600*SR,2),np.float32)
    for e in score['events']:
        start=round(e['t']*SR)
        if start>=len(mix):continue
        signal=synth(e)[:len(mix)-start];pan=e['pan']
        mix[start:start+len(signal),0]+=signal*np.sqrt((1-pan)/2)
        mix[start:start+len(signal),1]+=signal*np.sqrt((1+pan)/2)
    for delay,gain in [(.37,.07),(.89,.055),(1.73,.04),(3.17,.025)]:
        n=round(delay*SR);mix[n:]+=mix[:-n,::-1]*gain
    for sec in range(600):
        t=sec+np.arange(SR)/SR
        mix[sec*SR:(sec+1)*SR]*=(smooth(0,8,t)*(1-smooth(578,600,t)))[:,None]
    mix*=.55/max(np.max(np.abs(mix)),1e-8)
    mix.astype('<f4').tofile(out/'mix.f32')
    run(['ffmpeg','-v','error','-f','f32le','-ar',str(SR),'-ac','2','-i',str(out/'mix.f32'),
         '-af','highpass=f=27,lowpass=f=11000,volume=-2dB','-c:a','pcm_s24le',str(out/'orchestra.wav')])
    raw=run(['ffmpeg','-v','error','-i',str(out/'orchestra.wav'),'-f','f32le','-ac','1','pipe:1'],capture_output=True).stdout
    pcm=np.frombuffer(raw,dtype='<f4');padded=np.pad(pcm,(4096,4096));window=np.hanning(8192)
    freqs=np.fft.rfftfreq(8192,1/SR);features=[]
    for i in range(14400):
        power=np.abs(np.fft.rfft(padded[i*2000:i*2000+8192]*window))**2
        features.append([np.sqrt(np.mean(pcm[i*2000:(i+1)*2000]**2))]+[np.sqrt(power[(freqs>=a)&(freqs<b)].sum()) for a,b in [(30,140),(140,1500),(1500,8000)]])
    values=np.array(features);values=np.clip(values/np.maximum(np.percentile(values,98,axis=0),1e-8),0,1)
    for i in range(1,len(values)):
        tau=np.where(values[i]>values[i-1],.25,1.8);values[i]=values[i-1]+(values[i]-values[i-1])*(1-np.exp(-1/(24*tau)))
    np.save(out/'features.npy',values)
    import hashlib
    (out/'audio-features.json').write_text(json.dumps({'frames':values.round(6).tolist(),'fps':24,'columns':['rms','low30_140','melody140_1500','upper1500_8000'],'wav_sha256':hashlib.file_digest((out/'orchestra.wav').open('rb'),'sha256').hexdigest()}))
    (out/'score.json').write_text(json.dumps(score,indent=2))


class Vapor:
    def __init__(self,sections=None):
        self.sections=sections
        rng=np.random.default_rng(20261102);n=32000
        # Nested branching offsets yield related structures at four spatial scales.
        anchors=np.array([[np.cos(a)*3.2,np.sin(a)*1.8,np.sin(a*3)*1.4] for a in np.linspace(0,2*np.pi,12,endpoint=False)])
        cluster=rng.integers(0,len(anchors),n)
        self.points=anchors[cluster]
        for scale,count in [(1.0,9),(.34,11),(.11,13),(.035,17)]:
            branches=rng.normal(0,scale,(count,3));self.points+=branches[rng.integers(0,count,n)]
        self.seed=rng.uniform(0,2*np.pi,(n,3));self.weight=rng.uniform(.25,1,n)*np.array([1.7,.3,.6,1.1,.35,.5,1.6,.4,.5,1.2,.4,.5])[cluster]
        theta=np.linspace(0,2*np.pi,n,endpoint=False)
        rad=3*(1+.065*np.cos(3*theta)+.025*np.sin(5*theta))
        self.ring=np.column_stack([rad*np.cos(theta),rad*.57*np.sin(theta),.25*np.sin(theta*3)])
        self.grid=np.mgrid[0:360,0:640].astype(np.float32)

    def frame(self,t,a):
        rms,low,mid,high=a
        diffusion=.035+.95*(.5+.5*np.sin(t*.047))**4+.025*high
        align=float(smooth(485,570,t))
        drift=np.sin(self.seed+t*np.array([.035,.023,.041]))
        points=self.points+drift*diffusion*(1-align)
        points=points*(1-align)+(self.ring+.06*drift)*align
        # Slow score-scale travel, with a small actual-WAV-derived approach offset.
        travel=(.5-.5*np.cos(2*np.pi*(t-20)/145))*(1-align)
        eye=np.array([1.5*np.sin(t*.014)*(1-align),.45*np.sin(t*.019)+.08*rms,10.5-5.6*travel-.35*mid])
        if self.sections:
            distances=[11,9,5.4,8.7,4.8,7,5.5,10.5,11]
            index=next((j for j,s in enumerate(self.sections) if s['start']<=t<s['end']),len(self.sections)-1)
            section=self.sections[index];u=float(smooth(section['start'],section['end'],t))
            distance=distances[index]*(1-u)+distances[index+1]*u
            eye[2]=distance-.35*mid
            travel=np.clip((11-distance)/6.2,0,1)
        target=np.array([.3*np.sin(t*.01),.1,0.0])
        forward=target-eye;forward/=np.linalg.norm(forward)
        right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward)
        q=points-eye;depth=q@forward
        x=320+420*(q@right)/np.maximum(depth,.3);y=180-420*(q@up)/np.maximum(depth,.3)
        valid=(depth>.7)&(x>1)&(x<639)&(y>1)&(y<359)
        frame=np.zeros((360,640,3),np.float32)
        yy,xx=self.grid
        frame[:,:,0]=.012*(1-yy/450);frame[:,:,1]=.007*(1-yy/450);frame[:,:,2]=.004
        # Moon retains a distant reference while near clouds show camera parallax.
        moon=np.array([.3,3.6,-8.0])-eye;md=moon@forward
        mx=320+420*(moon@right)/md;my=180-420*(moon@up)/md
        rr=np.sqrt((xx-mx)**2+(yy-my)**2)
        disc=(1-smooth(8,10,rr))*.23+np.exp(-(rr/28)**2)*.025
        frame+=disc[:,:,None]*np.array([1,.95,.85])
        focus=7.0-1.7*travel
        for lo,hi,sigma in [(0,1.1,.45),(1.1,2.6,1.4),(2.6,5,3.5),(5,100,7)]:
            mask=valid&(np.abs(depth-focus)>=lo)&(np.abs(depth-focus)<hi)
            layer=np.zeros((360,640),np.float32)
            ix=x[mask].astype(int);iy=y[mask].astype(int)
            energy=self.weight[mask]*(.085+.12*mid+.045*low)*(1-.4*align)
            np.add.at(layer,(iy,ix),energy)
            sigma+=diffusion*(1-align)*(.3 if lo==0 else 1.2)
            layer=cv2.GaussianBlur(layer,(0,0),sigma)
            frame+=layer[:,:,None]*np.array([.95,.83,.70])
        # Vapor bloom is energy-preserving blur, not solid filled blobs.
        frame+=cv2.GaussianBlur(frame,(0,0),5)*.35
        frame=1-np.exp(-frame*2.6)
        frame*=float(smooth(0,7,t)*(1-smooth(586,600,t)))
        return cv2.resize(np.uint8(np.clip(frame*255,0,255)),(1280,720),interpolation=cv2.INTER_CUBIC),{'eye':eye.tolist(),'diffusion':diffusion,'alignment':align,'visible_points':int(valid.sum())}


def main():
    p=argparse.ArgumentParser();p.add_argument('--audio',action='store_true');p.add_argument('--stills',action='store_true');p.add_argument('--out',default=str(OUT));p.add_argument('--score',default='compositions/vapor-orchestra/score.json');p.add_argument('--arranged-camera',action='store_true');args=p.parse_args()
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    if args.audio:
        if (out/'orchestra.wav').exists():raise FileExistsError('Preserve existing audio')
        make_audio(out,args.score);return
    sections=json.loads((out/'score.json').read_text())['sections'] if args.arranged_camera else None
    features=np.load(out/'features.npy');scene=Vapor(sections);tiles=[]
    for t in [45,120,230,330,430,565]:
        f,_=scene.frame(t,features[t*24]);cv2.imwrite(str(out/f'frame-{t}.png'),f);tiles.append(cv2.resize(f,(426,240)))
    cv2.imwrite(str(out/'contact-sheet.jpg'),np.vstack([np.hstack(tiles[:3]),np.hstack(tiles[3:])]))
    if args.stills:return
    movie=out/'vapor-base.mp4'
    if movie.exists():raise FileExistsError('Preserve existing video')
    encoder=subprocess.Popen(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','bgr24','-s','1280x720','-r','24','-i','pipe:0','-i',str(out/'orchestra.wav'),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k','-movflags','+faststart',str(movie)],stdin=subprocess.PIPE)
    telemetry=[]
    for i in range(14400):
        f,info=scene.frame(i/24,features[i]);encoder.stdin.write(f.tobytes())
        if i%720==0:print(f'{i}/14400',flush=True);telemetry.append({'t':i/24,**info})
    encoder.stdin.close()
    if encoder.wait()!=0:raise RuntimeError('Encoder failed')
    (out/'source.py').write_text(Path(__file__).read_text());(out/'camera.json').write_text(json.dumps(telemetry,indent=2))


if __name__=='__main__':main()
