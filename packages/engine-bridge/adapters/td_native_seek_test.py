"""Call begin() then finish() in a separate Textport evaluation, after frames advance."""
import json
from pathlib import Path


def begin(path='/project1/ambient_native_v03', seconds=2.0):
    import td
    base = td.op(path)
    base.par.Play.val = False
    base.par.Seek.val = seconds
    base.par.Jump.pulse()
    return 'Pulsed Go; run finish() in a separate evaluation after frames advance.'


def finish(path='/project1/ambient_native_v03', folder='/Users/light_one/AI_project/Media/ambient-lab/runs/engine-native-sample-v01'):
    import td
    base=td.op(path)
    timer=base.op('local/time')
    executor=base.op('transport_execute')
    data={'requested':base.par.Seek.eval(), 'actual':timer.seconds, 'play':base.par.Play.eval(),
          'executor_active':executor.par.active.eval(), 'executor_op':str(executor.par.op.eval()),
          'executor_pars':executor.par.pars.eval(), 'executor_onpulse':executor.par.onpulse.eval(),
          'errors':base.errors(recurse=True), 'script_errors':base.scriptErrors(recurse=True)}
    target=Path(folder)/'td-seek-postframe.json'
    target.write_text(json.dumps(data,ensure_ascii=False,indent=2))
    return str(target)


def capture_first(path='/project1/ambient_native_v03', folder='/Users/light_one/AI_project/Media/ambient-lab/runs/engine-native-sample-v01'):
    import td
    base=td.op(path)
    clock=base.op('local/time')
    if abs(clock.seconds-2) > 1.0/60: raise ValueError('Run begin() and finish() first')
    base.par.Density.val=1
    base.op('particles/quads').cook(force=True)
    base.op('out').cook(force=True)
    base.op('out').save(str(Path(folder)/'td-v06-02.png'))
    base.par.Seek.val=20
    base.par.Jump.pulse()
    return 'Saved 2s frame; pulsed 20s. Run capture_final() separately after frames advance.'


def capture_final(path='/project1/ambient_native_v03', folder='/Users/light_one/AI_project/Media/ambient-lab/runs/engine-native-sample-v01'):
    import td
    base=td.op(path)
    clock=base.op('local/time')
    if abs(clock.seconds-20) > 1.0/60: raise ValueError('20 second seek has not completed')
    base.op('particles/quads').cook(force=True)
    base.op('out').cook(force=True)
    base.op('out').save(str(Path(folder)/'td-v06-20.png'))
    base.save(str(Path(folder)/'td-v06.tox'))
    return 'Saved 20s frame and td-v06.tox; errors: '+repr(base.errors(recurse=True))+' script errors: '+repr(base.scriptErrors(recurse=True))
