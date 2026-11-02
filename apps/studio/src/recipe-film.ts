import recipeText from './assets/recipe-film-recipe.json?raw';
import { parseRecipe } from './workbench-workflow';
import { createFilmRenderer, type FilmFeature } from './recipe-film-visual';
import { createRecipeAudio, type RecipeAudio } from './recipe-film-audio';

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
let renderer:ReturnType<typeof createFilmRenderer>|undefined, audio:RecipeAudio|undefined, completedIvf:Blob|undefined;
let context:AudioContext|undefined, source:AudioBufferSourceNode|undefined;
let position=0,startAt=0,playing=false,busy=false,exporting=false,cancelRecording:(()=>void)|undefined;
let frame=0,lastFps=performance.now(),frameCount=0, generation=0;
const format=(seconds:number)=>{const t=Math.max(0,Math.floor(seconds));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;};
const feature=(t:number):FilmFeature=>audio?.features[Math.min(audio.features.length-1,Math.max(0,Math.floor(t*audio.featureFps)))] ?? silent;
const now=()=>playing&&context?Math.min(audio?.durationSeconds??0,position+Math.max(0,context.currentTime-startAt)):position;
const draw=(t:number)=>renderer?.draw(t,feature(t));
const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function sync(){const t=now();seek.value=String(t);element<HTMLOutputElement>('clock').value=`${format(t)} / ${format(audio?.durationSeconds??recipe.music.duration)}`;}
function controls(){prepare.disabled=busy||exporting||!renderer;play.disabled=!audio||busy||exporting;seek.disabled=!audio||busy||exporting;wav.disabled=!audio||busy||exporting;kit.disabled=!audio||busy||exporting;featureDownload.disabled=!audio||busy||exporting;reaction.disabled=busy||exporting;output.disabled=!audio||busy||exporting;fixed.disabled=!audio||busy||exporting;redownload.disabled=!completedIvf||busy||exporting;size.disabled=busy||exporting;image.disabled=!renderer||busy||exporting;cancel.hidden=!exporting;progress.hidden=!exporting;play.textContent=playing?'Ⅱ 일시정지':'▶ 재생';prepare.textContent=busy?'음악을 만드는 중…':audio?'음악 다시 준비':'음악 준비';}
function stopNode(){if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();source=undefined;}}
function pause(){if(!playing)return;position=now();playing=false;generation++;stopNode();fps.textContent='';frameCount=0;controls();sync();draw(position);}
async function start(){if(!audio)throw new Error('먼저 음악을 준비해 주세요.');if(position>=audio.durationSeconds)position=0;const attempt=++generation;context??=new AudioContext({sampleRate:audio.sampleRate});await context.resume();if(attempt!==generation||!audio)return;const buffer=context.createBuffer(audio.channels.length,audio.channels[0].length,audio.sampleRate);audio.channels.forEach((channel,i)=>buffer.getChannelData(i).set(channel));const node=context.createBufferSource();source=node;node.buffer=buffer;node.connect(context.destination);startAt=context.currentTime+.03;node.onended=()=>{if(source!==node||!audio)return;source=undefined;playing=false;position=audio.durationSeconds;fps.textContent='';frameCount=0;controls();sync();draw(position);};node.start(startAt,position);playing=true;frameCount=0;lastFps=performance.now();controls();}
function animate(time:number){if(!exporting&&playing){const t=now();draw(t);frameCount++;if(time-lastFps>=1000){fps.textContent=`미리보기 약 ${Math.round(frameCount*1000/(time-lastFps))} fps`;frameCount=0;lastFps=time;}sync();}frame=requestAnimationFrame(animate);}
try{renderer=createFilmRenderer(canvas,recipe.visual,recipe.music.duration);draw(0);frame=requestAnimationFrame(animate);}catch(e){status.textContent=e instanceof Error?e.message:String(e);}controls();
prepare.addEventListener('click',async()=>{if(!renderer)return;pause();completedIvf=undefined;busy=true;audio=undefined;position=0;controls();status.textContent='레시피 음악과 샘플 비트를 준비하고 분석하고 있습니다…';try{audio=await createRecipeAudio(recipe);seek.max=String(audio.durationSeconds);draw(0);sync();status.textContent='음악이 준비되었습니다. 재생을 누르면 소리가 시작됩니다.';}catch(e){status.textContent=`음악을 준비하지 못했습니다: ${e instanceof Error?e.message:String(e)}`;}finally{busy=false;controls();}});
play.addEventListener('click',async()=>{try{if(playing){pause();status.textContent='일시정지했습니다.';}else{await start();status.textContent='오디오 재생 위치를 기준으로 화면을 그리고 있습니다.';}}catch(e){status.textContent=`재생하지 못했습니다: ${e instanceof Error?e.message:String(e)}`;}controls();});
seek.addEventListener('input',()=>{const wasPlaying=playing;pause();position=Number(seek.value);draw(position);sync();if(wasPlaying)void start().catch(e=>{status.textContent=`재생하지 못했습니다: ${e instanceof Error?e.message:String(e)}`;});});
wav.addEventListener('click',()=>{if(audio)download(new Blob([audio.wav.slice().buffer as ArrayBuffer],{type:'audio/wav'}),'dp-sts-recipe-music.wav');});
kit.addEventListener('click',()=>{if(audio)download(new Blob([JSON.stringify(audio.kit,null,2)],{type:'application/json'}),'dp-sts-recipe-kit.json');});
featureDownload.addEventListener('click',()=>{if(audio)download(new Blob([JSON.stringify({version:1,featureFps:audio.featureFps,features:audio.features,events:audio.events,metadata:audio.metadata},null,2)],{type:'application/json'}),'dp-sts-recipe-analysis.json');});
reaction.addEventListener('change',()=>{completedIvf=undefined;renderer?.setResponse(reaction.checked);draw(now());controls();});
size.addEventListener('change',()=>{completedIvf=undefined;controls();});
redownload.addEventListener('click',()=>{if(completedIvf)download(completedIvf,'dp-sts-recipe-film-silent.ivf');});
image.addEventListener('click',()=>canvas.toBlob(blob=>{if(blob){download(blob,'dp-sts-recipe-frame.png');status.textContent='현재 장면을 PNG로 저장했습니다.';}else status.textContent='이미지를 저장하지 못했습니다.';},'image/png'));
// IVF contains an elementary, silent VP9/VP8 stream with integer frame timestamps.
// Each frame is sampled at exactly index / 30 seconds against the same prepared PCM features.
fixed.addEventListener('click',async()=>{
 if(!audio||!renderer)return;
 if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined'){status.textContent='이 브라우저는 고정 프레임 영상 인코딩을 지원하지 않습니다. WebM 실시간 기록을 사용할 수 있습니다.';return;}
 pause();completedIvf=undefined;const restore=position,data=audio,visual=renderer,fpsValue=30,count=Math.ceil(data.durationSeconds*fpsValue);
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
 pause();const restore=position, data=audio, visual=renderer;let aborted=false,contextOut:AudioContext|undefined,node:AudioBufferSourceNode|undefined,stream:MediaStream|undefined,recorder:MediaRecorder|undefined,raf=0;
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
