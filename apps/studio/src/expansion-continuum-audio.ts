import { encodeWav } from '@ambient-lab/audiovisual';
import { measureFeatures, readPcm16Mono, type AudioFeature } from './recipe-film-audio';
import { CONTINUUM_DURATION, CONTINUUM_EVENTS } from './expansion-continuum-score';
import type { FireKitManifest, FireSampleId } from './flower-audio';
import type { ExpansionSamples } from './expansion-audio';
export { featureAt as continuumFeatureAt } from './expansion-audio';

export const CONTINUUM_SAMPLE_RATE=48000;
export const CONTINUUM_FEATURE_FPS=60;
export interface ContinuumAudio {sampleRate:number;channels:Float32Array[];wav:Uint8Array;duration:number;features:AudioFeature[];featureFps:number;metadata:Record<string,unknown>}
const IDS:FireSampleId[]=['ember01','ember02','ember03','ember04','ember05','ember06'];
const SR=CONTINUUM_SAMPLE_RATE;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(t:number)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};
interface Note {time:number;midi:number;duration:number;source:FireSampleId;gain:number;pan:number;attack:number;decay:number}
// A through-composed harmonic arc. There is no repeated 30-second section.
const NOTES:Note[]=[
  {time:0,midi:50,duration:27,source:'ember02',gain:.085,pan:-.12,attack:3.8,decay:6.8},
  {time:12,midi:57,duration:26,source:'ember05',gain:.052,pan:.32,attack:3.6,decay:6.4},
  {time:26,midi:60,duration:23,source:'ember04',gain:.045,pan:-.38,attack:4.0,decay:5.8},
  {time:35,midi:53,duration:30,source:'ember01',gain:.075,pan:-.17,attack:3.4,decay:7.2},
  {time:48,midi:57,duration:29,source:'ember06',gain:.056,pan:.36,attack:4.2,decay:7.0},
  {time:61,midi:60,duration:26,source:'ember03',gain:.047,pan:-.34,attack:4.8,decay:6.4},
  {time:73,midi:50,duration:31,source:'ember05',gain:.083,pan:-.10,attack:4.2,decay:7.5},
  {time:86,midi:53,duration:29,source:'ember04',gain:.055,pan:.24,attack:4.3,decay:7.0},
  {time:98,midi:57,duration:30,source:'ember02',gain:.061,pan:-.30,attack:4.0,decay:7.4},
  {time:110,midi:64,duration:27,source:'ember06',gain:.038,pan:.38,attack:5.2,decay:6.6},
  {time:123,midi:50,duration:33,source:'ember01',gain:.072,pan:-.16,attack:4.8,decay:7.8},
  {time:137,midi:57,duration:31,source:'ember03',gain:.054,pan:.31,attack:4.8,decay:7.5},
  {time:151,midi:60,duration:29,source:'ember05',gain:.043,pan:-.32,attack:5.0,decay:7.0},
  {time:164,midi:50,duration:16,source:'ember04',gain:.055,pan:.06,attack:4.2,decay:6.2},
];

/** Tuned, long-lived resonators excited only by the original crackle waveform. */
function fireResonance(sample:Float32Array,note:Note):Float32Array {
  const out=new Float32Array(Math.round(note.duration*SR)),frequency=440*2**((note.midi-69)/12);
  const r=Math.exp(-1/(SR*note.decay)),q=Math.exp(-1/(SR*(note.decay*.56)));
  const c=2*r*Math.cos(2*Math.PI*frequency/SR),d=2*q*Math.cos(2*Math.PI*frequency*2.002/SR);
  let a=0,b=0,x=0,y=0,peak=0;
  for(let i=0;i<out.length;i++){
    const input=i<sample.length?sample[i]:0;
    const p=input+c*a-r*r*b,k=input+d*x-q*q*y;
    b=a;a=p;y=x;x=k;
    const local=i/SR,env=smooth(local/note.attack)*smooth((note.duration-local)/5.5);
    const value=(p+.14*k)*env;out[i]=value;peak=Math.max(peak,Math.abs(value));
  }
  if(peak>0)for(let i=0;i<out.length;i++)out[i]/=peak;
  return out;
}
function addMono(channels:Float32Array[],sample:Float32Array,time:number,gain:number,pan:number,rate=1,reverse=false,window=false){
  const start=Math.round(time*SR),length=Math.ceil(sample.length/rate),p=clamp(pan,-1,1);
  const left=Math.cos((p+1)*Math.PI/4)*gain,right=Math.sin((p+1)*Math.PI/4)*gain;
  for(let i=0;i<length&&start+i<channels[0].length;i++){
    if(start+i<0)continue;
    const pos=reverse?sample.length-1-i*rate:i*rate,a=Math.floor(pos),f=pos-a;
    let v=(sample[a]??0)*(1-f)+(sample[a+1]??0)*f;
    if(window)v*=Math.sin(Math.PI*i/Math.max(1,length-1))**2;
    channels[0][start+i]+=v*left;channels[1][start+i]+=v*right;
  }
}

/** Shared-score contact events, exported to permit isolated sync verification. */
export function addContinuumContacts(channels:Float32Array[],samples:ExpansionSamples){
  return CONTINUUM_EVENTS.map((event,i)=>{
    const sampleId=IDS[(i*5+1)%IDS.length],gain=event.kind==='line'?.09:.075,pan=clamp(event.x*.65,-.7,.7);
    addMono(channels,samples[sampleId],event.time,gain,pan);
    return {...event,sampleId,gain,pan,frame:Math.round(event.time*SR)};
  });
}
/** Deterministic complete, through-composed 180 s stereo PCM render. */
export function renderContinuumAudio(samples:ExpansionSamples,kit?:FireKitManifest):ContinuumAudio {
  for(const id of IDS)if(!samples[id]?.length)throw new Error(`Missing fire source: ${id}`);
  const frames=CONTINUUM_DURATION*SR,channels=[new Float32Array(frames),new Float32Array(frames)];
  for(const note of NOTES)addMono(channels,fireResonance(samples[note.source],note),note.time,note.gain,note.pan);
  const events=addContinuumContacts(channels,samples);
  // Faint, reversed, slow grains gradually broaden the late spatial texture.
  const grainTimes=[24,43,62,79,95,112,131,145,158];
  for(let i=0;i<grainTimes.length;i++)addMono(channels,samples[IDS[(i*5+2)%IDS.length]],grainTimes[i],.012,(i%2?1:-1)*.48,.25,true,true);
  // Slow stereo cross-delay, generated from the same resonances and grains.
  const dl=Math.round(.401*SR),dr=Math.round(.613*SR);
  let lowL=0,lowR=0;
  for(let i=0;i<frames;i++){
    const l=i>=dl?channels[0][i-dl]:0,r=i>=dr?channels[1][i-dr]:0;
    lowL+=.035*(l-lowL);lowR+=.035*(r-lowR);
    channels[0][i]+=lowR*.15;channels[1][i]+=lowL*.15;
    const end=1-smooth((i-168*SR)/(12*SR-1));
    channels[0][i]*=end;channels[1][i]*=end;
  }
  let peak=0;for(const channel of channels)for(const n of channel){if(!Number.isFinite(n))throw new Error('Non-finite continuum PCM');peak=Math.max(peak,Math.abs(n));}
  const masterGain=peak>0?Math.min(3.2,.78/peak):1;
  if(masterGain!==1)for(const channel of channels)for(let i=0;i<channel.length;i++)channel[i]*=masterGain;
  const features=measureFeatures(channels,SR,CONTINUUM_FEATURE_FPS);
  return {sampleRate:SR,channels,wav:encodeWav(channels,SR),duration:CONTINUUM_DURATION,features,featureFps:CONTINUUM_FEATURE_FPS,
    metadata:{version:1,form:'continuous 180-second composition, no loop or time stretch',tonalCenter:'D3',notes:NOTES,grainTimes,events,
      sampleSource:'original synthesized fire kit; not a field recording',kitId:kit?.id??'injected-fire-kit',kitFiles:kit?.files??[],
      method:'fire waveform excites long damped resonators, with reverse grains and filtered stereo delay; no independent oscillator pad',
      featureMethod:'measured final PCM, 60 fps RMS / low / high / onset',dissolveStart:168,peak:peak*masterGain,masterGain}};
}
async function loadFireKit():Promise<{samples:ExpansionSamples;manifest:FireKitManifest}>{
  const urls=await Promise.all([import('../../../assets/fire-kit/ember01.wav?url'),import('../../../assets/fire-kit/ember02.wav?url'),import('../../../assets/fire-kit/ember03.wav?url'),import('../../../assets/fire-kit/ember04.wav?url'),import('../../../assets/fire-kit/ember05.wav?url'),import('../../../assets/fire-kit/ember06.wav?url'),import('../../../assets/fire-kit/manifest.json?url')]);
  const responses=await Promise.all(urls.map(u=>fetch(u.default)));
  if(responses.some(r=>!r.ok))throw new Error('합성 장작 음원을 읽을 수 없습니다.');
  const manifest=await responses[6].json() as FireKitManifest;
  if(manifest.id!=='ambient-lab-synthesized-fire-kit-v1'||manifest.sampleRate!==SR)throw new Error('음원 매니페스트가 올바르지 않습니다.');
  const decoded=await Promise.all(responses.slice(0,6).map(async r=>readPcm16Mono(await r.arrayBuffer()))),samples={} as ExpansionSamples;
  for(let i=0;i<IDS.length;i++){const file=manifest.files.find(f=>f.id===IDS[i]);if(!file||file.frames!==decoded[i].length)throw new Error(`샘플 길이가 다릅니다: ${IDS[i]}`);samples[IDS[i]]=decoded[i];}
  return {samples,manifest};
}
export async function createContinuumAudio():Promise<ContinuumAudio>{const kit=await loadFireKit();return renderContinuumAudio(kit.samples,kit.manifest);}
