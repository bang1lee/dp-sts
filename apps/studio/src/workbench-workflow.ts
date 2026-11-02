import type { MusicConfig, VisualConfig } from './workbench-engine';

export const musicTools = { strudel:'Strudel', tonejs:'Tone.js', sardine:'Sardine + SuperCollider', tidal:'TidalCycles + SuperCollider', elementary:'Elementary Audio' } as const;
export const visualTools = { webgl:'브라우저 WebGL', hydra:'Hydra', touchdesigner:'TouchDesigner', cables:'cables' } as const;
export const notationTools = { none:'사용 안 함', verovio:'Verovio' } as const;
export const inputTools = { none:'사용 안 함', opencv:'OpenCV', mediapipe:'MediaPipe' } as const;
export const mappingSources = { motion:'움직임', brightness:'밝기', handDistance:'손 사이 거리', rms:'소리 세기 RMS' } as const;
export const mappingTargets = { noteDensity:'음의 밀도', timbre:'음색', register:'음역', bloom:'빛 번짐' } as const;
type Choice<T> = keyof T;
export interface Mapping { source: Choice<typeof mappingSources>; target: Choice<typeof mappingTargets> }
export interface WorkflowPlan { music: Choice<typeof musicTools>; visual: Choice<typeof visualTools>; notation: Choice<typeof notationTools>; input: Choice<typeof inputTools>; mappings: Mapping[] }
export interface Recipe { version:2; source:'generated'; music:MusicConfig; visual:VisualConfig; workflow:WorkflowPlan }
export const defaultWorkflow = (): WorkflowPlan => ({ music:'strudel', visual:'webgl', notation:'none', input:'none', mappings:[] });
const object = (v:unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const choice = <T extends object>(values:T, v:unknown): v is keyof T => typeof v === 'string' && Object.hasOwn(values, v);
const range = (v:unknown,min:number,max:number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const visualKeys = ['depth','density','bloom','connection','scale','motion','response'] as const;
const roots = [36,38,40,41,43,45,47,48,50,52,53,55,57,60];
/** Validate first and return a fresh, normalized value; v1 never controls execution routes. */
export function parseRecipe(value:unknown): Recipe {
  if (!object(value) || (value.version !== 1 && value.version !== 2) || value.source !== 'generated' || !object(value.music) || !object(value.visual)) throw new Error('지원하지 않는 설정 형식입니다.');
  const m=value.music, v=value.visual;
  if ((typeof m.mood !== 'string' || !['moonlit','warm','mysterious'].includes(m.mood)) || !roots.includes(Number(m.root)) || typeof m.root !== 'number' || !range(m.bpm,40,120) || !range(m.duration,5,120) || !range(m.sparsity,0,1) || !range(m.gain,0,1) || (typeof v.mode !== 'string' || !['moonwater','fractal','mandelbulb'].includes(v.mode)) || !visualKeys.every(k=>range(v[k],0,1))) throw new Error('음악 또는 화면 설정의 값이 올바르지 않습니다.');
  let workflow:WorkflowPlan;
  if (value.version === 1) {
    if ((typeof value.route !== 'string' || !['browser','touchdesigner','cables'].includes(value.route)) || typeof value.analysisPlanned !== 'boolean') throw new Error('이전 작업 경로의 값이 올바르지 않습니다.');
    workflow={...defaultWorkflow(), visual:value.route === 'browser' ? 'webgl' : value.route as 'touchdesigner'|'cables', input:value.analysisPlanned ? 'opencv' : 'none'};
  } else {
    const w=value.workflow;
    if (!object(w) || !choice(musicTools,w.music) || !choice(visualTools,w.visual) || !choice(notationTools,w.notation) || !choice(inputTools,w.input) || !Array.isArray(w.mappings) || w.mappings.length > 8) throw new Error('작업 경로의 값이 올바르지 않습니다.');
    const mappings:Mapping[] = w.mappings.map((item:unknown) => {
      if (!object(item) || !choice(mappingSources,item.source) || !choice(mappingTargets,item.target)) throw new Error('매핑의 입력 또는 대상이 올바르지 않습니다.');
      return { source:item.source, target:item.target };
    });
    workflow={music:w.music,visual:w.visual,notation:w.notation,input:w.input,mappings};
  }
  return {version:2,source:'generated',music:{mood:m.mood as MusicConfig['mood'],root:m.root as number,bpm:m.bpm as number,sparsity:m.sparsity as number,duration:m.duration as number,gain:m.gain as number},visual:{mode:v.mode as VisualConfig['mode'],...Object.fromEntries(visualKeys.map(k=>[k,v[k]]))} as unknown as VisualConfig,workflow};
}
