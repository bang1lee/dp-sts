import { createWorkbenchEngine, type MusicConfig, type VisualConfig } from './workbench-engine';
import { defaultWorkflow, parseRecipe, musicTools, visualTools, notationTools, inputTools, mappingSources, mappingTargets, type WorkflowPlan, type Mapping } from './workbench-workflow';
import nativeGuideUrl from '../../../docs/native-sample.md?url';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('art');
const status = el<HTMLElement>('status');
const seek = el<HTMLInputElement>('seek');
const play = el<HTMLButtonElement>('play');
const generate = el<HTMLButtonElement>('generate');
const wav = el<HTMLButtonElement>('save-wav');
const musicJson = el<HTMLButtonElement>('save-music-json');
const video = el<HTMLButtonElement>('save-video');
const image = el<HTMLButtonElement>('save-image');
const cancel = el<HTMLButtonElement>('cancel');
const progress = el<HTMLProgressElement>('progress');
const musicKeys = ['mood', 'root', 'bpm', 'sparsity', 'duration', 'gain'] as const;
const visualKeys = ['depth', 'density', 'bloom', 'connection', 'scale', 'motion', 'response'] as const;
const input = (id: string) => el<HTMLInputElement>(id);
const select = (id: string) => el<HTMLSelectElement>(id);
el<HTMLAnchorElement>('native-guide').href = nativeGuideUrl;

function musicConfig(): MusicConfig {
  return { mood: select('mood').value as MusicConfig['mood'], root: Number(select('root').value), bpm: Number(input('bpm').value), sparsity: Number(input('sparsity').value) / 100, duration: Number(input('duration').value), gain: Number(input('gain').value) / 100 };
}
function visualConfig(): VisualConfig {
  return { mode: select('mode').value as VisualConfig['mode'], depth: Number(input('depth').value) / 100, density: Number(input('density').value) / 100, bloom: Number(input('bloom').value) / 100, connection: Number(input('connection').value) / 100, scale: Number(input('scale').value) / 100, motion: Number(input('motion').value) / 100, response: Number(input('response').value) / 100 };
}
const signature = () => JSON.stringify(musicConfig());
let generatedSignature = '';
let state: { status: 'idle' | 'generating' | 'ready' | 'playing' | 'exporting' | 'error'; time: number; duration: number; rms: number; error?: string; videoMime?: string } = { status: 'idle', time: 0, duration: 30, rms: 0 };
let exporting = false;
let message = '';
let engine: ReturnType<typeof createWorkbenchEngine> | undefined;
const modes: Record<string, { title: string; description: string }> = {
  moonwater: { title: '달빛 입자', description: '깊이가 다른 빛 입자들이 천천히 흐릅니다.' },
  fractal: { title: '프랙탈', description: '반복되는 곡선의 안과 밖을 확대하며 살펴봅니다.' },
  mandelbulb: { title: '맨델벌브', description: '입체 프랙탈의 표면과 공간을 살펴봅니다. 화면이 느려질 수 있습니다.' },
};
function format(seconds: number) { const n = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function dirty() { return !!generatedSignature && generatedSignature !== signature(); }
function updateValues() {
  for (const key of [...visualKeys, 'gain'] as const) el<HTMLOutputElement>(`${key}-value`).value = `${Math.round(Number(input(key).value) * 10) / 10}%`;
  el<HTMLOutputElement>('sparsity-value').value = Number(input('sparsity').value) <= 35 ? '촘촘' : Number(input('sparsity').value) <= 72 ? '보통' : '여유';
  el<HTMLOutputElement>('bpm-value').value = `${Math.round(Number(input('bpm').value) * 10) / 10} BPM`;
  el<HTMLOutputElement>('duration-value').value = `${Math.round(Number(input('duration').value) * 10) / 10}초`;
  const mode = modes[select('mode').value];
  el('mode-name').textContent = mode.title;
  el('mode-description').textContent = mode.description;
  const detail: Record<string, { depth: [string, string]; density: [string, string]; connection: [string, string] }> = {
    moonwater: { depth: ['공간의 깊이', '빛의 층을 가깝게 ↔ 멀리'], density: ['입자 수', '성기게 ↔ 촘촘하게'], connection: ['물결 선', '약하게 ↔ 뚜렷하게'] },
    fractal: { depth: ['반복 깊이', '단순하게 ↔ 반복을 깊게 · 부하 증가'], density: ['가느다란 무늬', '얇게 ↔ 넓게'], connection: ['선의 강도', '은은하게 ↔ 뚜렷하게'] },
    mandelbulb: { depth: ['입체 반복 깊이', '단순하게 ↔ 반복을 깊게 · 부하 증가'], density: ['구조 복잡도', '단순한 표면 ↔ 복잡한 표면'], connection: ['가장자리 빛', '은은하게 ↔ 뚜렷하게'] },
  };
  const selected = detail[select('mode').value];
  for (const key of ['depth', 'density', 'connection'] as const) { el(`${key}-label`).textContent = selected[key][0]; el(`${key}-help`).textContent = selected[key][1]; input(key).setAttribute('aria-label', selected[key][0]); }
}
let workflow = defaultWorkflow();
const planKeys = ['music', 'visual', 'notation', 'input'] as const;
function updateWorkflowPreview() {
  el('plan-summary').textContent = `${musicTools[workflow.music]} · ${visualTools[workflow.visual]}`;
  const mappings = workflow.mappings.length ? workflow.mappings.map((m) => `${mappingSources[m.source]} → ${mappingTargets[m.target]}`).join(' / ') : '매핑 계획 없음';
  el('workflow-preview').textContent = `계획 도구: 입력 ${inputTools[workflow.input]} · 음악 ${musicTools[workflow.music]} · 화면 ${visualTools[workflow.visual]} · 악보 ${notationTools[workflow.notation]} / ${mappings}`;
  el('mapping-empty').hidden = workflow.mappings.length > 0;
  el<HTMLButtonElement>('add-mapping').disabled = workflow.mappings.length >= 8;
}
function renderWorkflow() {
  for (const key of planKeys) select(`plan-${key}`).value = workflow[key];
  const list = el('mapping-list'); list.replaceChildren();
  workflow.mappings.forEach((mapping, index) => {
    const row = document.createElement('div'); row.className = 'mapping-row';
    const source = document.createElement('select'); source.setAttribute('aria-label', `매핑 ${index + 1} 입력`);
    const target = document.createElement('select'); target.setAttribute('aria-label', `매핑 ${index + 1} 대상`);
    for (const [value, label] of Object.entries(mappingSources)) source.add(new Option(label, value));
    for (const [value, label] of Object.entries(mappingTargets)) target.add(new Option(label, value));
    source.value = mapping.source; target.value = mapping.target;
    source.addEventListener('change', () => { mapping.source = source.value as Mapping['source']; updateWorkflowPreview(); });
    target.addEventListener('change', () => { mapping.target = target.value as Mapping['target']; updateWorkflowPreview(); });
    const arrow = document.createElement('span'); arrow.textContent = '→'; arrow.setAttribute('aria-hidden', 'true');
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제'; remove.setAttribute('aria-label', `매핑 ${index + 1} 삭제`);
    remove.addEventListener('click', () => { workflow.mappings.splice(index, 1); renderWorkflow(); });
    row.append(source, arrow, target, remove); list.append(row);
  });
  updateWorkflowPreview();
}
function updateUi() {
  const busy = state.status === 'generating' || state.status === 'exporting' || exporting;
  const ready = !!generatedSignature && !dirty() && state.status !== 'error' && !busy;
  generate.disabled = !engine || busy;
  generate.textContent = state.status === 'generating' ? '음악을 만드는 중…' : generatedSignature ? '음악 다시 만들기' : '음악 만들기';
  play.disabled = !ready; play.textContent = state.status === 'playing' ? 'Ⅱ 일시정지' : '▶ 재생';
  seek.disabled = !ready; wav.disabled = !ready; musicJson.disabled = !ready; video.disabled = !ready; image.disabled = !engine || busy;
  cancel.hidden = !exporting; progress.hidden = !exporting; input('load-recipe').disabled = busy; el<HTMLButtonElement>('reset-visual').disabled = exporting || !engine;
  for (const key of musicKeys) (el<HTMLInputElement | HTMLSelectElement>(key)).disabled = busy;
  for (const key of [...visualKeys, 'mode']) (el<HTMLInputElement | HTMLSelectElement>(key)).disabled = exporting;
  const duration = generatedSignature && !dirty() ? state.duration : musicConfig().duration;
  seek.max = String(duration || musicConfig().duration); seek.value = String(Math.min(state.time, Number(seek.max)));
  const measured = Math.max(0, Math.min(1, Number.isFinite(state.rms) ? state.rms : 0));
  el<HTMLMeterElement>('rms').value = measured; el<HTMLOutputElement>('rms-value').value = `${Math.round(measured * 100)}%`;
  el<HTMLOutputElement>('clock').value = `${format(state.time)} / ${format(duration)}`;
  el('source-badge').textContent = dirty() ? '재생성 필요' : generatedSignature ? '음악 생성 완료' : '아직 만들지 않음';
  el('music-note').textContent = dirty() ? '음악 설정이 바뀌었습니다. 다시 만들면 재생과 저장이 가능합니다.' : generatedSignature ? '현재 음악은 위 설정으로 만들어졌습니다.' : '음악은 자동 재생되지 않습니다.';
  const texts: Record<string, string> = { idle: '먼저 음악을 만들어 보세요. 소리는 재생 버튼을 누를 때 시작합니다.', generating: '음악을 만들고 있습니다…', ready: '음악이 준비되었습니다. 재생을 누르면 소리가 시작됩니다.', playing: '음악과 화면이 같은 시간으로 움직입니다.', exporting: '음악과 화면을 영상으로 기록하고 있습니다.', error: state.error || '작업을 완료하지 못했습니다.' };
  status.textContent = message || (dirty() && !busy ? '음악 설정이 바뀌었습니다. 음악을 다시 만들어 주세요.' : texts[state.status]);
  status.classList.toggle('error', state.status === 'error');
}
try {
  engine = createWorkbenchEngine(canvas, (next) => { state = next; if (next.status === 'error') message = ''; updateUi(); });
} catch (error) {
  state.status = 'error'; state.error = error instanceof Error ? error.message : String(error);
}
updateValues(); renderWorkflow(); engine?.setVisual(visualConfig()); updateUi();
for (const key of musicKeys) el<HTMLInputElement | HTMLSelectElement>(key).addEventListener('input', () => {
  message = ''; if (state.status === 'playing') engine?.pause(); updateValues(); updateUi();
});
for (const key of [...visualKeys, 'mode']) el<HTMLInputElement | HTMLSelectElement>(key).addEventListener('input', () => { message = ''; updateValues(); engine?.setVisual(visualConfig()); updateUi(); });
for (const key of planKeys) select(`plan-${key}`).addEventListener('change', () => {
  workflow = { ...workflow, [key]: select(`plan-${key}`).value } as WorkflowPlan;
  updateWorkflowPreview();
});
el<HTMLButtonElement>('add-mapping').addEventListener('click', () => { if (workflow.mappings.length < 8) { workflow.mappings.push({ source:'motion', target:'noteDensity' }); renderWorkflow(); } });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-preset]')) button.addEventListener('click', () => {
  if (button.dataset.preset === 'art') workflow = { music:'strudel', visual:'hydra', notation:'none', input:'opencv', mappings:[{source:'motion',target:'noteDensity'},{source:'brightness',target:'timbre'}] };
  else if (button.dataset.preset === 'web') workflow = { music:'tonejs', visual:'webgl', notation:'verovio', input:'none', mappings:[] };
  else workflow = { music:'sardine', visual:'webgl', notation:'none', input:'opencv', mappings:[{source:'motion',target:'noteDensity'}] };
  renderWorkflow();
});
el<HTMLButtonElement>('reset-visual').addEventListener('click', () => {
  select('mode').value = 'moonwater';
  const defaults = { depth:55, density:55, bloom:35, connection:55, scale:50, motion:40, response:55 };
  for (const key of visualKeys) input(key).value = String(defaults[key]);
  message = ''; updateValues(); engine?.setVisual(visualConfig()); updateUi();
});
generate.addEventListener('click', async () => {
  if (!engine) return; message = ''; generatedSignature = ''; updateUi();
  try { const config = musicConfig(); await engine.generate(config); generatedSignature = JSON.stringify(config); }
  catch (error) { state.status = 'error'; state.error = error instanceof Error ? error.message : String(error); }
  updateUi();
});
play.addEventListener('click', async () => {
  if (!engine) return; message = '';
  try { if (state.status === 'playing') engine.pause(); else await engine.play(); }
  catch (error) { state.status = 'error'; state.error = error instanceof Error ? error.message : String(error); }
  updateUi();
});
seek.addEventListener('input', () => { message = ''; engine?.seek(Number(seek.value)); updateUi(); });
wav.addEventListener('click', () => { if (engine && generatedSignature && !dirty()) download(engine.getWav(), 'ambient-lab-music.wav'); });
musicJson.addEventListener('click', () => { if (engine && generatedSignature && !dirty()) { try { download(new Blob([JSON.stringify(engine.getMusicDocument(), null, 2)], { type:'application/json' }), 'ambient-lab-music.json'); } catch (error) { message = `음악 데이터를 저장하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`; updateUi(); } } });
image.addEventListener('click', () => { canvas.toBlob((blob) => { if (blob) { download(blob, 'ambient-lab-frame.png'); message = '현재 화면을 PNG로 저장했습니다.'; } else message = '이미지를 저장하지 못했습니다.'; updateUi(); }, 'image/png'); });
video.addEventListener('click', async () => {
  if (!engine || !generatedSignature || dirty()) return; message = ''; exporting = true; progress.value = 0; updateUi();
  try { const blob = await engine.exportVideo((fraction) => { progress.value = Math.max(0, Math.min(1, fraction)); }); download(blob, 'ambient-lab-film.webm'); message = '영상 기록이 완료되었습니다.'; }
  catch (error) { message = `영상 기록을 완료하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`; }
  finally { exporting = false; updateUi(); }
});
cancel.addEventListener('click', () => { engine?.cancelExport(); message = '영상 기록을 취소하고 있습니다.'; updateUi(); });
const recipeStatus = el('recipe-status');
el<HTMLButtonElement>('save-recipe').addEventListener('click', () => {
  const recipe = parseRecipe({ version:2, source:'generated', music:musicConfig(), visual:visualConfig(), workflow });
  download(new Blob([JSON.stringify(recipe, null, 2)], { type:'application/json' }), 'ambient-lab-recipe.json');
  recipeStatus.textContent = '음악·화면 설정과 연결 계획을 저장했습니다.';
});
input('load-recipe').addEventListener('change', async () => {
  const file = input('load-recipe').files?.[0]; if (!file) return;
  try {
    if (file.size > 256 * 1024) throw new Error('설정 파일은 256KB 이하여야 합니다.');
    const recipe = parseRecipe(JSON.parse(await file.text()));
    if (state.status === 'generating' || state.status === 'exporting' || exporting) throw new Error('진행 중인 작업이 끝난 뒤 설정을 불러와 주세요.');
    if (state.status === 'playing') engine?.pause();
    const m = recipe.music, v = recipe.visual;
    for (const key of musicKeys) el<HTMLInputElement | HTMLSelectElement>(key).value = String(key === 'sparsity' || key === 'gain' ? Number(m[key]) * 100 : m[key]);
    select('mode').value = v.mode; for (const key of visualKeys) input(key).value = String(v[key] * 100);
    workflow = recipe.workflow;
    message = ''; updateValues(); renderWorkflow(); engine?.setVisual(visualConfig()); updateUi();
    recipeStatus.textContent = generatedSignature && !dirty() ? '설정을 불러왔습니다. 현재 음악과 일치합니다.' : generatedSignature ? '설정을 불러왔습니다. 음악을 다시 만들어 주세요.' : '설정을 불러왔습니다. 음악을 만들어 주세요.';
  } catch (error) { recipeStatus.textContent = `설정을 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`; }
  finally { input('load-recipe').value = ''; }
});
window.addEventListener('beforeunload', () => engine?.dispose());
