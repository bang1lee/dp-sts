"""Moonlit underwater procedural film; new score and preserved render provenance."""

import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path

import cv2
import numpy as np

SR = 48000
FPS = 24
DURATION = 600


def smooth(a, b, t):
    x = np.clip((t-a)/(b-a), 0, 1)
    return x*x*(3-2*x)


def separation(t):
    return float(smooth(190, 325, t)*(1-smooth(355, 510, t)))


def run(command, **kwargs):
    return subprocess.run(command, check=True, **kwargs)


def audio(out, score):
    mix = np.zeros((SR*DURATION, 2), dtype=np.float32)
    for e in score['events']:
        start = round(e['t']*SR)
        length = min(round(e['duration']*SR), len(mix)-start)
        if length <= 0:
            continue
        t = np.arange(length, dtype=np.float32)/SR
        f = 440*2**((e['note']-69)/12)
        if e['track'] == 'pulse':
            env = (1-np.exp(-t/.11))*np.exp(-t/.32)
            sig = np.sin(2*np.pi*f*t)*env
        elif e['track'] == 'tide':
            env = np.sin(np.pi*np.minimum(t/e['duration'], 1))**2
            sig = (np.sin(2*np.pi*f*t+.12*np.sin(t*.19))
                   + .15*np.sin(2*np.pi*f*2*t))*env
        else:
            env = (1-np.exp(-t/1.8))*np.exp(-t/4.5)
            sig = (np.sin(2*np.pi*f*t)+.09*np.sin(2*np.pi*f*2.002*t))*env
        sig = sig.astype(np.float32)*e['velocity']
        pan = e.get('pan', 0)
        mix[start:start+length, 0] += sig*np.sqrt((1-pan)/2)
        mix[start:start+length, 1] += sig*np.sqrt((1+pan)/2)
    # Quiet, correlated underwater texture; no busy percussion or added melody.
    rng = np.random.default_rng(score['seed'])
    for second in range(DURATION):
        t = second+np.arange(SR, dtype=np.float32)/SR
        noise = rng.normal(0, 1, SR).astype(np.float32)
        noise = cv2.GaussianBlur(noise[:, None], (1, 121), 18)[:, 0]
        gain = .002*(.7+.3*np.sin(t*.12))
        mix[second*SR:(second+1)*SR] += (noise*gain)[:, None]
    # Long, quiet diffuse taps: off-grid delays avoid a rhythmic echo pattern.
    for delay, gain in [(1.71,.16),(3.83,.12),(7.13,.08),(11.79,.04)]:
        d = int(delay*SR)
        mix[d:] += mix[:-d, ::-1]*gain
    for second in range(DURATION):
        t = second+np.arange(SR, dtype=np.float32)/SR
        mix[second*SR:(second+1)*SR] *= (smooth(0, 18, t)*(1-smooth(574,600,t)))[:,None]
    mix *= .42/max(float(np.max(np.abs(mix))), 1e-8)
    raw = out/'mix.f32'
    mix.astype('<f4').tofile(raw)
    wav = out/'dp-sts-moonwater.wav'
    run(['ffmpeg','-v','error','-f','f32le','-ar',str(SR),'-ac','2','-i',str(raw),
         '-af','highpass=f=28,lowpass=f=6500','-c:a','pcm_s24le',str(wav)])
    del mix
    decoded = run(['ffmpeg','-v','error','-i',str(wav),'-f','f32le','pipe:1'],capture_output=True).stdout
    pcm = np.frombuffer(decoded, dtype='<f4').reshape(-1,2)
    rms = np.sqrt(np.mean(pcm.reshape(DURATION*FPS, SR//FPS, 2)**2,axis=(1,2)))
    np.save(out/'rms.npy',rms)
    return rms


class Water:
    def __init__(self):
        self.w, self.h = 640, 360
        yy, xx = np.mgrid[0:self.h,0:self.w].astype(np.float32)
        self.px, self.py = xx, yy
        self.x = (xx-self.w/2)/(self.w/2)
        self.y = yy/self.h
        rng = np.random.default_rng(20261102)
        self.dust = rng.uniform(0,1,(95,4))
        # Discrete Fourier coefficients of a closed, gently rippled lunar ring.
        self.theta = np.linspace(0,2*np.pi,768,endpoint=False)
        contour = (1+.065*np.cos(3*self.theta)+.025*np.sin(5*self.theta))*np.exp(1j*self.theta)
        spectrum = np.fft.fft(contour)/len(contour)
        self.modes = np.array([-4,-2,1,4,6])
        self.coefficients = spectrum[self.modes % len(contour)]
        self.phase_offsets = rng.uniform(-np.pi,np.pi,(len(self.theta),len(self.modes)))
        self.scatter = rng.normal(0,1,(len(self.theta),2))

    def frame(self, t, energy=.4):
        x,y = self.x,self.y
        split = separation(t)
        drift = .025*np.sin(t*.023)
        mx = .12 + .055*np.sin(t*.009)
        my = .265 + .018*np.sin(t*.014)
        # Waves distort the transmission of the lunar disc and silver surface.
        a = np.sin(12*x+17*y-t*.19)
        b = np.sin(-21*x+29*y+t*.13)
        c = np.sin(39*x+45*y-t*.10+1.4*a)
        wx = x+drift+.014*a+.006*b
        wy = y+.009*b+.004*c
        r = np.sqrt(((x+drift+.004*a+.002*b-mx)/.073)**2+((y+.003*b+.001*c-my)/.065)**2)
        disc = (1-smooth(.88,1.05,r))
        lunar = disc*(.83+.07*np.sin(wx*97+wy*55)*np.sin(wy*103))
        halo = np.exp(-r*r*.18)*.13
        # Broad curved Snell-like window overhead, with rolling surface ridges.
        window = np.exp(-((x-mx)/1.03)**4-((y-.30)/.37)**4)
        ripple = (.5+.5*np.sin(43*wy+3*a+1.1*b))**15
        facets = (.5+.5*np.sin(71*wx+6*b+3*c))**10
        path = np.exp(-((wx-mx)/(.13+.52*np.abs(y-my)))**2)
        glints = ripple*(.15+.85*facets)*path*window
        glints *= (1-.82*disc)
        surface = .026*window + .012*ripple*window + .65*glints
        luminous = lunar*.69+halo+surface
        # Dim refracted copies gradually separate and then return into one field.
        if split > .001:
            for side in [-1,1]:
                mapx = (self.px+side*split*(92+18*np.sin(y*8+t*.012))).astype(np.float32)
                mapy = (self.py+split*(15*np.sin(x*5+side)+side*22)).astype(np.float32)
                echo = cv2.remap(luminous,mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
                luminous += echo*(.18*split)
        # Light shafts descend from the surface into dark water, revealing depth.
        depth = smooth(.35,.8,y)
        rayx = (x-mx)/(np.maximum(.10,y-my))
        shafts = np.exp(-rayx*rayx*.55)*(.5+.5*np.sin(rayx*12+t*.04))**8
        shafts *= depth*np.exp(-2.8*(y-.3))*.055
        luminous += shafts
        luminous += cv2.GaussianBlur(luminous,(0,0),3)*.22
        luminous *= .91+.09*energy
        vignette = np.clip(1-.30*x*x-.23*y*y,.35,1)
        rgb = np.empty((self.h,self.w,3),np.float32)
        # OpenCV BGR: faint blue-green depths, near-neutral silver highlights.
        for ch,(base,scale) in enumerate([(0.027,.95),(.017,.90),(.008,.83)]):
            rgb[:,:,ch] = (base*(1-.75*y)+luminous*scale)*vignette
        dust_layer = np.zeros_like(rgb)
        for u,v,z,p in self.dust:
            px = int(((u+.006*np.sin(t*.013+p*6))%1)*self.w)
            py = int(((v+t*.00035*(.3+z))%1)*self.h)
            val = .015+.025*z
            cv2.circle(dust_layer,(px,py),1,(val*1.2,val,val*.8),-1)
        rgb += dust_layer
        # All narrative fragments share the same Fourier target, with their phase
        # disorder smoothly vanishing. Static dust remains environmental texture.
        emergence = float(smooth(170,250,t))
        alignment = float(smooth(350,555,t))
        if emergence > 0:
            phase = self.theta[:,None]*self.modes[None,:]
            phase += self.phase_offsets*(1-alignment)*1.25
            wave = np.sum(self.coefficients[None,:]*np.exp(1j*phase),axis=1)
            scatter = (1-alignment)*(.38+.12*np.sin(t*.02))
            xx = mx+.46*wave.real+self.scatter[:,0]*scatter*.20
            yy = my+.23*wave.imag+self.scatter[:,1]*scatter*.16
            points = np.column_stack([(xx+1)*self.w/2, yy*self.h]).astype(np.int32)
            layer = np.zeros_like(rgb)
            glow = (.06+.12*alignment)*emergence
            for px,py in points:
                if 0<=px<self.w and 0<=py<self.h:
                    layer[py,px] += [glow,glow*.93,glow*.83]
            rgb += layer+cv2.GaussianBlur(layer,(0,0),1.3)*.65
        fade = smooth(0,12,t)*(1-smooth(586,600,t))
        rgb = np.uint8(np.clip(rgb*fade*255,0,255))
        return cv2.resize(rgb,(1280,720),interpolation=cv2.INTER_CUBIC)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',default='runs/dp-sts-moonwater-v01')
    parser.add_argument('--stills',action='store_true')
    args=parser.parse_args()
    out=Path(args.out)
    out.mkdir(parents=True,exist_ok=True)
    renderer=Water()
    times=[45,140,260,335,430,565]
    tiles=[]
    for t in times:
        frame=renderer.frame(t)
        cv2.imwrite(str(out/f'frame-{t:03}.png'),frame)
        tile=cv2.resize(frame,(426,240))
        cv2.putText(tile,f'{t//60:02}:{t%60:02}',(12,224),cv2.FONT_HERSHEY_SIMPLEX,.45,(170,170,170),1)
        tiles.append(tile)
    cv2.imwrite(str(out/'contact-sheet.png'),np.vstack([np.hstack(tiles[:3]),np.hstack(tiles[3:])]))
    if args.stills:
        return
    movie=out/'dp-sts-moonwater-10min.mp4'
    if movie.exists():
        raise FileExistsError('Use a new output directory; preserve earlier movies.')
    scorepath=Path('compositions/moonwater/score.json')
    score=json.loads(scorepath.read_text())
    rms=audio(out,score)
    energy=rms/max(np.percentile(rms,98),1e-8)
    encoder=subprocess.Popen(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','bgr24','-s','1280x720',
        '-r',str(FPS),'-i','pipe:0','-i',str(out/'dp-sts-moonwater.wav'),'-map','0:v','-map','1:a',
        '-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k',
        '-movflags','+faststart','-metadata','title=dp-sts — moonwater',str(movie)],stdin=subprocess.PIPE)
    started=time.monotonic()
    try:
        for i in range(DURATION*FPS):
            encoder.stdin.write(renderer.frame(i/FPS,float(energy[i])).tobytes())
            if i % 720 == 0:
                print(f'{i}/{DURATION*FPS} frames; {time.monotonic()-started:.1f}s elapsed',flush=True)
    finally:
        encoder.stdin.close()
    if encoder.wait()!=0:
        raise RuntimeError('Encoding failed')
    (out/'source.py').write_text(Path(__file__).read_text())
    (out/'score.json').write_text(scorepath.read_text())
    manifest={'duration':600,'fps':FPS,'frames':14400,'size':[1280,720],
        'visual_method':'Procedural refracted moon, surface ridges, light shafts and layered refraction; not a physical optics simulation',
        'audio_method':score['method'],'sections':score['sections'],
        'sync':'Shared narrative plus WAV-derived frame RMS; no claim of direct auditory approval',
        'video_sha256':hashlib.file_digest(movie.open('rb'),'sha256').hexdigest()}
    (out/'render.json').write_text(json.dumps(manifest,indent=2))
    print(movie,flush=True)


if __name__=='__main__':
    main()
