"""Capture TD's seek and density states on separate frames and save the editable component."""
import json
import traceback
from pathlib import Path


def capture(path='/project1/ambient_native_v03', folder='/Users/light_one/AI_project/Media/ambient-lab/runs/engine-native-sample-v01'):
    import td
    base=td.op(path)
    if not base or not base.pars('Seek') or not base.pars('Jump'):
        raise ValueError('Run the transport upgrade first')
    folder=Path(folder)
    log=folder/'td-native-capture.json'
    result={'state':'running','captures':[]}
    def record(): log.write_text(json.dumps(result,indent=2))
    def fail(exc):
        result.update(state='error',error=repr(exc),traceback=traceback.format_exc())
        record()
    def snap(expected,density,filename):
        actual=base.op('local/time').seconds
        if abs(actual-expected)>1/60:
            raise AssertionError('Seek mismatch: expected %s, actual %s' % (expected,actual))
        base.par.Density.val=density
        geo=base.op('particles/quads')
        geo.cook(force=True)
        output=base.op('out')
        output.cook(force=True)
        output.save(str(folder/filename))
        result['captures'].append({'requested':expected,'actual':actual,'density':density,'points':len(geo.points),'image':filename})
        record()
    def second():
        try:
            snap(20,1,'td-final-20.png')
            snap(20,.5,'td-final-half.png')
            base.par.Density.val=1
            result['errors']=base.errors(recurse=True)
            result['script_errors']=base.scriptErrors(recurse=True)
            result['paused_audio_active']=bool(base.op('audio_out').par.active.eval())
            if result['errors'] or result['script_errors'] or result['paused_audio_active']:
                raise RuntimeError('Network errors or audio output active when paused')
            result['tox']=str(base.save(str(folder/'td-native-final.tox')))
            result['state']='complete'
            record()
        except BaseException as exc: fail(exc)
    def first():
        try:
            snap(0,1,'td-final-00.png')
            base.par.Seek.val=20
            base.par.Jump.pulse()
            td.run(second,delayFrames=3)
        except BaseException as exc: fail(exc)
    base.par.Play.val=False
    base.par.Seek.val=0
    base.par.Jump.pulse()
    record()
    td.run(first,delayFrames=3)
    return 'Capture scheduled; inspect td-native-capture.json after several frames.'
