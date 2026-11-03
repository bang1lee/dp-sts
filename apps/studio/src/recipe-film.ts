import recipeText from './assets/recipe-film-recipe.json?raw';
import { parseRecipe } from './workbench-workflow';
import { createFilmRenderer, type FilmFeature } from './recipe-film-visual';
import { createRecipeAudio, type RecipeAudio } from './recipe-film-audio';
import { RECIPE_SHA256, KIT_SHA256, originalDirection, presetDirection, makeDirectionDocument, parseDirectionDocument, directionRanges, type Direction, type MusicIdentity, type NumericDirectionKey } from './recipe-film-direction';
import kitText from '../../../assets/original-kit/manifest.json?raw';

const recipe = parseRecipe(JSON.parse(recipeText));
const element = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const canvas=element<HTMLCanvasElement>('film'), prepare=element<HTMLButtonElement>('prepare'), play=element<HTMLButtonElement>('play');
const seek=element<HTMLInputElement>('seek'), output=element<HTMLButtonElement>('export'), fixed=element<HTMLButtonElement>('export-fixed'), cancel=element<HTMLButtonElement>('cancel');
const size=element<HTMLSelectElement>('export-size'), reaction=element<HTMLInputElement>('reaction');
const redownload=element<HTMLButtonElement>('redownload-fixed');
const featureDownload=element<HTMLButtonElement>('save-features');
const wav=element<HTMLButtonElement>('save-wav'), image=element<HTMLButtonElement>('save-image'), kit=element<HTMLButtonElement>('save-kit');
const progress=element<HTMLProgressElement>('progress'), status=element<HTMLElement>('status'), fps=element<HTMLElement>('fps');
const silent:FilmFeature={rms:0,low:0,high:0,onset:0};
const identity:MusicIdentity={recipeSha256:RECIPE_SHA256,kitSha256:KIT_SHA256,music:{...recipe.music}};
let direction:Direction=originalDirection(recipe.visual), identityReady=false;
const directionJson=element<HTMLTextAreaElement>('direction-json'), directionStatus=element<HTMLElement>('direction-status');
let renderer:ReturnType<typeof createFilmRenderer>|undefined, audio:RecipeAudio|undefined, completedIvf:Blob|undefined;
let context:AudioContext|undefined, source:AudioBufferSourceNode|undefined;
let position=0,startAt=0,silentStartAt=0,playing=false,busy=false,exporting=false,cancelRecording:(()=>void)|undefined;
let frame=0,lastFps=performance.now(),frameCount=0, generation=0;
const format=(seconds:number)=>{const t=Math.max(0,Math.floor(seconds));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;};
const feature=(t:number):FilmFeature=>audio?.features[Math.min(audio.features.length-1,Math.max(0,Math.floor(t*audio.featureFps)))] ?? silent;
const now=()=>!playing?position:audio&&context?Math.min(audio.durationSeconds,position+Math.max(0,context.currentTime-startAt)):Math.min(recipe.music.duration,position+Math.max(0,performance.now()/1000-silentStartAt));
const draw=(t:number)=>renderer?.draw(t,feature(t));
const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function sync(){const t=now();seek.value=String(t);element<HTMLOutputElement>('clock').value=`${format(t)} / ${format(audio?.durationSeconds??recipe.music.duration)}`;}
function controls(){prepare.disabled=busy||exporting||!renderer;play.disabled=!renderer||busy||exporting;seek.disabled=!renderer||busy||exporting;wav.disabled=!audio||busy||exporting;kit.disabled=!audio||busy||exporting;featureDownload.disabled=!audio||busy||exporting;reaction.disabled=busy||exporting;output.disabled=!audio||busy||exporting;fixed.disabled=!audio||busy||exporting;redownload.disabled=!completedIvf||busy||exporting;size.disabled=busy||exporting;image.disabled=!renderer||busy||exporting;cancel.hidden=!exporting;progress.hidden=!exporting;play.textContent=playing?'Ⅱ 일시정지':audio?'▶ 음악과 화면 재생':'▶ 화면 재생 · 무음';prepare.textContent=busy?'음악을 만드는 중…':audio?'음악 다시 준비':'음악 준비';for(const control of document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement|HTMLTextAreaElement>('.direction-panel input,.direction-panel select,.direction-panel button,.direction-panel textarea'))control.disabled=exporting;element<HTMLButtonElement>('save-direction').disabled=exporting||!identityReady;element<HTMLButtonElement>('apply-direction').disabled=exporting||!identityReady;element<HTMLInputElement>('load-direction').disabled=exporting||!identityReady;}
function stopNode(){if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();source=undefined;}}
function pause(){if(!playing)return;position=now();playing=false;generation++;stopNode();fps.textContent='';frameCount=0;controls();sync();draw(position);}
async function start(){if(!audio){if(position>=recipe.music.duration)position=0;silentStartAt=performance.now()/1000;playing=true;frameCount=0;lastFps=performance.now();controls();return;}if(position>=audio.durationSeconds)position=0;const attempt=++generation;context??=new AudioContext({sampleRate:audio.sampleRate});await context.resume();if(attempt!==generation||!audio)return;const buffer=context.createBuffer(audio.channels.length,audio.channels[0].length,audio.sampleRate);audio.channels.forEach((channel,i)=>buffer.getChannelData(i).set(channel));const node=context.createBufferSource();source=node;node.buffer=buffer;node.connect(context.destination);startAt=context.currentTime+.03;node.onended=()=>{if(source!==node||!audio)return;source=undefined;playing=false;position=audio.durationSeconds;fps.textContent='';frameCount=0;controls();sync();draw(position);};node.start(startAt,position);playing=true;frameCount=0;lastFps=performance.now();controls();}
function animate(time:number){if(!exporting&&playing){const t=now();draw(t);if(!audio&&t>=recipe.music.duration){position=recipe.music.duration;playing=false;fps.textContent='';controls();}frameCount++;if(time-lastFps>=1000){fps.textContent=`미리보기 약 ${Math.round(frameCount*1000/(time-lastFps))} fps`;frameCount=0;lastFps=time;}sync();}frame=requestAnimationFrame(animate);}
try{renderer=createFilmRenderer(canvas,recipe.visual,recipe.music.duration);draw(0);frame=requestAnimationFrame(animate);}catch(e){status.textContent=e instanceof Error?e.message:String(e);}controls();
type DirectionField = {key:NumericDirectionKey;label:string;step:string;help:string};
const fields:DirectionField[]=[
 {key:'power',label:'형태 차수',step:'.1',help:'표면의 가지와 무늬 변화'},
 {key:'stretch',label:'세로 늘이기',step:'.01',help:'납작하게 ↔ 길쭉하게'},
 {key:'rotation',label:'물체 시작 회전',step:'1',help:'처음 바라보는 각도 · 도'},
 {key:'spin',label:'물체 회전 속도',step:'.1',help:'음수는 반대 방향 · 도/초'},
 {key:'morphAmount',label:'형태 변형 폭',step:'.05',help:'0은 모양 고정'},
 {key:'morphSpeed',label:'형태 변형 속도',step:'.01',help:'천천히 ↔ 빠르게'},
 {key:'cameraSpeed',label:'카메라 속도',step:'.05',help:'0은 수평 회전 없음'},
 {key:'cameraDistance',label:'카메라 거리',step:'.01',help:'가까이 ↔ 멀리'},
 {key:'cameraHeight',label:'카메라 높이',step:'.01',help:'아래 ↔ 위'},
 {key:'lookX',label:'바라볼 곳 좌우',step:'.01',help:'왼쪽 ↔ 오른쪽'},
 {key:'lookY',label:'바라볼 곳 높이',step:'.01',help:'아래 ↔ 위'},
 {key:'fov',label:'시야각',step:'.5',help:'좁게 ↔ 넓게 · 도'},
 {key:'bloom',label:'빛 번짐',step:'.01',help:'또렷하게 ↔ 부드럽게'},
 {key:'colorStrength',label:'색 강도',step:'.01',help:'차분하게 ↔ 선명하게'},
];
function initDirectionControls(){
 const host=element('direction-controls');
 const pathLabel=document.createElement('label');pathLabel.className='path-control';pathLabel.textContent='카메라 경로';
 const path=document.createElement('select');path.id='direction-cameraPath';path.setAttribute('aria-label','카메라 경로');
 for(const [value,label] of [['original','원본 전개'],['orbit','일정한 궤도'],['arc','올라가는 호'],['close','표면 가까이']])path.add(new Option(label,value));
 path.addEventListener('change',()=>{if(!exporting)applyDirection({...direction,cameraPath:path.value as Direction['cameraPath']});});pathLabel.append(path);host.append(pathLabel);
 for(const field of fields){
  const label=document.createElement('label'),line=document.createElement('span'),name=document.createElement('span'),out=document.createElement('output'),range=document.createElement('input'),help=document.createElement('small');
  name.textContent=field.label;out.id=`direction-value-${field.key}`;line.append(name,out);range.type='range';range.id=`direction-${field.key}`;range.min=String(directionRanges[field.key][0]);range.max=String(directionRanges[field.key][1]);range.step='any';range.setAttribute('aria-label',field.label);help.textContent=field.help;
  range.addEventListener('input',()=>{if(!exporting)applyDirection({...direction,[field.key]:Number(range.value)});});label.append(line,range,help);host.append(label);
 }
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-direction-preset]'))button.addEventListener('click',()=>{if(!exporting)applyDirection(presetDirection(button.dataset.directionPreset as 'original'|'slow-orbit'|'rising-arc'|'near-surface',recipe.visual));});
 element<HTMLButtonElement>('reset-direction').addEventListener('click',()=>{if(!exporting)applyDirection(originalDirection(recipe.visual));});
 element<HTMLButtonElement>('apply-direction').addEventListener('click',()=>{if(exporting||!identityReady)return;try{applyDocument(JSON.parse(directionJson.value));}catch(e){directionStatus.textContent=`적용하지 못했습니다: ${e instanceof Error?e.message:String(e)}`;}});
 element<HTMLButtonElement>('save-direction').addEventListener('click',()=>{if(!exporting&&identityReady)download(new Blob([JSON.stringify(makeDirectionDocument(direction,size.value,identity),null,2)],{type:'application/json'}),'dp-sts-direction.json');});
 const file=element<HTMLInputElement>('load-direction');file.addEventListener('change',async()=>{try{const f=file.files?.[0];if(!f)return;if(f.size>64*1024)throw new Error('설정 파일은 64KB 이하여야 합니다.');const data:unknown=JSON.parse(await f.text());if(exporting||!identityReady)throw new Error('출력이 끝난 뒤 불러와 주세요.');applyDocument(data);}catch(e){directionStatus.textContent=`불러오지 못했습니다: ${e instanceof Error?e.message:String(e)}`;}finally{file.value='';}});
}
function syncDirectionControls(){
 element<HTMLSelectElement>('direction-cameraPath').value=direction.cameraPath;
 for(const field of fields){element<HTMLInputElement>(`direction-${field.key}`).value=String(direction[field.key]);element<HTMLOutputElement>(`direction-value-${field.key}`).value=String(Math.round(direction[field.key]*100)/100);}
 reaction.checked=direction.reaction;
}
function writeDirectionJson(){directionJson.value=JSON.stringify(makeDirectionDocument(direction,size.value,identity),null,2);}
function applyDirection(next:Direction){
 if(exporting)return;
 const checked=makeDirectionDocument(next,size.value,identity);direction=checked.direction;completedIvf=undefined;renderer?.setDirection(direction);syncDirectionControls();writeDirectionJson();draw(now());controls();directionStatus.textContent='화면 방향에 적용했습니다. 음악은 변경되지 않았습니다.';
}
function applyDocument(value:unknown){
 const checked=parseDirectionDocument(value,identity);if(exporting)throw new Error('출력 중에는 설정을 바꿀 수 없습니다.');
 direction=checked.direction;size.value=`${checked.render.width}x${checked.render.height}`;completedIvf=undefined;renderer?.setDirection(direction);syncDirectionControls();writeDirectionJson();draw(now());controls();directionStatus.textContent='설정을 불러왔습니다. 음악은 변경되지 않았습니다.';
}
async function verifyIdentity(){
 try{const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const [recipeHash,kitHash]=await Promise.all([hash(recipeText),hash(kitText)]);if(recipeHash!==RECIPE_SHA256||kitHash!==KIT_SHA256)throw new Error('작품 원본 또는 샘플 정보가 일치하지 않습니다.');identityReady=true;
 }catch(e){directionStatus.textContent=`설정 저장을 사용할 수 없습니다: ${e instanceof Error?e.message:String(e)}`;}
 controls();
}
initDirectionControls();syncDirectionControls();writeDirectionJson();controls();void verifyIdentity();
prepare.addEventListener('click',async()=>{if(!renderer)return;pause();completedIvf=undefined;busy=true;audio=undefined;position=0;controls();status.textContent='레시피 음악과 샘플 비트를 준비하고 분석하고 있습니다…';try{audio=await createRecipeAudio(recipe);seek.max=String(audio.durationSeconds);draw(0);sync();status.textContent='음악이 준비되었습니다. 재생을 누르면 소리가 시작됩니다.';}catch(e){status.textContent=`음악을 준비하지 못했습니다: ${e instanceof Error?e.message:String(e)}`;}finally{busy=false;controls();}});
play.addEventListener('click',async()=>{try{if(playing){pause();status.textContent='일시정지했습니다.';}else{await start();status.textContent=audio?'오디오 재생 위치를 기준으로 화면을 그리고 있습니다.':'음악 없이 화면만 재생 중입니다. 음악 준비 후에는 같은 시간축으로 함께 재생됩니다.';}}catch(e){status.textContent=`재생하지 못했습니다: ${e instanceof Error?e.message:String(e)}`;}controls();});
seek.addEventListener('input',()=>{const requested=Number(seek.value),wasPlaying=playing;pause();position=requested;draw(position);sync();if(wasPlaying)void start().catch(e=>{status.textContent=`재생하지 못했습니다: ${e instanceof Error?e.message:String(e)}`;});});
wav.addEventListener('click',()=>{if(audio)download(new Blob([audio.wav.slice().buffer as ArrayBuffer],{type:'audio/wav'}),'dp-sts-recipe-music.wav');});
kit.addEventListener('click',()=>{if(audio)download(new Blob([JSON.stringify(audio.kit,null,2)],{type:'application/json'}),'dp-sts-recipe-kit.json');});
featureDownload.addEventListener('click',()=>{if(audio)download(new Blob([JSON.stringify({version:1,featureFps:audio.featureFps,features:audio.features,events:audio.events,metadata:audio.metadata},null,2)],{type:'application/json'}),'dp-sts-recipe-analysis.json');});
reaction.addEventListener('change',()=>{if(exporting)return;applyDirection({...direction,reaction:reaction.checked});});
size.addEventListener('change',()=>{if(exporting)return;completedIvf=undefined;writeDirectionJson();controls();});
redownload.addEventListener('click',()=>{if(completedIvf)download(completedIvf,'dp-sts-recipe-film-silent.ivf');});
image.addEventListener('click',()=>canvas.toBlob(blob=>{if(blob){download(blob,'dp-sts-recipe-frame.png');status.textContent='현재 장면을 PNG로 저장했습니다.';}else status.textContent='이미지를 저장하지 못했습니다.';},'image/png'));
// IVF contains an elementary, silent VP9/VP8 stream with integer frame timestamps.
// Each frame is sampled at exactly index / 30 seconds against the same prepared PCM features.
fixed.addEventListener('click',async()=>{
 if(!audio||!renderer)return;
 if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined'){status.textContent='이 브라우저는 고정 프레임 영상 인코딩을 지원하지 않습니다. WebM 실시간 기록을 사용할 수 있습니다.';return;}
 pause();completedIvf=undefined;const restore=position,data=audio,visual=renderer,frozenDirection={...direction},fpsValue=30,count=Math.ceil(data.durationSeconds*fpsValue);visual.setDirection(frozenDirection);
 const sizes:Record<string,[number,number]>={'960x540':[960,540],'1280x720':[1280,720],'1920x1080':[1920,1080]};const [width,height]=sizes[size.value]??sizes['960x540'];
 let stopped=false,encoder:VideoEncoder|undefined,encoderError:Error|undefined;
 exporting=true;progress.value=0;element('export-percent').textContent='0%';status.textContent='고정 프레임 무음 영상을 만들고 있습니다. WAV는 별도로 저장해 결합합니다.';cancelRecording=()=>{stopped=true;};controls();
 try {
  const candidates=[{codec:'vp09.00.40.08',fourcc:'VP90'},{codec:'vp8',fourcc:'VP80'}];const bitrate=width>=1920?12_000_000:width>=1280?8_000_000:5_000_000;
  let selected:{codec:string;fourcc:string}|undefined;
  for(const candidate of candidates){try{const support=await VideoEncoder.isConfigSupported({codec:candidate.codec,width,height,bitrate,framerate:fpsValue});if(support.supported){selected=candidate;break;}}catch{ /* try next codec */ }}
  if(!selected)throw new Error('지원되는 VP9 또는 VP8 인코더가 없습니다. WebM 실시간 기록을 사용하세요.');
  if(stopped)throw new DOMException('취소됨','AbortError');
  const packets:{timestamp:number;bytes:Uint8Array}[]=[];
  encoder=new VideoEncoder({output(chunk){const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);packets.push({timestamp:chunk.timestamp,bytes});},error(error){encoderError=error;}});
  encoder.configure({codec:selected.codec,width,height,bitrate,framerate:fpsValue,latencyMode:'quality'});visual.setSize(width,height);
  for(let index=0;index<count;index++){
   if(stopped)throw new DOMException('취소됨','AbortError');if(encoderError)throw encoderError;
   const t=index/fpsValue;visual.draw(t,data.features[Math.min(data.features.length-1,Math.floor(t*data.featureFps))]??silent);
   const stamp=Math.round(index*1_000_000/fpsValue),next=Math.round((index+1)*1_000_000/fpsValue);
   const frame=new VideoFrame(canvas,{timestamp:stamp,duration:next-stamp});try{encoder.encode(frame,{keyFrame:index%120===0});}finally{frame.close();}
   if(index%3===0){progress.value=(index+1)/count;element('export-percent').textContent=`${Math.round(100*(index+1)/count)}%`;await new Promise<void>(resolve=>setTimeout(resolve,0));}
   while(encoder.encodeQueueSize>4){if(stopped)throw new DOMException('취소됨','AbortError');if(encoderError)throw encoderError;await new Promise<void>(resolve=>setTimeout(resolve,5));}
  }
  await encoder.flush();if(stopped)throw new DOMException('취소됨','AbortError');if(encoderError)throw encoderError;
  if(packets.length!==count)throw new Error(`인코딩된 프레임 수가 다릅니다 (${packets.length}/${count}).`);
  packets.sort((a,b)=>a.timestamp-b.timestamp);const header=new Uint8Array(32),view=new DataView(header.buffer);header.set([68,75,73,70],0);view.setUint16(4,0,true);view.setUint16(6,32,true);for(let i=0;i<4;i++)header[8+i]=selected.fourcc.charCodeAt(i);view.setUint16(12,width,true);view.setUint16(14,height,true);view.setUint32(16,fpsValue,true);view.setUint32(20,1,true);view.setUint32(24,count,true);view.setUint32(28,0,true);
  const parts:BlobPart[]=[header];for(const packet of packets){const h=new Uint8Array(12),dv=new DataView(h.buffer);dv.setUint32(0,packet.bytes.byteLength,true);dv.setBigUint64(4,BigInt(Math.round(packet.timestamp*fpsValue/1_000_000)),true);parts.push(h,packet.bytes.buffer as ArrayBuffer);}
  completedIvf=new Blob(parts,{type:'video/x-ivf'});download(completedIvf,'dp-sts-recipe-film-silent.ivf');progress.value=1;element('export-percent').textContent='100%';status.textContent=`고정 프레임 ${count}장을 저장했습니다. WAV와 결합해 주세요.`;
 }catch(e){status.textContent=e instanceof DOMException&&e.name==='AbortError'?'고정 프레임 출력을 취소했습니다.':`고정 프레임 출력을 완료하지 못했습니다: ${e instanceof Error?e.message:String(e)}`;}
 finally{if(encoder&&encoder.state!=='closed')encoder.close();cancelRecording=undefined;visual.setSize(960,540);position=restore;exporting=false;draw(position);sync();controls();}
});
output.addEventListener('click',async()=>{
 if(!audio||!renderer)return;
 const supported=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(type));
 if(!supported||typeof canvas.captureStream!=='function'){status.textContent='이 브라우저는 WebM 영상과 오디오 기록을 지원하지 않습니다.';return;}
 pause();const restore=position, data=audio, visual=renderer, frozenDirection={...direction};visual.setDirection(frozenDirection);let aborted=false,contextOut:AudioContext|undefined,node:AudioBufferSourceNode|undefined,stream:MediaStream|undefined,recorder:MediaRecorder|undefined,raf=0;
 exporting=true;progress.value=0;element('export-percent').textContent='0%';status.textContent='음악과 화면을 실시간으로 기록합니다. 탭을 열어 두세요.';cancelRecording=()=>{aborted=true;try{node?.stop();}catch{}if(recorder&&recorder.state!=='inactive')recorder.stop();};controls();
 try{
  visual.draw(0,data.features[0]??silent);stream=canvas.captureStream(30);contextOut=new AudioContext({sampleRate:data.sampleRate});await contextOut.resume();if(aborted)throw new DOMException('취소됨','AbortError');
  const buffer=contextOut.createBuffer(data.channels.length,data.channels[0].length,data.sampleRate);data.channels.forEach((ch,i)=>buffer.getChannelData(i).set(ch));const destination=contextOut.createMediaStreamDestination();node=contextOut.createBufferSource();node.buffer=buffer;node.connect(destination);const track=destination.stream.getAudioTracks()[0];if(!track)throw new Error('오디오 트랙을 만들지 못했습니다.');stream.addTrack(track);recorder=new MediaRecorder(stream,{mimeType:supported,videoBitsPerSecond:4_000_000});
  const blob=await new Promise<Blob>((resolve,reject)=>{let settled=false;const fail=(error:unknown)=>{if(!settled){settled=true;reject(error);}};const chunks:BlobPart[]=[];recorder!.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder!.onerror=()=>fail(new Error('영상 녹화에 실패했습니다.'));recorder!.onstop=()=>{if(settled)return;settled=true;if(aborted)reject(new DOMException('취소됨','AbortError'));else if(!chunks.length)reject(new Error('영상 데이터가 비어 있습니다.'));else resolve(new Blob(chunks,{type:supported}));};recorder!.start(250);const start=contextOut!.currentTime+.05;node!.start(start);
   const tick=()=>{if(aborted)return;if(document.hidden){aborted=true;try{node?.stop();}catch{}if(recorder?.state!=='inactive')recorder?.stop();fail(new Error('탭이 숨겨져 영상 기록이 중단됐습니다.'));return;}const t=Math.max(0,Math.min(data.durationSeconds,contextOut!.currentTime-start));visual.draw(t,data.features[Math.min(data.features.length-1,Math.floor(t*data.featureFps))]??silent);const fraction=t/data.durationSeconds;progress.value=fraction;element('export-percent').textContent=`${Math.round(fraction*100)}%`;if(t>=data.durationSeconds){if(recorder?.state!=='inactive')recorder?.stop();return;}raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);
  });
  download(blob,'dp-sts-recipe-film.webm');status.textContent='영상 기록이 완료되었습니다.';
 }catch(e){status.textContent=e instanceof DOMException&&e.name==='AbortError'?'영상 기록을 취소했습니다.':`영상 기록을 완료하지 못했습니다: ${e instanceof Error?e.message:String(e)}`;}
 finally{cancelRecording=undefined;cancelAnimationFrame(raf);try{node?.stop();}catch{}node?.disconnect();stream?.getTracks().forEach(track=>track.stop());if(contextOut&&contextOut.state!=='closed')await contextOut.close();position=restore;exporting=false;draw(position);sync();controls();}
});
cancel.addEventListener('click',()=>{cancelRecording?.();status.textContent='영상 기록을 취소하고 있습니다…';});
window.addEventListener('beforeunload',()=>{cancelRecording?.();generation++;stopNode();cancelAnimationFrame(frame);if(context&&context.state!=='closed')void context.close();renderer?.dispose();});
