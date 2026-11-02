"""Create an isolated editable TouchDesigner scene from a v1 bridge bundle.

Run from TouchDesigner's Python Textport (not system Python):
  exec(open('/absolute/path/td_native_scene.py').read()); install('/absolute/bundle/folder')
The existing project is not saved or overwritten. Use a fresh name on retries.
"""
import json
import math
from pathlib import Path


def sample(bundle, seconds):
    p = max(0, min(len(bundle['frames']) - 1, seconds * bundle['fps']))
    i = int(p)
    j = min(i + 1, len(bundle['frames']) - 1)
    return {c: bundle['frames'][i][k] * (1 - (p - i)) + bundle['frames'][j][k] * (p - i)
            for k, c in enumerate(bundle['channels'])}


def points(bundle, alignment):
    f = bundle['fourier']
    a = max(0, min(1, alignment))
    result = []
    for j, row in enumerate(f['phases']):
        x = y = 0.0
        for k, mode in enumerate(f['modes']):
            phase = j * 2 * math.pi / len(f['phases']) * mode + (1 - a) * row[k]
            re, im = f['coefficients'][k]
            x += re * math.cos(phase) - im * math.sin(phase)
            y += re * math.sin(phase) + im * math.cos(phase)
        result.append((x, y))
    return result


CALLBACK = '''def onCook(scriptOp):
    owner = scriptOp.parent().parent()
    module = owner.op('bridge_module').module
    bundle = owner.fetch('bundle')
    seconds = scriptOp.time.seconds % bundle['duration']
    controls = module.sample(bundle, seconds)
    pts = module.points(bundle, controls['alignment'])
    count = max(1, min(len(pts), int(len(pts) * owner.par.Density.eval())))
    sparkle = max(0, owner.par.Sparkle.eval())
    scale = owner.par.Scale.eval()
    rms = max(0, min(1, controls.get('rms', 0) * 8))
    math = __import__('math')
    scriptOp.clear()
    for i in range(count):
        x, y = pts[int(i * len(pts) / count)]
        # Small camera-facing quads remain visible when rendered as native SOP geometry.
        size = (0.0018 + 0.004 * sparkle) * (0.65 + 0.35 * rms) * (0.55 + 0.45 * (0.5 + 0.5 * math.sin(i * 12.7 + seconds * 2.0)))
        wave = (1 - controls['alignment']) * 0.13
        y += wave * math.sin(7 * x + seconds * 0.8 + i * 0.027)
        z = 0.18 * math.sin(i * 0.16 + seconds * 0.5)
        poly = scriptOp.appendPoly(4, closed=True)
        for v, (dx, dy) in zip(poly, [(-size,-size),(size,-size),(size,size),(-size,size)]):
            v.point.x = x * scale + dx
            v.point.y = y * scale + dy
            v.point.z = z

def cook(scriptOp):
    return onCook(scriptOp)
'''


def install(folder, parent_path='/project1', name='ambient_native', source_path=None):
    import td
    folder = Path(folder).expanduser().resolve()
    bundle = json.loads((folder / 'bundle.json').read_text())
    if bundle['version'] != 1 or bundle['duration'] <= 0:
        raise ValueError('Unsupported bridge bundle')
    source_path = Path(source_path) if source_path else folder / 'td_native_scene.py'
    source = source_path.read_text()
    parent = td.op(parent_path)
    if parent is None or parent.op(name) is not None:
        raise ValueError('Parent missing or node already exists; choose a new name')
    base = parent.create(td.baseCOMP, name)
    base.store('bundle', bundle)
    page = base.appendCustomPage('Ambient')
    for parname, label, value in [('Density', 'Density', 1.0), ('Sparkle', 'Sparkle', 1.0), ('Scale', 'Scale', 1.0)]:
        p = page.appendFloat(parname, label=label)[0]
        p.default = value
        p.val = value
    play = page.appendToggle('Play', label='Play / Pause')[0]
    play.default = 1
    play.val = 1
    # A component-local 30-second clock keeps the sample independent of the root timeline.
    local = base.op('local') or base.create(td.baseCOMP, 'local')
    clock = local.op('time') or local.create(td.timeCOMP, 'time')
    clock.par.rate = 60
    clock.par.start = 1
    clock.par.end = round(bundle['duration'] * 60)
    clock.par.rangestart = 1
    clock.par.rangeend = round(bundle['duration'] * 60)
    clock.par.rangelimit = 'loop'
    clock.par.independent = True
    clock.par.play.expr = 'parent(2).par.Play'
    module = base.create(td.textDAT, 'bridge_module')
    module.text = source
    geo = base.create(td.geometryCOMP, 'particles')
    for child in list(geo.children):
        child.destroy()
    sop = geo.create(td.scriptSOP, 'quads')
    cb = geo.create(td.textDAT, 'quads_callbacks')
    cb.text = CALLBACK
    sop.par.callbacks = cb
    sop.render = True
    sop.display = True
    geo.render = True
    mat = base.create(td.constantMAT, 'moonlight')
    mat.par.colorr = 0.55
    mat.par.colorg = 0.82
    mat.par.colorb = 1.0
    geo.par.material = mat
    camera = base.create(td.cameraCOMP, 'camera')
    camera.par.tz = 5
    render = base.create(td.renderTOP, 'render')
    render.par.camera = camera
    render.par.geometry = geo
    render.par.outputresolution = 'custom'
    render.par.resolutionw = 1280
    render.par.resolutionh = 720
    render.par.antialias = 'aa4'
    render.par.bgcolorr = 0.001
    render.par.bgcolorg = 0.008
    render.par.bgcolorb = 0.018
    blur = base.create(td.blurTOP, 'soft_glow')
    blur.par.type = 'gaussian'
    blur.par.size = 12
    blur.inputConnectors[0].connect(render)
    comp = base.create(td.compositeTOP, 'out')
    comp.par.operand = 'add'
    comp.inputConnectors[0].connect(render)
    comp.inputConnectors[1].connect(blur)
    audio = base.create(td.audiofileinCHOP, 'audio')
    audio.par.file = str(folder / 'audio.wav')
    audio.par.playmode = 'locked'
    audio.par.repeat = 'on'
    out = base.create(td.audiodeviceoutCHOP, 'audio_out')
    out.inputConnectors[0].connect(audio)
    for i, node in enumerate(base.children):
        node.nodeX = (i % 4) * 220
        node.nodeY = -(i // 4) * 150
    return base.path
