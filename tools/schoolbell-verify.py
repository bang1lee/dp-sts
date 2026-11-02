import json, hashlib, subprocess
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import welch
root=Path('runs/schoolbell-ambient-v01')
p=root/'schoolbell-ambient-v01.wav'; sr,a=wavfile.read(p)
assert sr==48000 and a.shape==(92*sr,2) and a.dtype==np.int32
x=a.astype(np.float64)/2147483648
assert np.isfinite(x).all() and np.max(np.abs(x))<1 and np.max(np.abs(x))>.01
z=x[8*sr:80*sr];mid=z.mean(axis=1);side=(z[:,0]-z[:,1])/2
f,pm=welch(mid,sr,nperseg=32768);_,ps=welch(side,sr,nperseg=32768)
bands=[(20,100),(100,250),(250,500),(500,1000),(1000,2000),(2000,4000)]
energy=pm.sum()
r={'sample_rate':sr,'channels':2,'duration_seconds':len(x)/sr,'peak_dbfs':float(20*np.log10(abs(x).max())),
'active_seconds':[8,80],'active_rms_dbfs':float(20*np.log10(np.sqrt(np.mean(z*z)))),
'lr_correlation':float(np.corrcoef(z.T)[0,1]),'side_mid_db':float(10*np.log10(ps.sum()/energy)),
'centroid_hz':float((f*pm).sum()/energy),'rolloff_95_hz':float(f[np.searchsorted(np.cumsum(pm),.95*energy)]),
'bands':[{'hz':[l,h],'energy_percent':float(100*pm[(f>=l)&(f<h)].sum()/energy),'side_mid_db':float(10*np.log10(ps[(f>=l)&(f<h)].sum()/pm[(f>=l)&(f<h)].sum()))} for l,h in bands],
'wav_sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
events=json.loads((root/'scheduled-events.json').read_text());mel=[v for v in events if v['part']=='melody'];assert len(mel)==48
expected=[55,55,57,57,55,55,52,55,55,52,52,50,55,55,57,57,55,55,52,55,52,50,52,48]
assert [v['note'] for v in mel]==expected*2
r['melody_notes_verified']=len(mel);r['melody_passes_verified']=2
(root/'analysis.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r,indent=2))
