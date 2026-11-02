"""PHASE BLOOM: Strudel-scored, deterministic offline psytrance synthesis."""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import time
from pathlib import Path

import numpy as np

SR = 48000
BEAT = 60 / 144
BAR = BEAT * 4
RNG = np.random.default_rng(81273)


def hz(note: float) -> float:
    return 440 * 2 ** ((note - 69) / 12)


def envelope(t: np.ndarray, attack: float, decay: float) -> np.ndarray:
    return (1 - np.exp(-t / attack)) * np.exp(-t / decay)


def band_noise(n: int, low: float, high: float) -> np.ndarray:
    noise = RNG.normal(0, 1, n)
    spectrum = np.fft.rfft(noise)
    freq = np.fft.rfftfreq(n, 1 / SR)
    spectrum *= (1 - np.exp(-(freq / low) ** 4)) * np.exp(-(freq / high) ** 4)
    signal = np.fft.irfft(spectrum, n)
    return signal / max(0.01, np.std(signal))


def synth(track: str, note: int, variant: int, duration: float) -> np.ndarray:
    length = {'kick': .34, 'bass': .098, 'hat': .09, 'tick': .048,
              'clap': .22, 'openhat': .31, 'perc': .18, 'snare': .19,
              'tom': .25, 'acid': .26, 'lead': .34, 'bell': 1.7}.get(track, duration)
    t = np.arange(round(length * SR), dtype=np.float64) / SR
    frequency = hz(note)
    if track == 'kick':
        # Fast upper pitch bend, independently tuned sub body, short click.
        f = hz(30) + 128 * np.exp(-t / .012) + 24 * np.exp(-t / .052)
        phase = 2 * np.pi * np.cumsum(f) / SR
        body = np.sin(phase) * envelope(t, .00065, .085)
        body += .16 * np.sin(2 * phase) * np.exp(-t / .018)
        click = band_noise(len(t), 1800, 11000) * np.exp(-t / .0021) * .075
        signal = np.tanh(body * 1.35) * .8 + click
    elif track == 'bass':
        phase = 2 * np.pi * frequency * t
        cutoff = 360 + (1400 + variant * 80) * np.exp(-t / .018)
        signal = np.zeros_like(t)
        for harmonic in range(1, 25):
            amplitude = np.exp(-(frequency * harmonic / cutoff) ** 1.6) / harmonic
            signal += np.sin(harmonic * phase + .08 * (harmonic % 3)) * amplitude
        signal = np.tanh(signal * 1.65) * envelope(t, .0014, .045)
        signal *= np.minimum(1, (length - t) / .009)
    elif track in ('hat', 'tick', 'openhat'):
        decay = {'hat': .022, 'tick': .012, 'openhat': .09}[track]
        noise = band_noise(len(t), 6500 if track == 'tick' else 4700, 15500)
        metal = sum(np.sin(2*np.pi*f*t) for f in [6101, 8197, 10321]) / 3
        signal = (noise * .62 + metal * .13) * envelope(t, .0004, decay)
    elif track in ('snare', 'clap'):
        noise = band_noise(len(t), 1000 if track == 'snare' else 700, 11000)
        env = envelope(t, .0005, .038 if track == 'snare' else .055)
        if track == 'clap':
            env *= .5 + .5 * np.minimum(1, (t % .010) / .001)
        body = np.sin(2*np.pi*(185*t+2*(1-np.exp(-t/.02)))) * np.exp(-t/.025)
        signal = noise * env * .6 + body * .22
    elif track in ('perc', 'tom'):
        frequency = hz(note) if track == 'tom' else 260 + variant * 35
        phase = 2*np.pi*(frequency*t+frequency*.018*(1-np.exp(-t/.018)))
        signal = (np.sin(phase)+.25*np.sin(phase*1.57)) * envelope(t,.0006,.055)
    elif track in ('acid', 'lead'):
        cutoff = (850 + variant * 170) * np.exp(-t / .1) + 400
        signal = np.zeros_like(t)
        for harmonic in range(1, 19):
            resonance = 1 + 1.7*np.exp(-((frequency*harmonic-cutoff)/np.maximum(100,cutoff*.14))**2)
            amp = resonance / harmonic / (1+(frequency*harmonic/cutoff)**4)
            phase = 2*np.pi*frequency*harmonic*t + .035*np.sin(2*np.pi*5.7*t)
            signal += np.sin(phase) * amp
            if track == 'lead':
                signal += .3*np.sin(phase*1.003) * amp
        signal = np.tanh(signal*1.2) * envelope(t,.003,.085 if track=='acid' else .13)
        signal *= np.minimum(1,(length-t)/.018)
    elif track == 'bell':
        signal = np.sin(2*np.pi*frequency*t+2.8*np.sin(2*np.pi*frequency*2.001*t)*np.exp(-t/.22))
        signal *= envelope(t,.003,.42)
    elif track == 'fm':
        carrier = frequency * (1 + .16*np.sin(2*np.pi*.7*t))
        phase = np.cumsum(carrier)*2*np.pi/SR
        signal = np.sin(phase+(3+2*np.sin(t*4))*np.sin(phase*1.501))
        signal *= np.sin(np.pi*t/length)**2 * .6
    elif track == 'impact':
        noise = band_noise(len(t), 900, 14500)
        signal = noise*envelope(t,.001,.64)*.24
        signal += np.sin(2*np.pi*(46*t+4*(1-np.exp(-t/.2))))*envelope(t,.002,.28)*.6
    elif track == 'riser':
        # Brightening noise + rising, accelerating two-operator texture.
        noise = band_noise(len(t), 1400, 14000)
        ramp = t/length
        phase = np.cumsum(170*2**(ramp*3.5))*2*np.pi/SR
        signal = (noise*.28+np.sin(phase+1.5*np.sin(phase*1.503))*.18)
        signal *= ramp**1.6 * (.65+.35*np.sin(2*np.pi*(2*t+4*t*t/length)))
        signal *= np.minimum(1,(length-t)/.025)
    else:
        raise ValueError(track)
    signal *= np.minimum(1, t/.00025) * np.minimum(1, (length-t)/.002)
    return signal.astype(np.float32)


def add(mix: np.ndarray, signal: np.ndarray, start: float, gain: float, pan: float = 0) -> None:
    offset = round(start * SR)
    length = min(len(signal), len(mix) - offset)
    if length <= 0:
        return
    angle = (pan+1)*np.pi/4
    mix[offset:offset+length,0] += signal[:length] * (gain * np.cos(angle))
    mix[offset:offset+length,1] += signal[:length] * (gain * np.sin(angle))


def render(score: dict, output: Path) -> Path:
    started=time.monotonic()
    n=round(score['duration']*SR)
    mix=np.memmap(output/'mix.f32', mode='w+', dtype='<f4', shape=(n,2))
    mix[:]=0
    cache={}
    gains={'kick':1.12,'bass':.57,'hat':.62,'tick':.55,'openhat':.65,'clap':.70,
           'perc':.60,'tom':.64,'snare':.7,'acid':.55,'lead':.72,'bell':.7,'fm':.6,'riser':.7,'impact':.55}
    delayed={'acid':(.31,.22), 'lead':(.42,.30), 'bell':(.5,.4), 'fm':(.36,.3)}
    for index,event in enumerate(score['events']):
        track=event['track']
        if track=='pad':
            continue
        variant=event.get('variant',0)
        key=(track,event['note'],variant, round(event['duration'],4) if track in ('fm','riser','impact') else 0)
        if key not in cache:
            cache[key]=synth(track,event['note'],variant,event['duration'])
        signal=cache[key]
        velocity=event.get('velocity',1)*gains[track]
        # Musical light/heavy subdivision accents; deterministic, no timing drift.
        if track in ('bass','tick','hat','acid'):
            velocity *= [.92,.82,1,.9][round((event['t']/BEAT)%4*4)%4]
        add(mix,signal,event['t'],velocity,event.get('pan',0))
        if track in delayed:
            send,feedback=delayed[track]
            for repeat in range(1,6):
                add(mix,signal,event['t']+BEAT*.75*repeat,velocity*send*feedback**((repeat-1)*.6),(-1 if repeat%2 else 1)*.68)
        if index%3000==0:
            print(f'Synthesis {index}/{len(score["events"])} events, {time.monotonic()-started:.1f}s',flush=True)
    # Slow evolving wide harmonic bed. Each eight-bar chord overlaps smoothly.
    for event in score['events']:
        if event['track']!='pad':
            continue
        length=event['duration']+2
        t=np.arange(round(length*SR))/SR
        env=np.minimum(1,t/2.5)*np.minimum(1,(length-t)/3)
        intervals=[0,3,7,14] if event['note']%12==6 else [0,4,7,14]
        position=(event['t']+t)/BEAT%1
        duck=.38+.62*np.minimum(1,position/.35)
        section=next(s for s in score['sections'] if s['start']<=event['t']<s['end'])
        if section['id'] in (0,5,8,11):
            duck=np.ones_like(t)
        for i,interval in enumerate(intervals):
            f=hz(event['note']+interval)
            wave=np.sin(2*np.pi*f*t+.6*np.sin(t*.17+i))
            wave+=.32*np.sin(2*np.pi*f*1.002*t+i)
            wave+=.12*np.sin(2*np.pi*f*2*t)
            wave=wave*env*duck
            add(mix,wave.astype(np.float32),event['t'],event['velocity']*.31,(i-1.5)*.47)
    # Continuous quiet air creates depth without a tiled loop.
    for block in range(60):
        t=np.arange(10*SR)/SR+block*10
        wind=band_noise(len(t),1800,6000).astype(np.float32)
        wind*=.003*(.6+.4*np.sin(t*.19))
        wind[:240]*=np.linspace(0,1,240)
        wind[-240:]*=np.linspace(1,0,240)
        add(mix,wind,block*10,1,math.sin(block*.41)*.65)
    for transition in score.get('transitions',[]):
        if transition['kind']=='half-beat-vacuum':
            start=round(transition['start']*SR)
            end=round(transition['end']*SR)
            fade_samples=round(transition['fadeSeconds']*SR)
            mix[start:start+fade_samples]*=np.linspace(1,0,fade_samples,dtype=np.float32)[:,None]
            mix[start+fade_samples:end]=0
            mix[end:end+144]*=np.linspace(0,1,144,dtype=np.float32)[:,None]
    fade=round(3*SR)
    mix[:fade]*=np.linspace(0,1,fade,dtype=np.float32)[:,None]
    fadeout=round(10*SR)
    mix[-fadeout:]*=np.linspace(1,0,fadeout,dtype=np.float32)[:,None]**1.5
    peak=float(np.max(np.abs(mix)))
    mix*=.86/peak
    mix.flush()
    print(f'Premaster peak {peak:.4f}; synthesized in {time.monotonic()-started:.1f}s',flush=True)
    return output/'mix.f32'


def master(raw: Path, output: Path) -> Path:
    base=['ffmpeg','-hide_banner','-nostdin','-y','-f','f32le','-ar',str(SR),'-ac','2','-i',str(raw)]
    first=subprocess.run(base+['-af','highpass=f=18,loudnorm=I=-11:TP=-1.2:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    measured=json.JSONDecoder().raw_decode(first.stderr[first.stderr.rfind('{'):])[0]
    (output/'loudness-measurement.json').write_text(json.dumps(measured,indent=2)+'\n')
    # Fixed gain preserves the deliberate quiet sections; dynamic loudnorm would
    # pull the atmospheric introduction upward. Oversample the linked limiter.
    gain_db=-10.5-float(measured['input_i'])
    filt=(f'highpass=f=18,volume={gain_db:.6f}dB,aresample=192000,'
          'alimiter=limit=0.86:attack=2:release=55:level=false:latency=true,aresample=48000')
    wav=output/'phase-bloom-master.wav'
    subprocess.run(base+['-af',filt,'-ar',str(SR),'-c:a','pcm_s24le',str(wav)],capture_output=True,text=True,check=True)
    final=subprocess.run(['ffmpeg','-hide_banner','-nostdin','-i',str(wav),'-af','loudnorm=I=-11:TP=-1.2:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    report=json.JSONDecoder().raw_decode(final.stderr[final.stderr.rfind('{'):])[0]
    (output/'mastering.json').write_text(json.dumps({'method':'18Hz DC/subsonic highpass; measured fixed gain; 4x oversampled linked lookahead limiter; no time-varying loudness normalization','gain_db':gain_db,'filter':filt,'measured_integrated_lufs':float(report['input_i']),'measured_true_peak_dbfs':float(report['input_tp']),'measured_lra':float(report['input_lra'])},indent=2)+'\n')
    return wav


def analyze(wav: Path, score: dict, output: Path) -> None:
    decoded=output/'master.f32'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-f','f32le',str(decoded)],check=True)
    audio=np.memmap(decoded,mode='r',dtype='<f4').reshape(-1,2)
    frames=[]
    fft_size=4096
    frequencies=np.fft.rfftfreq(fft_size,1/SR)
    bands=[(frequencies>=25)&(frequencies<180),(frequencies>=180)&(frequencies<3000),(frequencies>=3000)&(frequencies<16000)]
    window=np.hanning(fft_size)
    metrics=np.zeros((18000,4))
    for i in range(18000):
        block=audio[i*1600:(i+1)*1600]
        metrics[i,0]=np.sqrt(np.mean(block.astype(np.float64)**2))
        start=max(0,i*1600-1248)
        sample=audio[start:start+fft_size].mean(axis=1)
        if len(sample)<fft_size:
            sample=np.pad(sample,(0,fft_size-len(sample)))
        power=np.abs(np.fft.rfft(sample*window))**2
        metrics[i,1:]=[np.sqrt(power[band].sum()) for band in bands]
    normalized=np.clip(metrics/np.maximum(1e-9,np.percentile(metrics,98,axis=0)),0,1)
    flux=np.maximum(0,np.diff(metrics[:,1],prepend=0))
    flux=np.clip(flux/max(1e-9,float(np.percentile(flux,98))),0,1)
    for i in range(18000):
        section=next(s['id'] for s in score['sections'] if s['start']<=i/30<s['end'])
        frames.append({'t':round(i/30,6),'rms':round(float(normalized[i,0]),5),'bass':round(float(normalized[i,1]),5),'mid':round(float(normalized[i,2]),5),'treble':round(float(normalized[i,3]),5),'kick':round(float(flux[i]),5),'section':section})
    (output/'features.json').write_text(json.dumps({'fps':30,'duration':600,'bpm':144,'analysis':'Actual mastered stereo PCM; RMS and 4096-point Hann FFT bands; kick is positive bass flux; normalized to 98th percentile.','frames':frames},separators=(',',':'))+'\n')
    section_stats=[]
    for section in score['sections']:
        lo=round(section['start']*30)
        hi=round(section['end']*30)
        section_stats.append({**section,'rms_db':round(float(20*np.log10(np.sqrt(np.mean(metrics[lo:hi,0]**2))+1e-10)),2)})
    stats={'duration':len(audio)/SR,'sampleRate':SR,'channels':2,'samplePeak':float(np.max(np.abs(audio))),'dc':audio.mean(axis=0).tolist(),'sections':section_stats,'events':len(score['events'])}
    (output/'audio-analysis.json').write_text(json.dumps(stats,indent=2)+'\n')
    for name,start in [('ignition',72),('first-drop',286),('breakdown',406),('vacuum-drop',440),('peak',498),('ending',570)]:
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(wav),'-t','30','-c:a','pcm_s16le',str(output/f'audition-{name}.wav')],check=True)
    print(json.dumps(stats),flush=True)


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--score',default='compositions/psytrance/score.json')
    parser.add_argument('--output',default='runs/psytrance-audio-v02')
    parser.add_argument('--analyze-only',action='store_true')
    args=parser.parse_args()
    output=Path(args.output)
    output.mkdir(parents=True,exist_ok=True)
    score=json.loads(Path(args.score).read_text())
    (output/'score.json').write_text(json.dumps(score,indent=2)+'\n')
    if score['duration']!=600 or score['bars']!=360:
        raise ValueError('Expected the complete 360-bar, 600-second score')
    wav=output/'phase-bloom-master.wav'
    if not args.analyze_only:
        wav=master(render(score,output),output)
    analyze(wav,score,output)


if __name__=='__main__':
    main()
