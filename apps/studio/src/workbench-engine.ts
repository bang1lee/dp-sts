import { encodeWav, type Composition } from '@ambient-lab/audiovisual';
import { renderAudio } from '@ambient-lab/audiovisual/offline';
import { createMusicDocument, type MusicDocument } from './music-document';
export type { MusicDocument } from './music-document';

export type Mood = 'moonlit' | 'warm' | 'mysterious';
export interface MusicConfig { bpm: number; root: number; mood: Mood; sparsity: number; duration: number; gain: number }
export interface VisualConfig { mode: 'moonwater' | 'fractal' | 'mandelbulb'; depth: number; density: number; bloom: number; connection: number; scale: number; motion: number; response: number }
export interface WorkbenchState { status: 'idle' | 'generating' | 'ready' | 'playing' | 'exporting' | 'error'; time: number; duration: number; rms: number; error?: string; videoMime?: string }
const finiteBetween = (v: number, lo: number, hi: number, label: string) => {
  if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${label} must be ${lo}–${hi}`);
  return v;
};
const noteName = (n: number) => `${['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'][((n%12)+12)%12]}${Math.floor(n/12)-1}`;
export function makeComposition(c: MusicConfig): Composition {
  finiteBetween(c.bpm,40,120,'BPM');
  finiteBetween(c.root,36,72,'Root');
  if (!Number.isInteger(c.root)) throw new Error('Root must be a MIDI integer');
  finiteBetween(c.sparsity,0,1,'Sparsity'); finiteBetween(c.duration,5,120,'Duration'); finiteBetween(c.gain,0,1,'Gain');
  if (!['moonlit','warm','mysterious'].includes(c.mood)) throw new Error('Unknown mood');
  const shapes = c.mood === 'warm' ? [[0,4,7,11],[5,9,12,16],[9,12,16,19],[7,11,14,17]] : c.mood === 'mysterious' ? [[0,3,7,10],[8,12,15,19],[5,8,12,15],[7,10,14,17]] : [[0,3,7,10],[8,12,15,19],[5,8,12,17],[7,10,14,19]];
  const chords = shapes.map((shape, i) => (c.sparsity > .72 && i===1) || (c.sparsity > .35 && i===3) ? '~' : `[${shape.map(n=>noteName(c.root+n)).join(',')}]`);
  return { schemaVersion:1,id:'workbench-moonwater',title:'Moonwater',durationSeconds:c.duration,seed:42,
    audio:{notes:chords.join(' '),gain:.15,cps:c.bpm/240,slow:4,attack:1.5,release:3.8,cutoff:c.mood==='warm'?1500:1100,sampleRate:48000,fadeSeconds:Math.min(1,c.duration/4)},
    visual:{kind:'julia',iterations:96,zoom:1,speed:.1,reactivity:1,hue:.55},render:{width:960,height:540,fps:30} };
}
export function rmsAt(channels: Float32Array[], sampleRate: number, seconds: number, windowSeconds = .025): number {
  if (!channels.length || !Number.isFinite(seconds) || seconds < 0 || seconds >= channels[0].length / sampleRate) return 0;
  const start=Math.floor(seconds*sampleRate), end=Math.min(channels[0].length,start+Math.max(1,Math.round(windowSeconds*sampleRate)));
  let sum=0; for(let i=start;i<end;i++) for(const channel of channels) sum += (channel[i] ?? 0) ** 2;
  return Math.sqrt(sum / ((end-start)*channels.length));
}

const vertexShader = `#version 300 es
in vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;
const fragmentShader = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 resolution;
uniform float time, rms, depth, density, bloom, connection, scale, motion, response;
uniform int mode;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 moonwater(vec2 uv){
  float t=time*motion*.20;
  float audio=clamp(rms*12.,0.,1.)*response;
  float horizon=.19;
  float distanceToHorizon=max(.025,horizon-uv.y);
  float surface=1.-smoothstep(horizon-.025,horizon+.025,uv.y);
  vec3 col=mix(vec3(.006,.018,.026),vec3(.012,.034,.043),smoothstep(-.5,.3,uv.y));
  vec2 moonPos=vec2(.34,.30);
  float moonDist=length((uv-moonPos)*vec2(.85,1.));
  float moonHalo=exp(-moonDist*7.);
  float moonDisc=1.-smoothstep(.026,.034,moonDist);
  col+=vec3(.12,.17,.16)*moonHalo*.7+vec3(.30,.35,.30)*moonDisc*.52;
  float depthStretch=mix(.45,1.3,depth);
  float perspective=-log(distanceToHorizon+.08)*mix(12.,23.,depthStretch*.55);
  float chop=sin(uv.x*7.5+t*.5+sin(uv.x*2.1+t*.12)*1.2);
  float ridges=pow(max(0.,cos(perspective+chop*.72)),16.);
  float fine=pow(max(0.,cos(perspective*1.73-sin(uv.x*11.-t*.25))),24.);
  float reflectionX=.34+sin(perspective*.17+t*.12)*(.02+distanceToHorizon*.12);
  float reflection=exp(-abs(uv.x-reflectionX)*(2.3+distanceToHorizon*2.8))*surface;
  float light=(.10+.13*reflection)*(1.+audio*.85);
  col+=surface*vec3(.10,.23,.25)*(ridges+fine*.33)*light*(.55+connection*.8);
  col+=reflection*vec3(.045,.065,.060)*(.28+ridges*.9+fine*.22)*(1.+audio*.8);
  for(int layer=0;layer<4;layer++){
    float z=float(layer);float spread=1.+distanceToHorizon*(.2+depth*.9)+z*.17;
    vec2 grid=vec2(17.+z*5.,5.5+z*1.8);
    vec2 p=vec2(uv.x*grid.x/spread,perspective*(.50+z*.07));
    p.x+=sin(p.y*.34+t*.15+z)*(.13+depth*.25);
    vec2 id=floor(p),f=fract(p)-.5;
    float h=hash21(id+z*91.);vec2 off=vec2(hash21(id+z*31.)-.5,hash21(id+z*51.)-.5)*.75;
    vec2 delta=(f-off)*vec2(.85,2.5+z*.15);
    float d=length(delta);float visible=1.-step(.035+density*.18,h);
    float kind=hash21(id+z*7.+9.);
    float radius=mix(42.,17.,pow(kind,4.));
    float core=exp(-d*radius)*visible;
    float halo=exp(-d*(9.+z*1.5))*visible;
    float twinkle=.48+.52*pow(.5+.5*sin(t*(.6+h)+h*39.),4.);
    float fade=surface*smoothstep(.02,.12,distanceToHorizon)/(1.+z*.28);
    vec3 pearl=mix(vec3(.38,.55,.57),vec3(.78,.76,.63),kind*.55);
    col+=pearl*fade*twinkle*(core*(.42+.58*kind)+halo*.075)*(0.8+audio*1.25);
  }
  return col;
}
vec3 julia(vec2 uv){
  float t=time*motion; float audio=clamp(rms*12.,0.,1.)*response;
  vec2 z=uv*(1.9/scale); z*=rot(.006*t);
  vec2 c=vec2(-.73,.19)+vec2(sin(t*.027),cos(t*.033))*(.025+.03*depth);
  c+=vec2(.024,-.016)*audio;
  float it=0.; float trap=4.;
  for(int i=0;i<90;i++){if(float(i)>25.+depth*60.)break; z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;trap=min(trap,abs(length(z)-.38));if(dot(z,z)>16.)break;it++;}
  float escaped=1.-step(24.+depth*59.,it);
  float fil=exp(-trap*mix(40.,10.,density));
  float bands=.5+.5*cos(it*.27+time*.035*motion);
  vec3 color=vec3(.002,.007,.014)+escaped*(vec3(.07,.19,.23)*fil*(.3+connection)+vec3(.11,.20,.25)*pow(bands,4.)*(.14+bloom*.4));
  color+=vec3(.5,.67,.68)*pow(fil,5.)*(.06+.18*bloom)*(1.+audio*1.2);
  return color;
}
float bulb(vec3 p){
  vec3 z=p;float dr=1.,r=0.;float power=6.+floor(density*4.+.5);
  for(int i=0;i<8;i++){
    if(float(i)>2.+depth*5.)break;
    r=length(z);if(r>2.5)break;
    float theta=acos(clamp(z.z/max(r,.0001),-1.,1.)),phi=atan(z.y,z.x);
    dr=pow(max(r,.0001),power-1.)*power*dr+1.;float zr=pow(r,power);
    theta*=power;phi*=power;
    z=zr*vec3(sin(theta)*cos(phi),sin(theta)*sin(phi),cos(theta))+p;
  }
  return .5*log(max(r,.0001))*r/max(dr,.0001);
}
vec3 mandelbulb(vec2 uv){
  vec3 ro=vec3(0.,.12,6.1/scale),rd=normalize(vec3(uv,-1.8));
  float a=time*motion*.035;ro.xz=rot(a)*ro.xz;rd.xz=rot(a)*rd.xz;
  float t=0.,d=0.;bool hit=false;int steps=0;
  for(int i=0;i<128;i++){vec3 p=ro+rd*t; d=bulb(p); steps=i;if(d<.0015){hit=true;break;} t+=clamp(d,.002,.22);if(t>14.)break;}
  vec3 bg=vec3(.003,.008,.014)+vec3(.006,.015,.022)*exp(-length(uv)*1.8);
  if(!hit)return bg;
  vec3 p=ro+rd*t;float e=.0025;
  vec3 n=normalize(vec3(bulb(p+vec3(e,0,0))-bulb(p-vec3(e,0,0)),bulb(p+vec3(0,e,0))-bulb(p-vec3(0,e,0)),bulb(p+vec3(0,0,e))-bulb(p-vec3(0,0,e))));
  vec3 lightdir=normalize(vec3(-.5,.8,1.));float diff=max(dot(n,lightdir),0.);float rim=pow(1.-max(dot(n,-rd),0.),2.);
  float shade=.11+diff*.52+rim*(.16+bloom*.16);float strata=.65+.35*sin(length(p)*14.+float(steps)*.08);
  vec3 material=mix(vec3(.10,.23,.25),vec3(.56,.64,.58),clamp(diff*.7+strata*.15,0.,1.));
  return bg+material*shade*(.7+depth*.35)*(1.+clamp(rms*12.,0.,1.)*response*.8)+vec3(.06,.15,.17)*rim*connection;
}
void main(){vec2 uv=(gl_FragCoord.xy-.5*resolution)/resolution.y; vec3 col;
 if(mode==0) col=moonwater(uv*vec2(1.45,1.0)/scale);
 else if(mode==1) col=julia(uv);
 else col=mandelbulb(uv);
 col=1.-exp(-max(col,0.)*1.2); col=pow(col,vec3(.86));fragColor=vec4(col,1.);}`;

const postShader = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D image;
uniform vec2 resolution;
uniform float bloom;
vec3 bright(vec2 uv){return max(texture(image,uv).rgb-vec3(.08),vec3(0.));}
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  vec3 base=texture(image,uv).rgb;
  vec2 d=vec2(3.5+5.*bloom)/resolution;
  vec3 glow=bright(uv)*.18;
  glow+=(bright(uv+vec2(d.x,0.))+bright(uv-vec2(d.x,0.))+bright(uv+vec2(0.,d.y))+bright(uv-vec2(0.,d.y)))*.12;
  glow+=(bright(uv+d)+bright(uv-d)+bright(uv+vec2(d.x,-d.y))+bright(uv+vec2(-d.x,d.y)))*.085;
  fragColor=vec4(min(base+glow*bloom*.8,vec3(1.)),1.);
}`;

function createRenderer(canvas: HTMLCanvasElement) {
  const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:true,alpha:false});
  if(!gl) throw new Error('WebGL2가 필요합니다. 브라우저의 하드웨어 가속을 확인하세요.');
  canvas.width=960; canvas.height=540;
  const shader=(type:number,source:string)=>{const s=gl.createShader(type);if(!s)throw new Error('Shader creation failed');gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(`Shader: ${gl.getShaderInfoLog(s)}`);return s;};
  const vs=shader(gl.VERTEX_SHADER,vertexShader),fs=shader(gl.FRAGMENT_SHADER,fragmentShader),postfs=shader(gl.FRAGMENT_SHADER,postShader);
  const link=(fragment:WebGLShader)=>{const prog=gl.createProgram();if(!prog)throw new Error('WebGL program creation failed');gl.attachShader(prog,vs);gl.attachShader(prog,fragment);gl.bindAttribLocation(prog,0,'position');gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(`WebGL link: ${gl.getProgramInfoLog(prog)}`);return prog;};
  const program=link(fs),post=link(postfs);
  const buffer=gl.createBuffer();if(!buffer)throw new Error('WebGL buffer failed');gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  const texture=gl.createTexture(),framebuffer=gl.createFramebuffer();if(!texture||!framebuffer)throw new Error('WebGL framebuffer creation failed');
  gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,canvas.width,canvas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('WebGL framebuffer incomplete');gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const uniforms=Object.fromEntries(['resolution','time','rms','depth','density','bloom','connection','scale','motion','response','mode'].map(n=>[n,gl.getUniformLocation(program,n)]));
  const postResolution=gl.getUniformLocation(post,'resolution'),postBloom=gl.getUniformLocation(post,'bloom'),postImage=gl.getUniformLocation(post,'image');
  return {draw(v:VisualConfig,t:number,level:number){
    gl.viewport(0,0,canvas.width,canvas.height);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.useProgram(program);
    gl.uniform2f(uniforms['resolution'],canvas.width,canvas.height);gl.uniform1f(uniforms['time'],t);gl.uniform1f(uniforms['rms'],level);gl.uniform1f(uniforms['depth'],v.depth);gl.uniform1f(uniforms['density'],v.density);gl.uniform1f(uniforms['bloom'],v.bloom);gl.uniform1f(uniforms['connection'],v.connection);gl.uniform1f(uniforms['scale'],.55+v.scale*1.25);gl.uniform1f(uniforms['motion'],v.motion);gl.uniform1f(uniforms['response'],v.response);gl.uniform1i(uniforms['mode'],v.mode==='moonwater'?0:v.mode==='fractal'?1:2);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(post);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(postImage,0);gl.uniform2f(postResolution,canvas.width,canvas.height);gl.uniform1f(postBloom,v.bloom);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  },dispose(){gl.deleteFramebuffer(framebuffer);gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteProgram(post);gl.deleteShader(vs);gl.deleteShader(fs);gl.deleteShader(postfs);}};
}

export interface WorkbenchEngine {
  generate(config:MusicConfig):Promise<void>; play():Promise<void>; pause():void; seek(seconds:number):void;
  setVisual(config:VisualConfig):void; exportVideo(onProgress?:(fraction:number)=>void):Promise<Blob>;
  cancelExport():void; getWav():Blob; getMusicDocument():MusicDocument; dispose():void;
}
export function createWorkbenchEngine(canvas:HTMLCanvasElement,onState:(state:WorkbenchState)=>void):WorkbenchEngine {
  const renderer=createRenderer(canvas);
  let visual:VisualConfig={mode:'moonwater',depth:.5,density:.35,bloom:.4,connection:.3,scale:.55,motion:.35,response:.45};
  let state:WorkbenchState={status:'idle',time:0,duration:0,rms:0};
  let channels:Float32Array[]|undefined, wav:Uint8Array|undefined, musicDocument:MusicDocument|undefined, sampleRate=48000;
  let context:AudioContext|undefined, source:AudioBufferSourceNode|undefined;
  let position=0, startedAt=0, generation=0, disposed=false, animation=0;
  let cancelRecording:(()=>void)|undefined;let previewEpoch=performance.now();let lastEmit=0;
  const emit=(changes:Partial<WorkbenchState>={})=>{state={...state,...changes};onState({...state});};
  const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
  const assertLive=()=>{if(disposed)throw new Error('작업실이 닫혔습니다.');};
  const assertEditable=()=>{assertLive();if(state.status==='exporting')throw new Error('내보내기가 끝날 때까지 설정을 바꿀 수 없습니다.');};
  const timeNow=()=>state.status==='playing' && context ? Math.min(state.duration,position+Math.max(0,context.currentTime-startedAt)) : position;
  const stopSource=()=>{if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();source=undefined;}};
  const tick=(now:number)=>{if(disposed)return; if(state.status!=='exporting'){
    const t=state.status==='idle'?(now-previewEpoch)/1000:timeNow();
    const level=channels?rmsAt(channels,sampleRate,t):0;
    renderer.draw(visual,t,level);
    if(now-lastEmit>100){lastEmit=now;emit({time:state.status==='idle'?0:t,rms:level});}
  } animation=requestAnimationFrame(tick);};
  animation=requestAnimationFrame(tick);emit();
  const pause=()=>{assertEditable();if(state.status==='generating')return;if(state.status==='playing'){position=timeNow();generation++;stopSource();emit({status:'ready',time:position,rms:channels?rmsAt(channels,sampleRate,position):0});}else generation++;};
  return {
    async generate(config){assertEditable();if(state.status==='generating')throw new Error('음악을 생성 중입니다.');pause();const version=++generation;const music={...config};channels=undefined;wav=undefined;musicDocument=undefined;position=0;emit({status:'generating',time:0,duration:music.duration,rms:0,error:undefined});
      try{const composition=makeComposition(music);const rendered=await renderAudio(composition);if(disposed||version!==generation)return;
        const doc=createMusicDocument(music,{notes:composition.audio.notes,cps:composition.audio.cps,slow:composition.audio.slow,seed:composition.seed},rendered.scheduledEvents);
        sampleRate=composition.audio.sampleRate;channels=rendered.channels.map(ch=>Float32Array.from(ch,s=>s*music.gain));wav=encodeWav(channels,sampleRate);musicDocument=doc;
        emit({status:'ready',time:0,duration:composition.durationSeconds,rms:0,error:undefined});
      }catch(e){if(!disposed&&version===generation)emit({status:'error',error:errorText(e),time:0,rms:0});throw e;}
    },
    async play(){assertEditable();if(!channels||!wav)throw new Error('먼저 음악을 생성해 주세요.');if(state.status==='playing')return;if(state.status==='generating')throw new Error('음악을 생성 중입니다.');
      if(position>=state.duration)position=0;const version=++generation;
      context ??= new AudioContext({sampleRate});await context.resume();if(disposed||version!==generation)return;
      const buf=context.createBuffer(channels.length,channels[0].length,sampleRate);channels.forEach((c,i)=>buf.getChannelData(i).set(c));
      const node=context.createBufferSource();source=node;node.buffer=buf;node.connect(context.destination);startedAt=context.currentTime+.03;const offset=position;
      node.onended=()=>{if(source!==node||disposed)return;source=undefined;position=state.duration;emit({status:'ready',time:position,rms:0});};
      node.start(startedAt,offset);emit({status:'playing',time:position,error:undefined});
    },
    pause,
    seek(seconds){assertEditable();if(!channels)throw new Error('먼저 음악을 생성해 주세요.');if(!Number.isFinite(seconds))throw new Error('올바른 재생 위치가 아닙니다.');const playing=state.status==='playing';if(playing)pause();position=Math.max(0,Math.min(state.duration,seconds));renderer.draw(visual,position,rmsAt(channels,sampleRate,position));emit({status:'ready',time:position,rms:rmsAt(channels,sampleRate,position)});if(playing)void this.play().catch(e=>emit({status:'error',error:errorText(e)}));},
    setVisual(config){assertEditable();if(!['moonwater','fractal','mandelbulb'].includes(config.mode))throw new Error('알 수 없는 시각 모드입니다.');for(const key of ['depth','density','bloom','connection','scale','motion','response'] as const)finiteBetween(config[key],0,1,key);visual={...config};const t=state.status==='idle'?(performance.now()-previewEpoch)/1000:timeNow();renderer.draw(visual,t,channels?rmsAt(channels,sampleRate,t):0);},
    async exportVideo(onProgress){assertEditable();if(!channels||!wav)throw new Error('먼저 음악을 생성해 주세요.');if(typeof MediaRecorder==='undefined'||typeof canvas.captureStream!=='function')throw new Error('이 브라우저는 영상 녹화를 지원하지 않습니다.');
      const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
      if(!mime)throw new Error('이 브라우저는 WebM 오디오·영상 녹화를 지원하지 않습니다.');
      pause();const savedPosition=position;const frozen={...visual};const data=channels;const duration=state.duration;emit({status:'exporting',time:0,rms:0,error:undefined,videoMime:mime});
      let exportContext:AudioContext|undefined, exportSource:AudioBufferSourceNode|undefined, stream:MediaStream|undefined, rec:MediaRecorder|undefined, raf=0;
      let abort=false;const chunks:Blob[]=[];
      // Cancellation is registered before the asynchronous audio-context startup.
      cancelRecording=()=>{abort=true;if(exportContext&&exportContext.state!=='closed')void exportContext.close().catch(()=>{});};
      try{
        renderer.draw(frozen,0,rmsAt(data,sampleRate,0));
        stream=canvas.captureStream(30);exportContext=new AudioContext({sampleRate});await exportContext.resume();
        if(abort||disposed)throw new DOMException('취소됨','AbortError');
        const buffer=exportContext.createBuffer(data.length,data[0].length,sampleRate);data.forEach((ch,i)=>buffer.getChannelData(i).set(ch));
        const dest=exportContext.createMediaStreamDestination();exportSource=exportContext.createBufferSource();exportSource.buffer=buffer;exportSource.connect(dest);
        const audioTrack=dest.stream.getAudioTracks()[0];if(!audioTrack)throw new Error('오디오 녹음 트랙을 만들 수 없습니다.');stream.addTrack(audioTrack);
        rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4_000_000});
        const result=await new Promise<Blob>((resolve,reject)=>{
          let settled=false;const finishError=(e:unknown)=>{if(settled)return;settled=true;reject(e);};
          cancelRecording=()=>{abort=true;try{exportSource?.stop();}catch{}if(rec?.state!=='inactive')rec?.stop();else finishError(new DOMException('취소됨','AbortError'));};
          rec!.ondataavailable=(event)=>{if(event.data.size)chunks.push(event.data);};
          rec!.onerror=()=>finishError(new Error('영상 녹화에 실패했습니다.'));
          rec!.onstop=()=>{if(settled)return;settled=true;if(abort)reject(new DOMException('취소됨','AbortError'));else if(!chunks.length)reject(new Error('영상 데이터가 비어 있습니다.'));else resolve(new Blob(chunks,{type:mime}));};
          let audioEndedAt:number|undefined;
          exportSource!.onended=()=>{audioEndedAt=exportContext!.currentTime;};
          rec!.start(250);const start=exportContext!.currentTime+.05;exportSource!.start(start);
          const draw=()=>{if(abort)return;if(document.hidden){try{exportSource?.stop();}catch{}if(rec?.state!=='inactive')rec?.stop();finishError(new Error('영상 녹화 중 탭이 숨겨져 중단됐습니다.'));return;}
            const t=Math.max(0,Math.min(duration,exportContext!.currentTime-start));const level=rmsAt(data,sampleRate,t);renderer.draw(frozen,t,level);onProgress?.(t/duration);emit({time:t,rms:level});
            // Hold the last image for at least 100 ms after the audio source ends
            // so the encoder can flush its tail before MediaRecorder stops.
            if(audioEndedAt!==undefined && exportContext!.currentTime-audioEndedAt>=.10){if(rec?.state!=='inactive')rec?.stop();return;}raf=requestAnimationFrame(draw);};
          raf=requestAnimationFrame(draw);
        });
        onProgress?.(1);return result;
      }catch(e){if(abort||disposed)throw new DOMException('취소됨','AbortError');emit({error:errorText(e)});throw e;}
      finally{cancelRecording=undefined;cancelAnimationFrame(raf);try{exportSource?.stop();}catch{}exportSource?.disconnect();stream?.getTracks().forEach(track=>track.stop());if(exportContext&&exportContext.state!=='closed')await exportContext.close();position=savedPosition;if(!disposed){renderer.draw(visual,position,rmsAt(data,sampleRate,position));emit({status:'ready',time:position,rms:rmsAt(data,sampleRate,position)});}}
    },
    cancelExport(){cancelRecording?.();},
    getWav(){assertLive();if(!wav)throw new Error('먼저 음악을 생성해 주세요.');return new Blob([wav.slice().buffer as ArrayBuffer],{type:'audio/wav'});},
    getMusicDocument(){assertLive();if(!musicDocument)throw new Error('먼저 음악을 생성해 주세요.');return structuredClone(musicDocument);},
    dispose(){if(disposed)return;cancelRecording?.();disposed=true;generation++;stopSource();cancelAnimationFrame(animation);if(context&&context.state!=='closed')void context.close();renderer.dispose();},
  };
}
