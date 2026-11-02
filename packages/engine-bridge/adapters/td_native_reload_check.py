"""Inspect an already loaded TOX under a probe, and open its TOP viewer."""
import json
import traceback
from pathlib import Path


def inspect_loaded(path='/project1/ambient_tox_check', folder='/Users/light_one/AI_project/Media/ambient-lab/runs/engine-native-sample-v01'):
    import td
    target=Path(folder)/'td-native-reload.json'
    record={'state':'running','probe':path}
    def save(): target.write_text(json.dumps(record,indent=2))
    save()
    try:
        probe=td.op(path)
        if not probe: raise ValueError('Probe component missing')
        nodes=[probe]+list(probe.findChildren())
        record['children']=[{'path':x.path,'type':x.opType} for x in probe.children]
        matches=[x for x in nodes if 'bundle' in x.storage and x.op('out') and x.op('local/time')]
        if not matches: raise ValueError('No loaded component with stored bundle and output found')
        scene=matches[0]
        bundle=scene.fetch('bundle')
        out=scene.op('out')
        out.cook(force=True)
        record.update(scene=scene.path,frames=len(bundle['frames']),audio_file=str(scene.op('audio').par.file.eval()),
                      seek=bool(scene.pars('Seek')),jump=bool(scene.pars('Jump')),
                      errors=scene.errors(recurse=True),script_errors=scene.scriptErrors(recurse=True),
                      resolution=[out.width,out.height])
        out.save(str(Path(folder)/'td-reload.png'))
        record['state']='verified' if not record['errors'] and not record['script_errors'] else 'network_error'
        save()
        try:
            out.openViewer(unique=True)
            record['viewer']='opened'
        except BaseException as e:
            record['viewer']='failed: '+repr(e)
    except BaseException as e:
        record.update(state='error',error=repr(e),traceback=traceback.format_exc())
    save()
    return str(target)
