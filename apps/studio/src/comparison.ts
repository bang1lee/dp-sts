import audioUrl from '../../../runs/engine-bridge-moonwater-v01/audio.wav?url';
import bundleUrl from '../../../runs/engine-bridge-moonwater-v01/bundle.json?url';
import nativeGuideUrl from '../../../docs/native-sample.md?url';

type Bundle = { fps: number; frames: number[][]; fourier: { modes: number[]; coefficients: number[][]; phases: number[][] } };
type Settings = { density: number; sparkle: number; motion: number; align: number };
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvases = [get<HTMLCanvasElement>('crisp'), get<HTMLCanvasElement>('soft')];
const contexts = canvases.map((canvas) => canvas.getContext('2d')!);
get<HTMLAnchorElement>('native-guide').href = nativeGuideUrl;
const audio = new Audio(audioUrl);
audio.preload = 'metadata';
const seek = get<HTMLInputElement>('seek');
const play = get<HTMLButtonElement>('play');
const status = get<HTMLElement>('audio-status');
const defaults: Settings = { density: 55, sparkle: 60, motion: 45, align: -1 };
const settings = { ...defaults };
let bundle: Bundle | undefined;
let animation = 0;
const rnd = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x));
function controlsAt(t: number) {
  if (!bundle) return [0, 0, 1, 0];
  const pos = clamp(t * bundle.fps, 0, bundle.frames.length - 1);
  const left = Math.floor(pos), right = Math.min(left + 1, bundle.frames.length - 1), f = pos - left;
  return bundle.frames[left].map((value, i) => value * (1 - f) + bundle!.frames[right][i] * f);
}
function point(i: number, alignment: number) {
  if (!bundle) return [0, 0];
  const { modes, coefficients, phases } = bundle.fourier;
  const theta = 2 * Math.PI * i / phases.length;
  let x = 0, y = 0;
  modes.forEach((mode, j) => {
    const angle = mode * theta + phases[i][j] * (1 - alignment);
    const [re, im] = coefficients[j];
    x += re * Math.cos(angle) - im * Math.sin(angle);
    y += re * Math.sin(angle) + im * Math.cos(angle);
  });
  return [x, y];
}
function draw(ctx: CanvasRenderingContext2D, soft: boolean, t: number) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const [rms, authoredAlign, , breath] = controlsAt(t);
  const align = settings.align < 0 ? authoredAlign : settings.align / 100;
  const motion = settings.motion / 100;
  const phase = t * motion;
  const shimmer = settings.sparkle / 100;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, soft ? '#102e38' : '#0b2632');
  grad.addColorStop(.48, soft ? '#0a252d' : '#081b27');
  grad.addColorStop(1, '#031018');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  // Layered ellipses suggest a surface overhead and light falling into water.
  for (let i = 0; i < 11; i++) {
    const y = 64 + i * 23 + Math.sin(phase * .15 + i) * 3;
    ctx.beginPath(); ctx.ellipse(w * .5, y, w * (.16 + i * .045), 12 + i * 4, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(124,185,185,${(soft ? .025 : .045) * (1 - i / 14)})`;
    ctx.lineWidth = soft ? 6 : 1.2; ctx.stroke();
  }
  const glow = ctx.createRadialGradient(w * .51, h * .16, 2, w * .51, h * .16, w * .58);
  glow.addColorStop(0, `rgba(152,210,210,${soft ? .20 : .13})`); glow.addColorStop(.28, 'rgba(73,143,153,.055)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  // Fixed phase data keeps the same sample reproducible when seeking.
  const count = Math.floor(50 + settings.density * 2.5);
  const total = bundle?.fourier.phases.length ?? 768;
  for (let k = 0; k < count; k++) {
    const i = Math.floor(k * total / count);
    const [fx, fy] = point(i, align);
    const depth = .25 + rnd(i + 4) * .75;
    const projectedDepth = depth * (1 - align) + .8 * align;
    const drift = Math.sin(phase * (.09 + depth * .14) + rnd(i + 7) * 6) * 13 * motion * (1 - align);
    const x = w * .5 + fx * w * .30 * projectedDepth + drift;
    const y = h * (.62 + fy * .20 * projectedDepth + (rnd(i + 9) - .5) * .34 * (1 - align)) + Math.sin(phase * .18 + i) * 4 * motion * (1 - align);
    const flicker = .28 + .72 * Math.pow(Math.max(0, Math.sin(phase * (.7 + rnd(i) * .5) + rnd(i + 2) * 30)), 5);
    const alpha = clamp((.20 + shimmer * .8 * flicker + rms * 3) * (soft ? .62 : 1.35) * (.55 + depth * .45), 0, .8);
    const size = (soft ? 2.2 : 1.3) + depth * (soft ? 3.3 : 2.3);
    if (soft) {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 7);
      halo.addColorStop(0, `rgba(190,231,226,${alpha})`); halo.addColorStop(.18, `rgba(108,190,195,${alpha * .27})`); halo.addColorStop(1, 'rgba(73,153,169,0)');
      ctx.fillStyle = halo; ctx.fillRect(x - size * 7, y - size * 7, size * 14, size * 14);
      ctx.fillStyle = `rgba(196,234,228,${alpha * .55})`; ctx.fillRect(x - size * 2.2, y, size * 4.4, .8);
    } else {
      ctx.fillStyle = `rgba(200,238,229,${alpha})`;
      ctx.beginPath(); ctx.ellipse(x, y, size * (1.5 + rnd(i + 3) * 2), size * .38, -.08, 0, Math.PI * 2); ctx.fill();
    }
  }
  // A few broken wave arcs give the glints a surface without filling the frame.
  for (let j = 0; j < 9; j++) {
    const x = w * (.15 + rnd(j + 50) * .7), y = h * (.33 + rnd(j + 70) * .58);
    ctx.beginPath(); ctx.ellipse(x, y, 28 + rnd(j + 90) * 95, 3 + rnd(j + 30) * 8, 0, .1, 2.6);
    ctx.strokeStyle = `rgba(149,205,200,${(soft ? .026 : .065) * (.8 + breath * .2)})`; ctx.lineWidth = soft ? 4 : 1; ctx.stroke();
  }
}
function render() { const t = Number.isFinite(audio.currentTime) ? audio.currentTime : 0; contexts.forEach((ctx, i) => draw(ctx, i === 1, t)); }
function format(t: number) { return `00:${String(Math.floor(clamp(t, 0, 30))).padStart(2, '0')}`; }
function sync() { seek.value = String(audio.currentTime); get<HTMLOutputElement>('clock').value = `${format(audio.currentTime)} / 00:30`; render(); }
function tick() { sync(); if (!audio.paused) animation = requestAnimationFrame(tick); }
play.addEventListener('click', async () => {
  if (audio.paused) {
    try { if (audio.ended) audio.currentTime = 0; await audio.play(); status.textContent = '두 화면이 같은 오디오 위치를 따라갑니다.'; }
    catch { status.textContent = '오디오를 재생하지 못했습니다. 페이지를 새로 열어 다시 시도하세요.'; }
  } else audio.pause();
});
audio.addEventListener('play', () => { play.innerHTML = 'Ⅱ <span>일시정지</span>'; cancelAnimationFrame(animation); tick(); });
audio.addEventListener('pause', () => { play.innerHTML = '▶ <span>재생</span>'; cancelAnimationFrame(animation); sync(); });
audio.addEventListener('ended', sync);
audio.addEventListener('error', () => { status.textContent = '공유 오디오를 불러오지 못했습니다.'; });
seek.addEventListener('input', () => { audio.currentTime = Number(seek.value); sync(); });
(Object.keys(defaults) as (keyof Settings)[]).forEach((key) => {
  const input = get<HTMLInputElement>(key), output = get<HTMLOutputElement>(`${key}-value`);
  const update = () => { settings[key] = Number(input.value); output.value = key === 'align' && settings[key] < 0 ? '원본 곡선' : `${settings[key]}%`; render(); };
  input.addEventListener('input', update);
});
get<HTMLButtonElement>('reset').addEventListener('click', () => { (Object.keys(defaults) as (keyof Settings)[]).forEach((key) => { const input = get<HTMLInputElement>(key); input.value = String(defaults[key]); input.dispatchEvent(new Event('input')); }); });
get<HTMLButtonElement>('save').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, sample: 'engine-bridge-moonwater-v01', audioSeconds: audio.currentTime, settings }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'moonwater-comparison-settings.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
fetch(bundleUrl).then((response) => { if (!response.ok) throw new Error('bundle'); return response.json() as Promise<Bundle>; }).then((value) => { bundle = value; render(); }).catch(() => { status.textContent = '공유 제어 데이터를 불러오지 못했습니다.'; });
render();
