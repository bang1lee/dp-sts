"""Run from TD Textport after installing ambient_native_v03; writes a trace as it runs."""
import json
import traceback
from pathlib import Path


def diagnose(path='/project1/ambient_native_v03', folder='/Users/light_one/AI_project/Media/ambient-lab/runs/engine-native-sample-v01'):
    import td
    folder = Path(folder)
    trace = folder / 'td-v03-diagnostic.json'
    records = []
    def run(name, action):
        records.append({'step': name, 'state': 'started'})
        trace.write_text(json.dumps(records, ensure_ascii=False, indent=2))
        try:
            value = action()
            records[-1].update(state='ok', result=repr(value))
            return value
        except BaseException as exc:
            records[-1].update(state='error', error=repr(exc), traceback=traceback.format_exc())
            return None
        finally:
            trace.write_text(json.dumps(records, ensure_ascii=False, indent=2))
    base = run('find_base', lambda: td.op(path))
    if base is None:
        return str(trace)
    clock = run('find_clock', lambda: base.op('local/time'))
    run('before_errors', lambda: base.errors(recurse=True))
    run('before_script_errors', lambda: base.scriptErrors(recurse=True))
    if clock:
        run('clock_parameters', lambda: {n: str(clock.par[n].eval()) for n in ['play','rate','start','end','rangestart','rangeend','independent','rangelimit']})
        run('clock_time_before', lambda: clock.seconds)
    run('set_play_parameter_false', lambda: setattr(base.par.Play, 'val', False))
    if clock:
        run('clock_time_after_pause', lambda: clock.seconds)
        run('set_clock_seconds_20', lambda: setattr(clock, 'seconds', 20))
        run('clock_time_after_seek', lambda: clock.seconds)
    render = run('find_output', lambda: base.op('out'))
    if render:
        run('cook_output', lambda: render.cook(force=True))
        run('output_resolution', lambda: (render.width, render.height))
        run('save_png', lambda: render.save(str(folder / 'td-v03.png')))
    run('after_errors', lambda: base.errors(recurse=True))
    run('after_script_errors', lambda: base.scriptErrors(recurse=True))
    run('save_tox', lambda: base.save(str(folder / 'td-v03.tox')))
    return str(trace)
