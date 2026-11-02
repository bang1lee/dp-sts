import { encodeWav } from '@ambient-lab/audiovisual';
import { readPcm16Mono } from './recipe-film-audio';

/** A geometric crossing is also the sole source of a sound onset. */
export interface FlowerCrossing { time:number; x:number; y:number; pairs:[number,number][] }
export interface FlowerAudioTimeline { duration:number; events:FlowerCrossing[] }
export type FireSampleId = 'ember01'|'ember02'|'ember03'|'ember04'|'ember05'|'ember06';
export interface FireKitFile { id:FireSampleId; file:string; sha256:string; frames:number; seed:number; parameters:Record<string,unknown> }
export interface FireKitManifest { version:number; id:string; sampleRate:number; origin:string; description:string; license:string; generator:string; files:FireKitFile[] }
export interface FlowerSoundEvent extends FlowerCrossing { sampleId:FireSampleId; gain:number; pan:number; rate:number }
export interface FlowerAudio { channels:Float32Array[]; sampleRate:number; durationSeconds:number; wav:Uint8Array; events:FlowerSoundEvent[]; kit:FireKitManifest; metadata:Record<string,unknown> }

const RATE=48000;
const SAMPLE_IDS:FireSampleId[]=['ember01','ember02','ember03','ember04','ember05','ember06'];
const clamp=(x:number,a:number,b:number)=>Math.min(b,Math.max(a,x));
function randomAt(index:number, salt:number):number {
  let x=(20261103 ^ Math.imul(index+1,0x9e3779b1) ^ Math.imul(salt+1,0x85ebca6b))>>>0;
  x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);
  return ((x^(x>>>16))>>>0)/4294967296;
}

/** Keep one audio event per visible geometric event; never quantize time to a beat. */
export function makeFlowerSoundEvents(timeline:FlowerAudioTimeline):FlowerSoundEvent[] {
  if(!Number.isFinite(timeline.duration)||timeline.duration<=0||!Array.isArray(timeline.events))throw new Error('Invalid flower timeline');
  const source=timeline.events.map((event,index)=>({event,index})).sort((a,b)=>a.event.time-b.event.time||a.index-b.index);
  for(const {event} of source){
    if(!Number.isFinite(event.time)||event.time<0||event.time>=timeline.duration||!Number.isFinite(event.x)||!Number.isFinite(event.y)||!Array.isArray(event.pairs)||!event.pairs.length||event.pairs.some(pair=>pair.length!==2||pair.some(n=>!Number.isInteger(n)||n<0)))throw new Error('Invalid flower crossing');
  }
  return source.map(({event,index},i)=>{
    // Nearby crossings retain every onset, but share a bounded energy budget.
    // This prevents coincident or rapidly clustered crossings becoming a burst.
    let neighbors=0;
    for(let j=i;j>=0&&event.time-source[j].event.time<.12;j--)neighbors++;
    for(let j=i+1;j<source.length&&source[j].event.time-event.time<.12;j++)neighbors++;
    const rate=.92+.16*randomAt(index,1);
    const base=.14+.045*randomAt(index,2);
    return {...event,pairs:event.pairs.map(pair=>[pair[0],pair[1]] as [number,number]),
      sampleId:SAMPLE_IDS[Math.floor(randomAt(index,0)*SAMPLE_IDS.length)],
      gain:base/Math.sqrt(Math.max(1,neighbors)),pan:clamp(event.x/3,-.8,.8),rate};
  });
}

/** Mix every crossing, resampling the stored mono WAV and panning by position. */
export function mixFlowerFire(duration:number,events:FlowerSoundEvent[],samples:Record<FireSampleId,Float32Array>,sampleRate=RATE) {
  if(!Number.isFinite(duration)||duration<=0||!Number.isInteger(sampleRate)||sampleRate<=0)throw new Error('Invalid audio duration or sample rate');
  const frames=Math.round(duration*sampleRate),channels=[new Float32Array(frames),new Float32Array(frames)];
  // Coincident sample-frame onsets share one voice. A voice-stealing envelope
  // caps active voices at eight while preserving every distinct onset.
  type Voice={start:number; end:number; sample:Float32Array; gain:number; pan:number; rate:number; stolen:boolean};
  const voices:Voice[]=[];
  for(const event of [...events].sort((a,b)=>a.time-b.time)){
    const sample=samples[event.sampleId];
    if(!sample||!Number.isFinite(event.time)||event.time<0||event.time>=duration||!Number.isFinite(event.gain)||event.gain<0||!Number.isFinite(event.pan)||!Number.isFinite(event.rate)||event.rate<=0)throw new Error('Invalid fire sample event');
    const start=Math.round(event.time*sampleRate),previous=voices[voices.length-1];
    if(previous&&previous.start===start){
      const energy=previous.gain*previous.gain+event.gain*event.gain;
      previous.pan=energy?(previous.pan*previous.gain*previous.gain+event.pan*event.gain*event.gain)/energy:0;
      previous.gain=Math.min(.22,Math.sqrt(energy));
      continue;
    }
    const active=voices.filter(v=>v.end>start);
    if(active.length>=8){const oldest=active[0];oldest.end=start;oldest.stolen=true;}
    voices.push({start,end:Math.min(frames,start+Math.ceil(sample.length/event.rate)),sample,gain:event.gain,pan:event.pan,rate:event.rate,stolen:false});
  }
  for(const voice of voices){
    const pan=clamp(voice.pan,-1,1),left=Math.cos((pan+1)*Math.PI/4)*voice.gain,right=Math.sin((pan+1)*Math.PI/4)*voice.gain;
    for(let frame=voice.start;frame<voice.end;frame++){
      const position=(frame-voice.start)*voice.rate,a=Math.floor(position),fraction=position-a;
      const fade=voice.stolen?Math.min(1,(voice.end-frame)/Math.max(1,Math.round(sampleRate*.003))):1;
      const value=((voice.sample[a]??0)*(1-fraction)+(voice.sample[a+1]??0)*fraction)*fade;
      channels[0][frame]+=value*left;channels[1][frame]+=value*right;
    }
  }
  let peak=0;
  for(const channel of channels)for(const value of channel){if(!Number.isFinite(value))throw new Error('Non-finite PCM');peak=Math.max(peak,Math.abs(value));}
  const attenuation=peak>.8?.8/peak:1;
  if(attenuation<1)for(const channel of channels)for(let i=0;i<channel.length;i++)channel[i]*=attenuation;
  return {channels,peak:peak*attenuation,attenuation};
}

async function loadFireKit():Promise<{manifest:FireKitManifest;samples:Record<FireSampleId,Float32Array>}> {
  const urls=await Promise.all([
    import('../../../assets/fire-kit/ember01.wav?url'),import('../../../assets/fire-kit/ember02.wav?url'),
    import('../../../assets/fire-kit/ember03.wav?url'),import('../../../assets/fire-kit/ember04.wav?url'),
    import('../../../assets/fire-kit/ember05.wav?url'),import('../../../assets/fire-kit/ember06.wav?url'),
    import('../../../assets/fire-kit/manifest.json?url'),
  ]);
  const responses=await Promise.all(urls.map(item=>fetch(item.default)));
  if(responses.some(response=>!response.ok))throw new Error('합성 장작 소리 샘플을 읽을 수 없습니다.');
  const manifest=await responses[6].json() as FireKitManifest;
  if(manifest.version!==1||manifest.id!=='ambient-lab-synthesized-fire-kit-v1'||manifest.sampleRate!==RATE)throw new Error('장작 샘플 정보가 올바르지 않습니다.');
  const decoded=await Promise.all(responses.slice(0,6).map(async response=>readPcm16Mono(await response.arrayBuffer())));
  const samples={} as Record<FireSampleId,Float32Array>;
  for(let i=0;i<SAMPLE_IDS.length;i++){
    const id=SAMPLE_IDS[i],file=manifest.files.find(f=>f.id===id);
    if(!file||file.frames!==decoded[i].length)throw new Error(`샘플 길이가 다릅니다: ${id}`);
    samples[id]=decoded[i];
  }
  return {manifest,samples};
}

export async function createFlowerAudio(timeline:FlowerAudioTimeline):Promise<FlowerAudio> {
  const events=makeFlowerSoundEvents(timeline),kit=await loadFireKit();
  const mix=mixFlowerFire(timeline.duration,events,kit.samples);
  return {channels:mix.channels,sampleRate:RATE,durationSeconds:timeline.duration,wav:encodeWav(mix.channels,RATE),events,kit:kit.manifest,
    metadata:{version:1,source:'flower-crossings',audioEngine:'original synthesized firewood-like one-shots; no drums or background music',
      eventTiming:'geometric crossing times, with no quantization',pan:'horizontal crossing coordinate / 3, clamped to +/-0.8',
      variationSeed:20261103,clusterWindowSeconds:.12,clusterGain:'inverse square root of crossings within window; same-frame events combine by energy',maxVoices:8,
      peak:mix.peak,masterAttenuation:mix.attenuation,sampleFrames:mix.channels[0].length,
      provenance:'Synthesized filtered noise and resonances; not a field recording'}};
}
