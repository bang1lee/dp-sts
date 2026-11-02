import { encodeWav } from '@ambient-lab/audiovisual';
import { queryNotePattern, renderAudio } from '@ambient-lab/audiovisual/offline';
import { makeComposition, type MusicConfig } from './workbench-engine';
import type { Recipe } from './workbench-workflow';

export type SampleId='kick'|'snare'|'hat'|'rim';
export interface AudioFeature { rms:number; low:number; high:number; onset:number }
export interface DrumEvent { timeSeconds:number; sampleId:SampleId; gain:number; pan:number; bar:number; step:number; section:string }
export interface RhythmStep { index:number; gain:number; pan:number; ratchet:1|2 }
export interface BarPattern { bar:number; section:string; sampleId:SampleId; steps:RhythmStep[] }
export interface KitManifest { version:number; id:string; sampleRate:number; origin:string; license:string; generator:string; files:Array<{id:SampleId;file:string;sha256:string;frames:number;description:string}> }
export interface RecipeAudio { channels:Float32Array[]; sampleRate:number; durationSeconds:number; wav:Uint8Array; features:AudioFeature[]; featureFps:number; events:DrumEvent[]; kit:KitManifest; metadata:Record<string,unknown> }

/** Decode the project's mono, 48 kHz PCM16 WAV sample assets; reject other formats. */
export function readPcm16Mono(buffer:ArrayBuffer):Float32Array {
  const v=new DataView(buffer);if(v.byteLength<44)throw new Error('Invalid WAV sample');
  const word=(p:number)=>String.fromCharCode(...Array.from({length:4},(_,i)=>v.getUint8(p+i)));
  if(word(0)!=='RIFF'||word(8)!=='WAVE')throw new Error('Invalid WAV header');
  let offset=12,data=-1,size=0,format=false;
  while(offset+8<=v.byteLength){const id=word(offset),n=v.getUint32(offset+4,true),start=offset+8;if(start+n>v.byteLength)throw new Error('Truncated WAV sample');
    if(id==='fmt '){if(n<16||v.getUint16(start,true)!==1||v.getUint16(start+2,true)!==1||v.getUint32(start+4,true)!==48000||v.getUint16(start+14,true)!==16)throw new Error('Sample must be mono 48 kHz PCM16');format=true;}
    if(id==='data'){data=start;size=n;}offset=start+n+(n%2);
  }
  if(!format||data<0||size%2)throw new Error('Invalid WAV sample data');
  const out=new Float32Array(size/2);for(let i=0;i<out.length;i++)out[i]=v.getInt16(data+i*2,true)/32768;return out;
}

const unit=(n:number)=>Math.max(0,Math.min(1,n));
function randomAt(seed:number,bar:number,step:number,voice:number):number {
  let n=(seed ^ Math.imul(bar+1,0x9e3779b1) ^ Math.imul(step+1,0x85ebca6b) ^ Math.imul(voice+1,0xc2b2ae35))>>>0;
  n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return ((n^(n>>>16))>>>0)/4294967296;
}
function sectionAt(t:number,duration:number):string {
  const p=t/duration;
  return p<.09?'opening':p<.30?'broken':p<.49?'variation':p<.62?'space':p<.87?'return':'outro';
}

/** Rhythm is a set of 32-step Strudel mini-notation patterns per four-beat bar.
 * The internal 32-step grid corresponds to 16ths at twice the recipe BPM. */
export function makeRhythmPlan(music:MusicConfig,seed=20261103):BarPattern[] {
  if(!Number.isFinite(music.bpm)||music.bpm<=0||!Number.isFinite(music.duration)||music.duration<=0)throw new Error('Invalid tempo or duration');
  const barSeconds=240/music.bpm, bars=Math.ceil(music.duration/barSeconds),plans:BarPattern[]=[];
  for(let bar=1;bar<bars;bar++){
    const t=bar*barSeconds;if(t>=music.duration-1)break;
    const section=sectionAt(t,music.duration), opening=section==='opening',space=section==='space',outro=section==='outro',variation=section==='variation',full=section==='return';
    const intensity=opening?.44:space?.40:outro?.48:full?1:variation?.88:.76;
    const structures:Record<SampleId,number[]>={
      kick:opening?[0,18]:space?[0,20]:outro?[0,16,23]:variation?[0,7,10,16,22,27]:full?[0,7,14,16,23,29]:[0,7,16,23],
      snare:opening?[]:space?[12,28]:outro?[12,28]:[4,12,20,28],
      hat:opening?[6,22]:space?[6,14,22,30]:outro?[2,10,18,26]:[2,6,10,14,18,22,26,30],
      rim:opening?[23]:space?[15]:outro?[15,31]:[7,15,23,31],
    };
    if(!opening&&!space&&!outro&&bar%4===3)structures.snare.push(11,27);
    const voices:SampleId[]=['kick','snare','hat','rim'];
    for(let voice=0;voice<voices.length;voice++){
      const sampleId=voices[voice];const steps:RhythmStep[]=[];
      for(const index of structures[sampleId]){
        const r=randomAt(seed,bar,index,voice);
        if(sampleId==='hat'&&!opening&&!space&&r<.13)continue;
        if(sampleId==='rim'&&!opening&&r<.40)continue;
        const ghost=sampleId==='snare'&&(index===11||index===27);
        const base=sampleId==='kick'?.76:sampleId==='snare'?(ghost?.16:.62):sampleId==='hat'?.25:.26;
        const variationGain=.78+.22*randomAt(seed+1,bar,index,voice);
        const pan=sampleId==='kick'?0:sampleId==='snare'?(r-.5)*.16:(r-.5)*.65;
        const ratchet:1|2=(sampleId==='hat'&&!space&&!outro&&bar%4===3&&index===26)?2:1;
        steps.push({index,gain:base*intensity*variationGain,pan,ratchet});
      }
      if(steps.length)plans.push({bar,section,sampleId,steps});
    }
  }
  return plans;
}

export function mixSampledKit(pad:Float32Array[],kit:Record<SampleId,Float32Array>,events:DrumEvent[],sampleRate:number,masterGain:number) {
  if(pad.length!==2||pad[0].length!==pad[1].length||!Number.isFinite(masterGain)||masterGain<0||masterGain>1)throw new Error('Invalid mix input');
  const channels=pad.map(c=>Float32Array.from(c,s=>s*masterGain));
  for(const event of events){const sample=kit[event.sampleId];if(!sample)throw new Error(`Missing sample ${event.sampleId}`);const start=Math.round(event.timeSeconds*sampleRate);
    const pan=Math.max(-1,Math.min(1,event.pan)),left=Math.cos((pan+1)*Math.PI/4)*event.gain,right=Math.sin((pan+1)*Math.PI/4)*event.gain;
    for(let i=Math.max(0,-start);i<sample.length&&start+i<channels[0].length;i++){const n=sample[i];channels[0][start+i]+=n*left;channels[1][start+i]+=n*right;}
  }
  let peak=0;for(const c of channels)for(const n of c){if(!Number.isFinite(n))throw new Error('Non-finite PCM');peak=Math.max(peak,Math.abs(n));}
  const attenuation=peak>.94?.94/peak:1;
  if(attenuation<1)for(const c of channels)for(let i=0;i<c.length;i++)c[i]*=attenuation;
  return {channels,peak:peak*attenuation,attenuation};
}

/** Features are measured from the final stereo PCM, in non-overlapping frames. */
export function measureFeatures(channels:Float32Array[],sampleRate:number,fps=30):AudioFeature[] {
  if(!channels.length||!channels[0].length||channels.some(c=>c.length!==channels[0].length)||!Number.isFinite(sampleRate)||sampleRate<=0||!Number.isFinite(fps)||fps<=0)throw new Error('Invalid feature input');
  const count=Math.ceil(channels[0].length/sampleRate*fps),features:AudioFeature[]=[];
  const lowAlpha=1-Math.exp(-2*Math.PI*180/sampleRate),highAlpha=1-Math.exp(-2*Math.PI*2500/sampleRate);
  const lowState=channels.map(()=>0),highState=channels.map(()=>0);let previousRms=0;
  for(let frame=0;frame<count;frame++){
    const a=Math.round(frame*sampleRate/fps),b=Math.min(channels[0].length,Math.round((frame+1)*sampleRate/fps));let energy=0,lo=0,hi=0;
    for(let i=a;i<b;i++){for(let ch=0;ch<channels.length;ch++){const value=channels[ch][i];energy+=value*value;lowState[ch]+=lowAlpha*(value-lowState[ch]);highState[ch]+=highAlpha*(value-highState[ch]);lo+=lowState[ch]*lowState[ch];const h=value-highState[ch];hi+=h*h;}}
    const n=Math.max(1,b-a)*channels.length,raw=Math.sqrt(energy/n),rms=unit(raw*10);
    features.push({rms,low:unit(Math.sqrt(lo/n)*10),high:unit(Math.sqrt(hi/n)*12),onset:unit(Math.max(0,rms-previousRms)*5)});previousRms=rms;
  }
  return features;
}

async function loadKit():Promise<{manifest:KitManifest;samples:Record<SampleId,Float32Array>}> {
  const [k,s,h,r,m]=await Promise.all([
    import('../../../assets/original-kit/kick.wav?url'),
    import('../../../assets/original-kit/snare.wav?url'),
    import('../../../assets/original-kit/hat.wav?url'),
    import('../../../assets/original-kit/rim.wav?url'),
    import('../../../assets/original-kit/manifest.json?url'),
  ]);
  const responses=await Promise.all([k.default,s.default,h.default,r.default,m.default].map(url=>fetch(url)));
  if(responses.some(response=>!response.ok))throw new Error('원본 드럼 샘플을 읽을 수 없습니다.');
  const [kb,sb,hb,rb,manifest]=await Promise.all([
    responses[0].arrayBuffer(),responses[1].arrayBuffer(),responses[2].arrayBuffer(),responses[3].arrayBuffer(),responses[4].json(),
  ]);
  const typed=manifest as KitManifest;
  if(typed.version!==1||typed.id!=='ambient-lab-original-kit-v1'||typed.sampleRate!==48000)throw new Error('드럼 킷 정보가 올바르지 않습니다.');
  const samples:Record<SampleId,Float32Array>={kick:readPcm16Mono(kb),snare:readPcm16Mono(sb),hat:readPcm16Mono(hb),rim:readPcm16Mono(rb)};
  for(const id of ['kick','snare','hat','rim'] as const){const info=typed.files.find(f=>f.id===id);if(!info||info.frames!==samples[id].length)throw new Error(`드럼 샘플 길이가 다릅니다: ${id}`);}
  return {manifest:typed,samples};
}

/** Query the actual Strudel mini-notation events, then schedule stored WAV samples. */
async function resolveRhythm(plan:BarPattern[],music:MusicConfig):Promise<DrumEvent[]> {
  const cps=music.bpm/240,events:DrumEvent[]=[];
  for(const item of plan){
    const positions=new Map(item.steps.map(step=>[step.index,step]));
    const tokens=Array.from({length:32},(_,i)=>{const step=positions.get(i);return !step?'~':step.ratchet===2?`[${i} ${i}]`:String(i);});
    const queried=await queryNotePattern(tokens.join(' '),item.bar,item.bar+1,cps);
    for(const event of queried){
      const stepIndex=Number(event.note);const step=positions.get(stepIndex);
      if(!step)throw new Error(`Strudel 드럼 이벤트를 해석할 수 없습니다: ${String(event.note)}`);
      const timeSeconds=event.beginCycles/cps;
      if(timeSeconds<0||timeSeconds>=music.duration-.34)continue;
      const endFade=unit((music.duration-timeSeconds)/4);
      events.push({timeSeconds,sampleId:item.sampleId,gain:step.gain*music.gain*endFade,pan:step.pan,bar:item.bar,step:step.index,section:item.section});
    }
  }
  return events.sort((a,b)=>a.timeSeconds-b.timeSeconds||a.sampleId.localeCompare(b.sampleId));
}

export async function createRecipeAudio(recipe:Recipe,onProgress?:(stage:'samples'|'pad'|'rhythm'|'mix'|'features')=>void):Promise<RecipeAudio> {
  const music={...recipe.music};
  // Reuse the existing, verified Strudel composition and synth without modifying it.
  const composition=makeComposition(music);
  onProgress?.('samples');const kit=await loadKit();
  onProgress?.('pad');const pad=await renderAudio(composition);
  onProgress?.('rhythm');const seed=20261103,patterns=makeRhythmPlan(music,seed),events=await resolveRhythm(patterns,music);
  if(!events.length)throw new Error('드럼 이벤트가 생성되지 않았습니다.');
  onProgress?.('mix');const mixed=mixSampledKit(pad.channels,kit.samples,events,composition.audio.sampleRate,music.gain);
  onProgress?.('features');const featureFps=30,features=measureFeatures(mixed.channels,composition.audio.sampleRate,featureFps);
  return {channels:mixed.channels,sampleRate:composition.audio.sampleRate,durationSeconds:music.duration,wav:encodeWav(mixed.channels,composition.audio.sampleRate),features,featureFps,events,kit:kit.manifest,
    metadata:{version:1,source:'recipe-film-audio',audioEngine:'Strudel 1.3.0 pad and Strudel mini-notation drum event queries; original sampled WAV kit',
      originalRecipeMusic:music,tempoBpm:music.bpm,doubleTimeBpm:music.bpm*2,barSeconds:240/music.bpm,grid:'32 steps per four-beat bar',
      rhythmSeed:seed,padSeed:composition.seed,padNotes:composition.audio.notes,padEvents:pad.scheduledEvents,
      sections:['opening','broken','variation','space','return','outro'],patterns,drumGainMeaning:'event gain includes recipe master gain; master attenuation is applied afterward',
      masterAttenuation:mixed.attenuation,peak:mixed.peak,sampleFrames:mixed.channels[0].length,
      featureMethod:'30 fps non-overlapping final PCM RMS; low-pass 180 Hz; high-pass 2500 Hz; onset is positive RMS rise; normalized and clamped',
      provenance:'Original generated one-shot samples; no third-party or artist recordings. Workflow choices in the input recipe are plans, not live integrations.'}};
}
