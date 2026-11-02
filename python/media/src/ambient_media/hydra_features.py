"""Measured master-WAV controls for the Hydra offline renderer."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--audio',default='runs/dp-sts-moonwater-ave-v01/dp-sts-moonwater-ave-master.wav')
    parser.add_argument('--out',default='compositions/moonwater-hydra')
    parser.add_argument('--wide',action='store_true')
    args=parser.parse_args()
    wav=Path(args.audio)
    raw=subprocess.run(['ffmpeg','-v','error','-i',str(wav),'-f','f32le','-ac','1','-ar','48000','pipe:1'],check=True,capture_output=True).stdout
    pcm=np.frombuffer(raw,dtype='<f4')
    assert len(pcm)==600*48000
    padded=np.pad(pcm,(4096,4096))
    window=np.hanning(8192)
    freq=np.fft.rfftfreq(8192,1/48000)
    bands=[(30,140),(140,1500),(1500,8000)] if args.wide else [(35,90),(90,250),(250,1500)]
    masks=[(freq>=a)&(freq<b) for a,b in bands]
    rows=[]
    for i in range(14400):
        signal=padded[i*2000:i*2000+8192]*window
        power=np.abs(np.fft.rfft(signal))**2
        rows.append([float(np.sqrt(np.mean(pcm[i*2000:(i+1)*2000]**2)))]+
                    [float(np.sqrt(power[mask].sum())) for mask in masks])
    values=np.array(rows)
    raw_values=values.copy()
    values=np.clip(values/np.maximum(np.percentile(values,98,axis=0),1e-9),0,1)
    smoothed=np.zeros_like(values)
    for i,row in enumerate(values):
        previous=smoothed[i-1] if i else np.zeros(4)
        tau=np.where(row>previous,.22,2.4)
        smoothed[i]=previous+(row-previous)*(1-np.exp(-1/(24*tau)))
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    np.save(out/'features.npy',smoothed)
    (out/'audio-features.json').write_text(json.dumps({'fps':24,'duration':600,
        'columns':['rms']+[f'band{a}_{b}' for a,b in bands],
        'attack_seconds':.22,'release_seconds':2.4,'wav_sha256':hashlib.file_digest(wav.open('rb'),'sha256').hexdigest(),
        'raw_max':raw_values.max(axis=0).tolist(),'frames':smoothed.round(6).tolist()}))
    print('Measured 14400 synchronized control frames from master WAV')


if __name__=='__main__':
    main()
