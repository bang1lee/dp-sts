import { encodeWav } from '@ambient-lab/audiovisual';
import { measureFeatures, readPcm16Mono, type AudioFeature } from './recipe-film-audio';
import type { FireKitManifest, FireSampleId } from './flower-audio';

/** Based on runs/recipe-film-v01/source-recipe.json, not a guessed tempo. */
export const EXPANSION_DURATION=30;
export const EXPANSION_SOURCE_BPM=73.2085240142375;
export const EXPANSION_BPM=EXPANSION_SOURCE_BPM*1.5;
export const EXPANSION_BEAT_SECONDS=60/EXPANSION_BPM;
export const EXPANSION_SAMPLE_RATE=48000;
export const EXPANSION_FEATURE_FPS=60;
export type ExpansionSamples=Record<FireSampleId,Float32Array>;
export interface ExpansionAudio {sampleRate:number;channels:Float32Array[];wav:Uint8Array;duration:number;bpm:number;beatTimes:number[];features:AudioFeature[];featureFps:number;metadata:Record<string,unknown>}
const IDS:FireSampleId[]=['ember01','ember02','ember03','ember04','ember05','ember06'];
const clamp=(value:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,value));
function rand(index:number,salt:number){let x=(20261103^Math.imul(index+1,0x9e3779b1)^Math.imul(salt+1,0x85ebca6b))>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return ((x^(x>>>16))>>>0)/4294967296;}
export function expansionBeatTimes():number[]{return Array.from({length:Math.ceil(EXPANSION_DURATION/EXPANSION_BEAT_SECONDS)},(_,i)=>i*EXPANSION_BEAT_SECONDS).filter(t=>t<EXPANSION_DURATION);}

/** Linear interpolation of measured 60 Hz frames, for the visual renderer. */
export function featureAt(features:AudioFeature[],time:number):AudioFeature {
  if(!features.length)return {rms:0,low:0,high:0,onset:0};
  const p=clamp(time*EXPANSION_FEATURE_FPS,0,features.length-1),i=Math.floor(p),a=features[i],b=features[Math.min(i+1,features.length-1)],f=p-i;
  return {rms:a.rms+(b.rms-a.rms)*f,low:a.low+(b.low-a.low)*f,high:a.high+(b.high-a.high)*f,onset:a.onset+(b.onset-a.onset)*f};
}

/** Excite two damped tuned resonators with the actual fire sample. No oscillator pad. */
function resonate(sample:Float32Array,freq:number,seconds:number):Float32Array {
  const length=Math.round(seconds*EXPANSION_SAMPLE_RATE),out=new Float32Array(length);
  let y1=0,y2=0,z1=0,z2=0,peak=0;
  const r=Math.exp(-1/(EXPANSION_SAMPLE_RATE*1.05)),q=Math.exp(-1/(EXPANSION_SAMPLE_RATE*.52));
  const c=2*r*Math.cos(2*Math.PI*freq/EXPANSION_SAMPLE_RATE),d=2*q*Math.cos(2*Math.PI*freq*2.003/EXPANSION_SAMPLE_RATE);
  for(let i=0;i<length;i++){
    const input=i<sample.length?sample[i]:0;
    const y=input+c*y1-r*r*y2,z=input+d*z1-q*q*z2;
    y2=y1;y1=y;z2=z1;z1=z;
    const attack=Math.min(1,i/(EXPANSION_SAMPLE_RATE*.018));
    const value=(y+z*.18)*attack;out[i]=value;peak=Math.max(peak,Math.abs(value));
  }
  if(peak>0)for(let i=0;i<length;i++)out[i]/=peak;
  return out;
}
function addVoice(channels:Float32Array[],sample:Float32Array,start:number,gain:number,pan:number,rate=1,reverse=false,hann=false){
  const index=Math.round(start*EXPANSION_SAMPLE_RATE),length=Math.ceil(sample.length/rate);
  const left=Math.cos((clamp(pan,-1,1)+1)*Math.PI/4)*gain,right=Math.sin((clamp(pan,-1,1)+1)*Math.PI/4)*gain;
  for(let i=0;i<length&&index+i<channels[0].length;i++){
    if(index+i<0)continue;
    const pos=reverse?sample.length-1-i*rate:i*rate,a=Math.floor(pos),f=pos-a;
    let v=(sample[a]??0)*(1-f)+(sample[a+1]??0)*f;
    if(hann)v*=Math.sin(Math.PI*i/Math.max(1,length-1))**2;
    channels[0][index+i]+=v*left;channels[1][index+i]+=v*right;
  }
}

/** Offline, deterministic 48 kHz mix. Every input layer comes from the six fire WAVs. */
export function renderExpansionAudio(samples:ExpansionSamples,kit?:FireKitManifest):ExpansionAudio {
  for(const id of IDS)if(!samples[id]?.length)throw new Error(`Missing fire source: ${id}`);
  const frames=EXPANSION_DURATION*EXPANSION_SAMPLE_RATE,channels=[new Float32Array(frames),new Float32Array(frames)];
  const beatTimes=expansionBeatTimes();
  // Exact quarter-note grid. Tiny dynamic and pan changes do not alter timing.
  for(let i=0;i<beatTimes.length;i++){
    const strength=(i%4===0?1:.78)*(.92+.08*rand(i,1));
    addVoice(channels,samples[IDS[i%IDS.length]],beatTimes[i],.36*strength,(rand(i,2)-.5)*.38,.98+.04*rand(i,3));
  }
  // D3 is the tonal center; D2 supplies an occasional lower octave. Slow, sparse
  // D-minor color is made exclusively by tuned resonators fed with the crackles.
  const notes=[50,57,53,60,50,57,53,62,50,60,53,57,50,62];
  const noteRecords:Array<{time:number;midi:number;source:FireSampleId}>=[];
  for(let i=0;i<notes.length;i++){
    const time=beatTimes[i*4];if(time===undefined)break;
    const midi=notes[i],source=IDS[(i*5+1)%IDS.length];
    const hz=440*2**((midi-69)/12),resonance=resonate(samples[source],hz,3.6);
    addVoice(channels,resonance,time,.105,(i%2?1:-1)*.22);
    if(i%2===0){const bass=resonate(samples[IDS[(i+3)%IDS.length]],hz/2,3.2);addVoice(channels,bass,time,.065,0);}
    noteRecords.push({time,midi,source});
  }
  // Reversed, windowed sample grains spread between phrases; no new samples.
  for(let i=0;i<14;i++){
    const time=1.1+i*2.05;if(time>=28.5)break;
    addVoice(channels,samples[IDS[(i*3+2)%IDS.length]],time,.045,(rand(i,8)-.5)*1.2,.33+.14*rand(i,9),true,true);
  }
  // Cross-fed filtered delay sends the actual mix into a soft stereo space.
  const leftDelay=Math.round(.193*EXPANSION_SAMPLE_RATE),rightDelay=Math.round(.277*EXPANSION_SAMPLE_RATE);
  let lowL=0,lowR=0;
  for(let i=0;i<frames;i++){
    const l=i>=leftDelay?channels[0][i-leftDelay]:0,r=i>=rightDelay?channels[1][i-rightDelay]:0;
    lowL+=.07*(l-lowL);lowR+=.07*(r-lowR);
    channels[0][i]+=lowR*.13;channels[1][i]+=lowL*.13;
    const fadeIn=Math.min(1,i/(.001*EXPANSION_SAMPLE_RATE));
    const fadeOut=Math.min(1,(frames-1-i)/(1.3*EXPANSION_SAMPLE_RATE));
    channels[0][i]*=Math.max(0,Math.min(fadeIn,fadeOut));channels[1][i]*=Math.max(0,Math.min(fadeIn,fadeOut));
  }
  let peak=0;for(const channel of channels)for(const value of channel){if(!Number.isFinite(value))throw new Error('Non-finite expansion audio');peak=Math.max(peak,Math.abs(value));}
  const attenuation=peak>.82?.82/peak:1;
  if(attenuation<1)for(const channel of channels)for(let i=0;i<channel.length;i++)channel[i]*=attenuation;
  const features=measureFeatures(channels,EXPANSION_SAMPLE_RATE,EXPANSION_FEATURE_FPS);
  return {sampleRate:EXPANSION_SAMPLE_RATE,channels,wav:encodeWav(channels,EXPANSION_SAMPLE_RATE),duration:EXPANSION_DURATION,bpm:EXPANSION_BPM,beatTimes,features,featureFps:EXPANSION_FEATURE_FPS,
    metadata:{version:1,sourceBpm:EXPANSION_SOURCE_BPM,tempoMultiplier:1.5,beatSeconds:EXPANSION_BEAT_SECONDS,beatCount:beatTimes.length,root:'D3',notes:noteRecords,
      soundSource:'original synthesized fire-kit WAV samples; no field recording',kitId:kit?.id??'injected-fire-kit',kitFiles:kit?.files??[],
      synthesis:'fire sample drives tuned damped resonators; reverse windowed fire grains and filtered cross-delay; no independent oscillator pad',seed:20261103,
      peak:peak*attenuation,masterAttenuation:attenuation,featureMethod:'60 Hz measured PCM RMS, low-pass, high-pass and positive RMS rise'}};
}

async function loadSamples():Promise<{samples:ExpansionSamples;manifest:FireKitManifest}>{
  const urls=await Promise.all([import('../../../assets/fire-kit/ember01.wav?url'),import('../../../assets/fire-kit/ember02.wav?url'),import('../../../assets/fire-kit/ember03.wav?url'),import('../../../assets/fire-kit/ember04.wav?url'),import('../../../assets/fire-kit/ember05.wav?url'),import('../../../assets/fire-kit/ember06.wav?url'),import('../../../assets/fire-kit/manifest.json?url')]);
  const responses=await Promise.all(urls.map(item=>fetch(item.default)));
  if(responses.some(r=>!r.ok))throw new Error('장작 소리 샘플을 읽을 수 없습니다.');
  const manifest=await responses[6].json() as FireKitManifest;
  if(manifest.id!=='ambient-lab-synthesized-fire-kit-v1'||manifest.sampleRate!==EXPANSION_SAMPLE_RATE)throw new Error('장작 소리 샘플 정보가 올바르지 않습니다.');
  const decoded=await Promise.all(responses.slice(0,6).map(async r=>readPcm16Mono(await r.arrayBuffer()))),samples={} as ExpansionSamples;
  for(let i=0;i<IDS.length;i++){const file=manifest.files.find(f=>f.id===IDS[i]);if(!file||file.frames!==decoded[i].length)throw new Error(`샘플 길이가 다릅니다: ${IDS[i]}`);samples[IDS[i]]=decoded[i];}
  return {samples,manifest};
}
export async function createExpansionAudio():Promise<ExpansionAudio>{const kit=await loadSamples();return renderExpansionAudio(kit.samples,kit.manifest);}
