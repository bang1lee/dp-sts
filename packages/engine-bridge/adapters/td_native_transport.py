"""Add and verify transport controls on the existing ambient_native_v03 only."""
import json
import traceback
from pathlib import Path

CALLBACK = '''def onPulse(par):
    owner = me.parent()
    if par.name == 'Jump':
        duration = owner.fetch('bundle')['duration']
        owner.op('local/time').seconds = max(0, min(duration - 1.0 / 60.0, owner.par.Seek.eval()))
'''


def upgrade(path='/project1/ambient_native_v03', folder='/Users/light_one/AI_project/Media/ambient-lab/runs/engine-native-sample-v01'):
    import td
    root = td.op(path)
    if not root or not root.op('local/time') or not root.op('audio_out'):
        raise ValueError('Expected v03 component not found')
    folder = Path(folder)
    trace = folder / 'td-v05-validation.json'
    records = []
    def run(name, action):
        records.append({'step': name, 'state': 'started'})
        trace.write_text(json.dumps(records, indent=2))
        try:
            result = action()
            records[-1].update(state='ok', result=repr(result))
            return result
        except BaseException as error:
            records[-1].update(state='error', error=repr(error), traceback=traceback.format_exc())
            return None
        finally:
            trace.write_text(json.dumps(records, indent=2))
    def setup():
        page = next(page for page in root.customPages if page.name == 'Ambient')
        if not root.pars('Seek'):
            seek = page.appendFloat('Seek', label='Seek Seconds')[0]
            seek.val = 0
            seek.min = 0
            seek.max = 30
        if not root.pars('Jump'):
            page.appendPulse('Jump', label='Go to Seek Time')
        executor = root.op('transport_execute') or root.create(td.parameterexecuteDAT, 'transport_execute')
        executor.par.op = '..'
        executor.par.pars = 'Jump'
        executor.par.onpulse = True
        executor.text = CALLBACK
        root.op('audio_out').par.active.expr = 'parent().par.Play'
        root.op('camera').par.tz = 5.7
        return True
    if not run('setup', setup):
        return str(trace)
    run('pause', lambda: setattr(root.par.Play, 'val', False))
    run('paused_output_active', lambda: root.op('audio_out').par.active.eval())
    def capture(seconds, density, filename):
        root.par.Density.val = density
        root.par.Seek.val = seconds
        root.par.Jump.pulse()
        actual = root.op('local/time').seconds
        if abs(actual - seconds) > 1.0 / 60.0:
            raise AssertionError('Seek did not update within the same evaluation; test after a frame')
        root.op('particles/quads').cook(force=True)
        root.op('out').cook(force=True)
        root.op('out').save(str(folder / filename))
        return {'requested':seconds, 'actual':actual, 'points':len(root.op('particles/quads').points), 'density':density}
    run('capture_0_full', lambda: capture(0, 1, 'td-v05-00.png'))
    run('capture_20_full', lambda: capture(20, 1, 'td-v05-20.png'))
    run('capture_20_half_density', lambda: capture(20, 0.5, 'td-v05-half.png'))
    run('restore_density', lambda: setattr(root.par.Density, 'val', 1))
    run('errors', lambda: root.errors(recurse=True))
    run('script_errors', lambda: root.scriptErrors(recurse=True))
    run('save_tox', lambda: root.save(str(folder / 'td-v05.tox')))
    return str(trace)
