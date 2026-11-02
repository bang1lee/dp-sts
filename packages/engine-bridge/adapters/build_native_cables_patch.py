"""Make a candidate standalone patch from an actual saved cables 0.12.1 patch.

Needs a user-specified existing patch only as a metadata template, read-only.
The custom OP directory must be added to the new project's Op Directories in the app.
"""
import argparse
import copy
import json
import time
import uuid
from pathlib import Path


def build(template, folder):
    sample = Path(folder).resolve()
    sample.mkdir(parents=True, exist_ok=True)
    patch = json.loads(Path(template).read_text())
    op_name = 'Ops.Local.AmbientLab.Moonwater'
    op_id = 'c5f60d35-83f1-4648-bbe1-318c0582fbf0'
    op_dir = sample / 'ops' / op_name
    op_dir.mkdir(parents=True, exist_ok=True)
    source = (sample / 'cables-native-op.js').read_text()
    (op_dir / (op_name + '.js')).write_text(source)
    meta = {'id': op_id, 'authorName': 'Ambient Lab', 'summary': 'Moonwater bridge sample',
            'license': 'none', 'layout': {'portsIn': [
                {'type': 0, 'name': n, 'subType': 'number'} for n in ['Seconds', 'Density', 'Sparkle', 'Scale']],
                'portsOut': [{'type': 3, 'name': 'XYZ'},
                             {'type': 0, 'name': 'Point Size', 'subType': 'number'},
                             {'type': 0, 'name': 'Alignment', 'subType': 'number'}]}}
    (op_dir / (op_name + '.json')).write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    ids = {'loop':'amb_loop', 'camera':'amb_camera', 'material':'amb_material',
           'cloud':'amb_cloud', 'bridge':'amb_bridge', 'audio':'amb_audio'}
    def node(key, opid, x, y, inputs=()):
        return {'id':ids[key], 'opId':opid, 'attribs':{},
                'uiAttribs':{'translate':{'x':x,'y':y}},
                'portsIn':[{'name':n,'value':v} for n,v in inputs]}
    nodes = [
        node('loop','f1029550-d877-42da-9b1e-63a5163a0350',-420,-200,[('Active',1)]),
        node('camera','b24dbfdc-485c-49d2-92a1-7258efd9239a',-420,-80),
        node('material','e44df958-00c7-46e4-95bb-3e6ac6c4188f',-420,40,
             [('Size in Pixels',1),('Round',1),('Round Antialias',1),('r',0.42),('g',0.78),('b',1),('a',1)]),
        node('cloud','53bc6de5-8d22-4687-9f03-ccfd3e50d106',-420,160),
        node('bridge',op_id,-130,40,[('Seconds',0),('Density',1),('Sparkle',1),('Scale',1)]),
        node('audio','82c14cd9-e2e7-4944-a04e-cca1bf3ed63e',150,-80,
             [('file',(sample/'audio.wav').as_uri()),('Volume',0.5),('Loop',1),('Active',1),('Play',0)]),
    ]
    nodes[4]['objName'] = op_name
    byid = {n['id']:n for n in nodes}
    def connect(outkey, outport, inkey, inport):
        outnode=byid[ids[outkey]]
        ports=outnode.setdefault('portsOut',[])
        port=next((p for p in ports if p['name']==outport),None)
        if port is None:
            port={'name':outport,'links':[]};ports.append(port)
        port['links'].append({'portIn':inport,'portOut':outport,'objIn':ids[inkey],'objOut':ids[outkey]})
    connect('loop','trigger','camera','render')
    connect('camera','trigger','material','render')
    connect('material','trigger','cloud','exe')
    connect('bridge','XYZ','cloud','Array')
    connect('bridge','Point Size','material','PointSize')
    connect('audio','Current Time','bridge','Seconds')
    patch['_id'] = uuid.uuid4().hex[:24]
    patch['shortId'] = uuid.uuid4().hex[:6]
    patch['name'] = 'Ambient Lab Moonwater Native'
    patch['created'] = patch['updated'] = int(time.time()*1000)
    patch['ops'] = nodes
    patch['summary'] = {'title':patch['name']}
    patch.pop('screenshot', None)
    patch.pop('opsHash', None)
    path=sample/'moonwater-candidate.cables'
    path.write_text(json.dumps(patch, ensure_ascii=False, indent=2))
    return path, sample/'ops'


if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('saved_template')
    p.add_argument('output_folder')
    args=p.parse_args()
    result=build(args.saved_template,args.output_folder)
    print('Candidate patch:', result[0])
    print('Add OP directory in cables:', result[1])
