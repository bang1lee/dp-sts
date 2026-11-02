"""Run inside a TD Text DAT: exec(...); install('/absolute/bundle/folder').

Creates a new base with point/control Script CHOPs. Does not alter audio,
timeline, other nodes, or the project save path. Native execution pending.
"""

import json
import math
from pathlib import Path


def sample(bundle, seconds):
    p=max(0,min(len(bundle['frames'])-1,seconds*bundle['fps']))
    i=int(p)
    j=min(i+1,len(bundle['frames'])-1)
    return {c:bundle['frames'][i][k]*(1-(p-i))+bundle['frames'][j][k]*(p-i)
            for k,c in enumerate(bundle['channels'])}


def points(bundle, alignment):
    f=bundle['fourier']
    a=max(0,min(1,alignment))
    result=[]
    for j,row in enumerate(f['phases']):
        x=y=0
        for k,mode in enumerate(f['modes']):
            phase=j*2*math.pi/len(f['phases'])*mode+(1-a)*row[k]
            re,im=f['coefficients'][k]
            x+=re*math.cos(phase)-im*math.sin(phase)
            y+=re*math.sin(phase)+im*math.cos(phase)
        result.extend([x,y,0])
    return result


def install(folder, parent_path='/project1', name='ambient_bridge'):
    import td
    folder=Path(folder).resolve()
    bundle=json.loads((folder/'bundle.json').read_text())
    if bundle['version']!=1:
        raise ValueError('Unsupported bundle version')
    parent=td.op(parent_path)
    if parent is None or parent.op(name) is not None:
        raise ValueError('Parent missing or node already exists; choose a new name')
    base=parent.create(td.baseCOMP,name)
    base.store('bundle',bundle)
    page=base.appendCustomPage('Ambient')
    seconds=page.appendFloat('Seconds',label='Audio time in seconds')[0]
    seconds.default=0
    module=base.create(td.textDAT,'bridge_module')
    module.text=(folder/'td_bridge.py').read_text()
    controls=base.create(td.scriptCHOP,'controls')
    callback=base.create(td.textDAT,'controls_callbacks')
    callback.text="""def onCook(scriptOp):
    owner=scriptOp.parent()
    values=owner.op('bridge_module').module.sample(owner.fetch('bundle'),owner.par.Seconds.eval())
    scriptOp.clear()
    scriptOp.numSamples=1
    for name,value in values.items(): scriptOp.appendChan(name)[0]=value
"""
    controls.par.callbacks=callback
    geometry=base.create(td.scriptCHOP,'points')
    callback=base.create(td.textDAT,'points_callbacks')
    callback.text="""def onCook(scriptOp):
    owner=scriptOp.parent()
    module=owner.op('bridge_module').module
    bundle=owner.fetch('bundle')
    controls=module.sample(bundle,owner.par.Seconds.eval())
    data=module.points(bundle,controls['alignment'])
    scriptOp.clear()
    scriptOp.numSamples=len(data)//3
    for k,name in enumerate(['tx','ty','tz']): scriptOp.appendChan(name).vals=data[k::3]
"""
    geometry.par.callbacks=callback
    for i,node in enumerate(base.children):
        node.nodeX=(i%3)*220
        node.nodeY=-(i//3)*150
    return base.path
