"""Verify the 30-second Gujora film and its audio-derived bass controls."""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

from ambient_media.gujora_verify import decode, frame_at, inspect
from ambient_media.storm_delivery import sha256

TIMES = (3, 9, 15, 21, 27)
OUTPUTS = ('contact-sheet.jpg', 'poster.jpg', 'delivery.json')


def validate_metadata(root: Path) -> dict:
    render = json.loads((root/'render.json').read_text())
    expected = {'start':0, 'duration':30, 'fps':24, 'frames':720,
                'width':1080, 'height':1080, 'errors':[]}
    if any(render.get(k) != v for k,v in expected.items()):
        raise ValueError('metadata does not describe an error-free 30-second final render')
    source = render.get('source')
    if not isinstance(source,dict):
        raise TypeError('missing source metadata')
    for name in ('cover', 'audio', 'features', 'attacks'):
        if not isinstance(source.get(name),str) or not source[name]:
            raise ValueError(f'missing source path: {name}')
    files = {'coverSha256':root/'reference.png', 'audioSha256':Path(source['audio']),
             'featuresSha256':Path(source['features']), 'attacksSha256':Path(source['attacks']),
             'implementationSha256':root/'renderer.mjs', 'sceneSha256':root/'scene.mjs',
             'baseSceneSha256':root/'base-scene.mjs'}
    for field,path in files.items():
        if not path.is_file() or sha256(path) != source.get(field):
            raise ValueError(f'{field} does not match {path}')
    features = json.loads(files['featuresSha256'].read_text())
    attacks = json.loads(files['attacksSha256'].read_text())
    for item,fps,columns in [(features,24,['rms','low30_140','mid140_1500','high1500_10000']),
                             (attacks,50,['low_rms','positive_low_delta','low_level_envelope','bass_attack_envelope'])]:
        values = np.asarray(item.get('frames'),dtype=float)
        if (item.get('duration') != 30 or item.get('fps') != fps or item.get('wav_sha256') != source['audioSha256']
                or item.get('columns') != columns or values.shape != (30*fps,4) or not np.isfinite(values).all()):
            raise ValueError(f'invalid or mismatched {fps}fps audio control data')
    preparation_path = root/'audio-prepare.json'
    preparation = json.loads(preparation_path.read_text())
    if any(preparation.get(key) != source[field] for key,field in
           [('audio_sha256','audioSha256'),('features_sha256','featuresSha256'),('attacks_sha256','attacksSha256')]):
        raise ValueError('audio preparation metadata does not match the input audio and controls')
    geometry = render.get('geometry')
    if (not isinstance(geometry,dict) or geometry.get('staticParticlePositions') is not True
            or geometry.get('basePointCount') != 221073 or geometry.get('addedFogPointCount') != 221073
            or geometry.get('pointCount') != 442146):
        raise ValueError('renderer geometry metadata does not report 442146 static points')
    cover = cv2.imread(str(files['coverSha256']),cv2.IMREAD_UNCHANGED)
    if cover is None:
        raise ValueError('reference.png is not a decodable image')
    attack_values = np.asarray(attacks['frames'],dtype=np.float64)
    return {'audio_sha256':source['audioSha256'], 'features_sha256':source['featuresSha256'],
            'attacks_sha256':source['attacksSha256'], 'cover_sha256':source['coverSha256'],
            'renderer_sha256':source['implementationSha256'], 'scene_sha256':source['sceneSha256'],
            'base_scene_sha256':source['baseSceneSha256'], 'audio_preparation_sha256':sha256(preparation_path),
            'original_audio':preparation.get('source_audio'), 'original_audio_sha256':preparation.get('source_sha256'),
            'audio_provenance':preparation.get('source_provenance'),
            'measured_bass_attack_peak':round(float(attack_values[:,3].max()),6),
            'measured_bass_level_peak':round(float(attack_values[:,2].max()),6),
            'renderer_geometry_metadata':geometry, 'renderer_camera_metadata':render.get('camera')}


def make_sheet(video: Path, directory: Path) -> list[int]:
    size,gap,caption=340,10,32
    sheet=np.full((2*(size+caption)+3*gap,3*size+4*gap,3),18,np.uint8)
    for index,second in enumerate(TIMES):
        picture=cv2.resize(frame_at(video,second),(size,size),interpolation=cv2.INTER_AREA)
        x=gap+(index%3)*(size+gap); y=gap+(index//3)*(size+caption+gap)
        sheet[y:y+size,x:x+size]=picture
        cv2.putText(sheet,f'{second:02d}s',(x+5,y+size+23),cv2.FONT_HERSHEY_SIMPLEX,.6,(240,240,240),1,cv2.LINE_AA)
    if not cv2.imwrite(str(directory/'contact-sheet.jpg'),sheet,[cv2.IMWRITE_JPEG_QUALITY,94]):
        raise RuntimeError('could not write contact sheet')
    if not cv2.imwrite(str(directory/'poster.jpg'),frame_at(video,15),[cv2.IMWRITE_JPEG_QUALITY,94]):
        raise RuntimeError('could not write poster')
    return list(TIMES)


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path('runs/dp-sts-gujora-climax-v01'))
    parser.add_argument('--out',type=Path,help='output folder; default ROOT/delivery')
    parser.add_argument('--overwrite',action='store_true',help='replace existing delivery files')
    args=parser.parse_args()
    root=args.root.resolve(); out=(args.out or root/'delivery').resolve()
    try:
        required=('artwork.mp4','render.json','renderer.mjs','scene.mjs','base-scene.mjs','reference.png',
                  'audio.wav','audio-features.json','audio-attacks.json','audio-prepare.json')
        missing=[str(root/name) for name in required if not (root/name).is_file()]
        if missing:
            raise ValueError('missing required inputs:\n'+'\n'.join(missing))
        existing=[str(out/name) for name in OUTPUTS if (out/name).exists()]
        if existing and not args.overwrite:
            raise ValueError('delivery already exists; choose --out or use --overwrite:\n'+'\n'.join(existing))
        provenance=validate_metadata(root)
        video=root/'artwork.mp4'
        info=inspect(video,30)
        info['audio']=decode(video,30)
        info['sha256']=sha256(video)
        out.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.climax-delivery-',dir=out) as tmp:
            temp=Path(tmp)
            sampled=make_sheet(video,temp)
            report={'status':'technical_checks_passed', 'artwork':{'file':os.path.relpath(video,out),**info},
                    'provenance':provenance, 'contact_sheet':{'file':'contact-sheet.jpg','sample_seconds':sampled},
                    'poster':{'file':'poster.jpg','sample_second':15},
                    'limitations':['Technical checks do not replace watching or listening to the entire film.',
                                   'Particle counts and camera motion are renderer metadata, not independently confirmed by image analysis.',
                                   'Measured bass controls do not prove the response is visually perceptible.',
                                   'Hash linkage does not establish audible synchronization or user approval.']}
            (temp/'delivery.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
            for name in OUTPUTS:
                os.replace(temp/name,out/name)
        print(f'Verified delivery: {out}',flush=True)
        return 0
    except (OSError,ValueError,RuntimeError,KeyError,TypeError,json.JSONDecodeError) as exc:
        print(f'ERROR: {exc}',file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
