"""Copy a native-saved sample to a fresh folder and sync from AudioPlayer's element."""
import argparse
import json
import shutil
import uuid
from pathlib import Path


def build(saved_patch, old_op_dir, target):
    target = Path(target).resolve()
    patch = json.loads(Path(saved_patch).read_text())
    bridge = next(o for o in patch['ops'] if o['id'] == 'amb_bridge')
    audio = next(o for o in patch['ops'] if o['id'] == 'amb_audio')
    old_name = 'Ops.Local.AmbientLab.Moonwater'
    name = 'Ops.Local.AmbientLab.MoonwaterSync'
    new_id = '3600b8ab-342e-4f29-b8d7-0d2ee97f1a29'
    old_op_dir = Path(old_op_dir)
    meta = json.loads((old_op_dir/(old_name+'.json')).read_text())
    meta['id'] = new_id
    meta['summary'] = 'Moonwater sample following actual audio currentTime'
    meta['layout']['portsIn'].append({'type':2,'name':'Audio Element','subType':'element'})
    meta['layout']['portsOut'].append({'type':0,'name':'Actual Seconds','subType':'number'})
    dest = target/'ops'/name
    if dest.exists(): raise FileExistsError('Refusing to overwrite existing final OP')
    dest.mkdir(parents=True)
    shutil.copyfile(target/'cables-native-op.js',dest/(name+'.js'))
    (dest/(name+'.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2))
    bridge['opId'] = new_id
    bridge['objName'] = name
    ports = audio.setdefault('portsOut',[])
    element = next((p for p in ports if p['name'] == 'Element'),None)
    if element is None:
        element = {'name':'Element','links':[]}
        ports.append(element)
    element.setdefault('links',[]).append({'portIn':'Audio Element','portOut':'Element',
                                           'objIn':'amb_bridge','objOut':'amb_audio'})
    fileport = next(p for p in audio['portsIn'] if p['name']=='file')
    fileport['value'] = (target/'audio.wav').as_uri()
    patch['_id'] = uuid.uuid4().hex[:24]
    patch['shortId'] = uuid.uuid4().hex[:6]
    patch['name'] = 'Ambient Lab Moonwater Sync'
    patch['summary'] = {'title':patch['name']}
    patch.pop('opsHash',None)
    patch.pop('screenshot',None)
    out=target/'moonwater-final.cables'
    if out.exists(): raise FileExistsError('Refusing to overwrite final patch')
    out.write_text(json.dumps(patch,ensure_ascii=False,indent=2))
    return out


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('saved_patch')
    parser.add_argument('old_op_dir')
    parser.add_argument('target')
    args=parser.parse_args()
    print(build(args.saved_patch,args.old_op_dir,args.target))
