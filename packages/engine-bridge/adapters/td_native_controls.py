"""Add native seek controls and pause muting to an installed TD sample."""

CALLBACK = '''def onPulse(par):
    owner = me.parent()
    if par.name == 'Jump':
        duration = owner.fetch('bundle')['duration']
        owner.op('local/time').seconds = max(0, min(duration - 1.0 / 60.0, owner.par.Seek.eval()))
'''


def configure(path='/project1/ambient_native'):
    import td
    base = td.op(path)
    if not base or not base.op('local/time') or not base.op('audio_out'):
        raise ValueError('Expected ambient component not found')
    page = next(page for page in base.customPages if page.name == 'Ambient')
    if not base.pars('Seek'):
        seek = page.appendFloat('Seek', label='Seek Seconds')[0]
        seek.val = 0
        seek.min = 0
        seek.max = base.fetch('bundle')['duration']
    if not base.pars('Jump'):
        page.appendPulse('Jump', label='Go to Seek Time')
    executor = base.op('transport_execute') or base.create(td.parameterexecuteDAT, 'transport_execute')
    executor.par.op = '..'
    executor.par.pars = 'Jump'
    executor.par.onpulse = True
    executor.text = CALLBACK
    base.op('audio_out').par.active.expr = 'parent().par.Play'
    base.op('camera').par.tz = 5.7
    return base.path
