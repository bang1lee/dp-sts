import type { MusicConfig, VisualConfig } from './workbench-engine';

export const RECIPE_SHA256 = '51912233f9dba4544d07a2ee397112a7eda31195003056db7bc81d667c264b2a';
export const KIT_SHA256 = '2139869b7b44ad0d4d3a036f667e5681991fa372293a5903054119f265207d32';
export const cameraPaths = ['original','orbit','arc','close'] as const;
export type CameraPath = typeof cameraPaths[number];
export interface Direction {
  power:number; stretch:number; rotation:number; spin:number; morphAmount:number; morphSpeed:number;
  cameraPath:CameraPath; cameraSpeed:number; cameraDistance:number; cameraHeight:number; lookX:number; lookY:number; fov:number;
  bloom:number; colorStrength:number; reaction:boolean;
}
export interface MusicIdentity { recipeSha256:string; kitSha256:string; music:MusicConfig }
export interface DirectionDocument { version:1; kind:'ambient-lab/recipe-film-direction'; music:MusicIdentity; render:{width:number;height:number;fps:30}; direction:Direction }
export const directionRanges = {
  power:[2,12],stretch:[.65,1.5],rotation:[-180,180],spin:[-8,8],morphAmount:[0,2],morphSpeed:[0,1],
  cameraSpeed:[0,2],cameraDistance:[.75,1.75],cameraHeight:[-1,1],lookX:[-.75,.75],lookY:[-.75,.75],fov:[22,65],bloom:[0,1],colorStrength:[0,1.5],
} as const;
export type NumericDirectionKey = keyof typeof directionRanges;
export function originalDirection(visual:VisualConfig):Direction {
  return {power:6+Math.floor(visual.density*4+.5),stretch:1,rotation:0,spin:0,morphAmount:0,morphSpeed:.3,cameraPath:'original',cameraSpeed:1,cameraDistance:1,cameraHeight:0,lookX:0,lookY:0,fov:34,bloom:visual.bloom,colorStrength:1,reaction:true};
}
export function presetDirection(name:'original'|'slow-orbit'|'rising-arc'|'near-surface',visual:VisualConfig):Direction {
  const d=originalDirection(visual);
  if(name==='slow-orbit')return {...d,cameraPath:'orbit',cameraSpeed:.5,spin:1.2};
  if(name==='rising-arc')return {...d,cameraPath:'arc',cameraSpeed:.75,cameraHeight:-.15,stretch:1.15,morphAmount:.45,morphSpeed:.3};
  if(name==='near-surface')return {...d,cameraPath:'close',cameraSpeed:.4,cameraDistance:.82,fov:28,morphAmount:.25,morphSpeed:.25};
  return d;
}
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const exactKeys=(o:Record<string,unknown>,keys:readonly string[])=>Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const fail=(message:string):never=>{throw new Error(message);};
export function parseDirectionDocument(value:unknown,expected:MusicIdentity):DirectionDocument {
  if(!record(value)||!exactKeys(value,['version','kind','music','render','direction'])||value.version!==1||value.kind!=='ambient-lab/recipe-film-direction')return fail('지원하지 않는 방향 설정 형식입니다.');
  const identity=value.music;
  if(!record(identity)||!exactKeys(identity,['recipeSha256','kitSha256','music'])||identity.recipeSha256!==expected.recipeSha256||identity.kitSha256!==expected.kitSha256||!record(identity.music))return fail('이 작품의 음악 출처와 일치하지 않습니다.');
  const keys=['mood','root','bpm','sparsity','duration','gain'] as const;
  if(!exactKeys(identity.music,keys)||keys.some(k=>identity.music && (identity.music as Record<string,unknown>)[k]!==expected.music[k]))return fail('이 작품의 음악 설정과 일치하지 않습니다.');
  const render=value.render;
  if(!record(render)||!exactKeys(render,['width','height','fps'])||render.fps!==30||![[960,540],[1280,720],[1920,1080]].some(([w,h])=>render.width===w&&render.height===h))return fail('영상 크기 또는 프레임 수가 올바르지 않습니다.');
  const d=value.direction;
  if(!record(d)||!exactKeys(d,[...Object.keys(directionRanges),'cameraPath','reaction'])||!cameraPaths.some(p=>p===d.cameraPath)||typeof d.reaction!=='boolean')return fail('방향 설정 항목이 올바르지 않습니다.');
  for(const [key,[min,max]] of Object.entries(directionRanges))if(typeof d[key]!=='number'||!Number.isFinite(d[key])||(d[key] as number)<min||(d[key] as number)>max)return fail(`${key} 값이 허용 범위를 벗어났습니다.`);
  return {version:1,kind:'ambient-lab/recipe-film-direction',music:{recipeSha256:expected.recipeSha256,kitSha256:expected.kitSha256,music:{...expected.music}},render:{width:render.width as number,height:render.height as number,fps:30},direction:{...d} as unknown as Direction};
}
export function makeDirectionDocument(direction:Direction,size:string,expected:MusicIdentity):DirectionDocument {
  const dimensions:Record<string,[number,number]>={'960x540':[960,540],'1280x720':[1280,720],'1920x1080':[1920,1080]};
  const [width,height]=dimensions[size]??fail('지원하지 않는 영상 크기입니다.');
  return parseDirectionDocument({version:1,kind:'ambient-lab/recipe-film-direction',music:expected,render:{width,height,fps:30},direction},expected);
}
export const focalForFov=(fov:number)=>1.64*Math.tan(34*Math.PI/360)/Math.tan(fov*Math.PI/360);
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
/** Absolute-time evaluation is used identically for preview, stills and fixed-frame output. */
export function evaluateDirection(d:Direction,t:number,duration:number,visual:Pick<VisualConfig,'scale'|'motion'>){
  const phase=Math.max(0,Math.min(1,t/duration)),reveal=smooth(0,.12,phase),settle=smooth(.77,1,phase),passage=smooth(.58,.69,phase)*(1-smooth(.75,.86,phase));
  const base=4.25/(.70+visual.scale*.78);let radius=(base+.80*(1-reveal)+.50*passage+.25*settle)*d.cameraDistance;
  const angle=t*visual.motion*.033*d.cameraSpeed;let y=.09+d.cameraHeight;
  if(d.cameraPath==='orbit')radius=base*d.cameraDistance;
  if(d.cameraPath==='arc'){radius=base*d.cameraDistance;y+=-.5+phase*1.0;}
  if(d.cameraPath==='close')radius=(base*.83+.20*Math.sin(phase*Math.PI))*d.cameraDistance;
  return {x:Math.sin(angle)*radius,y,z:Math.cos(angle)*radius,lookX:d.lookX,lookY:d.lookY,fov:d.fov,
    shapePower:Math.max(2,Math.min(12,d.power+d.morphAmount*Math.sin(t*d.morphSpeed*.35))),shapeRotation:(d.rotation+d.spin*t)*Math.PI/180,shapeStretch:d.stretch,bloom:d.bloom,colorStrength:d.colorStrength};
}
