"""Composed Folktronica: resonant strings, groove, granular transformations."""

import argparse
import json
from pathlib import Path

import numpy as np
from scipy.fft import irfft, next_fast_len, rfft, rfftfreq
from scipy.signal import butter, sosfilt

from .moonwater import SR, run, smooth


def noise(n,low,high,rng):
    sig=rng.normal(0,1,n).astype(np.float32)
    return sosfilt(butter(2,[low,high],btype='bandpass',fs=SR,output='sos'),sig)


def string(note,duration,seed):
    f=440*2**((note-69)/12);length=round(duration*SR);n=next_fast_len(length)
    rng=np.random.default_rng(seed);delay=SR/f;whole=int(delay);fraction=delay-whole
    excitation=np.zeros(n);excitation[:whole]=rng.normal(0,1,whole)*np.hanning(whole)
    omega=2*np.pi*rfftfreq(n)
    z=np.exp(-1j*omega)
    # Fractional delay waveguide with loss; finite rendered string, no sample asset.
    loop=np.exp(-1j*omega*whole)*((1-fraction)+fraction*z)
    transfer=1/(1-.992*loop*(.75+.25*z))
    result=irfft(rfft(excitation)*transfer,n)[:length]
    result=sosfilt(butter(2,6500,fs=SR,output='sos'),result)
    result/=max(.01,np.max(np.abs(result)))
    t=np.arange(length)/SR
    return result*(1-smooth(max(.02,duration-.18),duration,t))


def synth(e):
    kind=e['track'];dur=e['duration'];seed=int(e['t']*10000)+e['note']*101
    rng=np.random.default_rng(seed)
    length=dur+.45
    if kind in ['theme','pluck','answer']:length=max(1.5,min(5,dur+1.0))
    if kind=='kick':length=.5
    if kind in ['snare','shaker','rim']:length=.32
    if kind=='grain':length=2.3
    t=np.arange(round(length*SR),dtype=np.float32)/SR;f=440*2**((e['note']-69)/12);p=2*np.pi*f*t
    if kind in ['theme','pluck','answer']:
        sig=string(e['note'],length,seed)
        if kind=='theme':sig+=.18*np.sin(p)*smooth(0,.05,t)*np.exp(-t/1.3)
        if kind=='answer':sig+=.15*np.sin(p*2.01)*np.exp(-t/.20)
    elif kind=='reed':
        sig=(np.sin(p+.38*np.sin(p*2))+.18*np.sin(p*3))*smooth(0,.075,t)*(1-smooth(dur*.85,length,t))
    elif kind=='bass':
        sig=np.tanh(1.6*(np.sin(p)+.22*np.sin(p*2)))*smooth(0,.012,t)*np.exp(-t/.42)*(1-smooth(dur,length,t))
    elif kind=='kick':
        sig=np.sin(2*np.pi*(48*t+4.3*(1-np.exp(-t/.028))))*(1-np.exp(-t/.001))*np.exp(-t/.12)
        sig+=noise(len(t),1600,6500,rng)*np.exp(-t/.008)*.12
    elif kind=='snare':
        sig=(noise(len(t),700,7000,rng)*.7+np.sin(2*np.pi*185*t)*.25)*(1-np.exp(-t/.002))*np.exp(-t/.065)
    elif kind=='shaker':
        sig=noise(len(t),3500,12000,rng)*(1-np.exp(-t/.005))*np.exp(-t/.038)
    elif kind=='rim':
        sig=(np.sin(2*np.pi*840*t)+.6*np.sin(2*np.pi*1327*t))*(1-np.exp(-t/.001))*np.exp(-t/.018)
    elif kind=='cloud':
        sig=np.zeros(len(t))
        for detune in [-.003,0,.003]:
            for h in range(1,7):sig+=np.sin(p*h*(1+detune)+.12*np.sin(t*.7+h))/(h**1.6*3)
        sig*=smooth(0,1.4,t)*(1-smooth(dur*.7,length,t))
    elif kind in ['grain','reverse']:
        src=string(e['note'],length,seed)
        if kind=='reverse':sig=src[::-1]*smooth(0,.4,t)
        else:
            sig=np.zeros(len(t));width=round(.12*SR)
            for j in range(14):
                at=round(j*.14*SR);offset=int(rng.integers(0,len(src)-width));end=min(len(sig),at+width)
                sig[at:end]+=src[offset:offset+end-at]*np.hanning(width)[:end-at]*rng.uniform(.5,1)
    else:
        sig=noise(len(t),140,2800,rng)*.2*np.sin(np.pi*t/length)**2
        sig+=np.sin(p)*.15*np.sin(np.pi*t/length)**2
    return np.asarray(sig*e['gain'],dtype=np.float32)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out',default='runs/dp-sts-bloom-audio-v01');args=parser.parse_args()
    out=Path(args.out);out.mkdir(parents=True,exist_ok=False)
    score=json.loads(Path('compositions/folktronica-bloom/score.json').read_text())
    dry=np.zeros((600*SR,2),np.float32);wet=np.zeros_like(dry)
    for k,e in enumerate(score['events']):
        start=round(e['t']*SR)
        if start>=len(dry):continue
        sig=synth(e)[:len(dry)-start];pan=e['pan']
        dry[start:start+len(sig),0]+=sig*np.sqrt((1-pan)/2)
        dry[start:start+len(sig),1]+=sig*np.sqrt((1+pan)/2)
        if e['track'] not in ['kick','bass','snare','shaker','rim']:
            wet[start:start+len(sig),0]+=sig*np.sqrt((1-pan)/2)
            wet[start:start+len(sig),1]+=sig*np.sqrt((1+pan)/2)
        if k%500==0:print(f'Synthesize {k}/{len(score["events"])}',flush=True)
    for delay,gain in [(.357,.12),(.714,.08),(1.19,.055),(2.07,.04),(3.73,.025)]:
        n=round(delay*SR);dry[n:]+=wet[:-n,::-1]*gain
    del wet
    # Soft bus saturation adds body, preserving a wide headroom before final export.
    dry=np.tanh(dry*1.25)
    for sec in range(600):
        t=sec+np.arange(SR)/SR
        dry[sec*SR:(sec+1)*SR]*=(smooth(0,2,t)*(1-smooth(588,600,t)))[:,None]
    dry*=.66/max(np.max(np.abs(dry)),1e-8)
    dry.astype('<f4').tofile(out/'mix.f32')
    run(['ffmpeg','-v','error','-f','f32le','-ar',str(SR),'-ac','2','-i',str(out/'mix.f32'),'-af','highpass=f=27,lowpass=f=14500','-c:a','pcm_s24le',str(out/'bloom.wav')])
    run(['ffmpeg','-v','error','-ss','75','-i',str(out/'bloom.wav'),'-t','90','-c:a','pcm_s24le',str(out/'bloom-preview-90s.wav')])
    (out/'score.json').write_text(json.dumps(score,indent=2));(out/'source.py').write_text(Path(__file__).read_text())


if __name__=='__main__':main()
