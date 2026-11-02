"""One-pass, smooth mid/side mastering of the original independently synthesized score."""
import json, hashlib, subprocess
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import welch
from scipy.fft import rfft, irfft, rfftfreq, next_fast_len
src=Path('runs/schoolbell-ambient-v01/schoolbell-ambient-v01.wav')
out=Path('runs/schoolbell-ambient-v02');out.mkdir(exist_ok=True)
sr,pcm=wavfile.read(src); assert sr==48000 and pcm.shape==(92*sr,2) and pcm.dtype==np.int32
x=pcm.astype(np.float64)/2147483648
n=next_fast_len(len(x)+2*sr) # zero pad to eliminate wrap into fades
f=rfftfreq(n,1/sr); safe=np.maximum(f,1)
# Smooth broad controls in log-frequency, no matching of individual frequencies or notes.
hz=np.array([1,50,90,140,200,250,300,400,500,600,750,950,1200,2000,24000],float)
mid_gain=np.array([1,1,1,1,1,.97,.85,.74,.77,.86,.92,.94,.94,1,1])
side_ratio=np.array([1,1,.95,.76,.74,.64,.48,.43,.52,1.20,1.75,1.78,1.30,1,1])
interp=lambda values:np.exp(np.interp(np.log(safe),np.log(hz),np.log(values)))
M=rfft(x.mean(axis=1),n=n);S=rfft((x[:,0]-x[:,1])*.5,n=n)
m=irfft(M*interp(mid_gain),n=n)[:len(x)];s=irfft(S*interp(mid_gain)*interp(side_ratio),n=n)[:len(x)]
y=np.column_stack([m+s,m-s]); # force unchanged exact silence tails, avoid any FFT wrap residue
fade=np.minimum(1,np.minimum(np.arange(len(y))/(.05*sr), (len(y)-1-np.arange(len(y)))/(.05*sr)))
y*=np.maximum(fade,0)[:,None]
gain=(10**(-3.65/20))/np.max(np.abs(y));y*=gain
raw=out/'master.f32le';y.astype('<f4').tofile(raw)
wav=out/'schoolbell-ambient-v02.wav';mp3=out/'schoolbell-ambient-v02.mp3'
subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(sr),'-ac','2','-i',str(raw),'-c:a','pcm_s24le',str(wav)],check=True)
subprocess.run(['ffmpeg','-y','-v','error','-i',str(wav),'-c:a','libmp3lame','-b:a','320k',str(mp3)],check=True);raw.unlink()
active=y[8*sr:80*sr];mid=active.mean(axis=1);side=(active[:,0]-active[:,1])*.5
freq,pm=welch(mid,sr,nperseg=32768);_,ps=welch(side,sr,nperseg=32768)
bands=[(20,100),(100,250),(250,500),(500,1000),(1000,2000),(2000,4000)]
r={'duration_seconds':len(y)/sr,'sample_rate':sr,'channels':2,'active_seconds':[8,80],'peak_dbfs':float(20*np.log10(np.abs(y).max())),
'active_rms_dbfs':float(20*np.log10(np.sqrt(np.mean(active**2)))), 'lr_correlation':float(np.corrcoef(active.T)[0,1]),
'side_mid_db':float(10*np.log10(ps.sum()/pm.sum())),'centroid_hz':float((freq*pm).sum()/pm.sum()),
'rolloff_95_hz':float(freq[np.searchsorted(np.cumsum(pm),.95*pm.sum())]),
'bands':[{'hz':[l,h],'energy_percent':float(100*pm[(freq>=l)&(freq<h)].sum()/pm.sum()), 'side_mid_db':float(10*np.log10(ps[(freq>=l)&(freq<h)].sum()/pm[(freq>=l)&(freq<h)].sum()))} for l,h in bands],
'source_wav_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'wav_sha256':hashlib.sha256(wav.read_bytes()).hexdigest(),
'method':'Zero-phase log-frequency interpolated broadband mid/side curves; two seconds zero padding; no source reference audio used in master','curve_hz':hz.tolist(),'mid_gain':mid_gain.tolist(),'side_relative_gain':side_ratio.tolist(),'peak_normalization_gain':float(gain)}
(out/'analysis.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
