import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildScene} from './gujora-particle-scene.mjs';

// Original, deterministic WebGL point-and-filament scene. The source image is
// not used as a background or texture. Individual particles occupy 3D space.
const vertex=`
precision highp float;
attribute vec3 aPosition;
attribute vec3 aDrift;
attribute vec4 aData;
uniform float uTime,uLow,uMid,uHigh,uLine;
varying vec4 vColor;
float ss(float a,float b,float x){return smoothstep(a,b,x);}
void main(){
 float type=aData.x,seed=aData.y,sz=aData.z,lum=aData.w,t=uTime;
 float tide=ss(27.,50.,t)*(1.-ss(126.,165.,t));
 float dissolve=ss(82.,113.,t)*(1.-ss(131.,164.,t));
 float receive=ss(133.,150.,t)*(1.-ss(164.,180.,t));
 float settle=1.-ss(165.,180.,t);
 float energy=.58+.24*uLow+.18*uMid;
 vec3 p=aPosition;
 vec3 curl=vec3(sin(seed+t*.12+aDrift.y*2.)+.35*sin(t*.23+seed*2.1),
                 sin(seed*1.7-t*.105+aDrift.z*2.)+.35*cos(t*.19+seed),
                 cos(seed*.9+t*.10+aDrift.x*3.)+.35*sin(t*.17+seed*1.3));
 vec3 ink=vec3(.79,.85,.91);
 float opacity=.34;
 if(type<.5){
   // Adjacent source pixels share the same smooth spatial field. The initial
   // view is unwarped; no independent per-point jitter dissolves the lines.
   float motion=(.032*tide+.105*dissolve)*energy*settle;
   p.x+=motion*sin(p.x*1.7+p.y*1.25-t*.12);
   p.y+=motion*.72*sin(p.x*2.35-p.y*.9-t*.095);
   p.z+=motion*2.5*cos(p.x*1.15+p.y*.8-t*.10);
   opacity=.78;
 } else if(type<1.5){
   p+=curl*(.012+.014*tide)*settle;
   opacity=.38;
 } else if(type<2.5){
   // The seven small figures hold their shape, with only sub-pixel breathing.
   p.x+=.003*sin(t*.18+seed*.15)*settle;
   ink=mix(vec3(.58,.66,.73),vec3(.91,.76,.62),.15+.20*exp(-abs(p.x-.34)*2.));
   opacity=.50;
 } else if(type<3.5){opacity=.52;
 } else if(type<4.5){
   p.x+=.014*sin(t*.7+seed*1.1)*settle;
   p.y+=.012*sin(t*.53+seed)*settle;
   ink=mix(vec3(.86,.67,.45),vec3(1.,.92,.78),.55+.35*sin(seed*1.7));opacity=.43;
   lum*=.86+.14*sin(t*.91+seed*.7);
 } else if(type<5.5){
   // Each mote travels upward, expands laterally, and dissolves at both ends.
   float sliceTime=t+7.*aDrift.z*dissolve;
   float u=fract(aPosition.y+sliceTime*.018);
   float lobes=.70+.30*cos(u*17.+sliceTime*.10);
   float width=(.055+.28*u+.38*u*u)*lobes;
   p.x=.34+aPosition.x*width+.28*u+.38*u*sin(u*5.6+sliceTime*.10);
   p.y=-1.29+u*3.93+.08*u*sin(seed+u*8.);
   p.z=1.10+aPosition.z*(.09+.70*u)+.4*aDrift.z*dissolve;
   p+=curl*(.015+.045*u+.09*dissolve)*settle;
   float envelope=ss(0.,.09,u)*(1.-ss(.72,1.,u));
   float pocket=.55+.45*smoothstep(-.3,.6,sin(u*19.+seed*.9));
   opacity=.22*envelope*pocket*(.75+.28*energy);
   lum*=.8+.4*u;
 } else if(type<6.5){
   // A cloud of light gathers into a canopy, then some points drift down.
   float canopy=ss(80.,118.,t)*(1.-ss(162.,180.,t));
   float bow=2.30+.82*(1.-min(1.,p.x*p.x/15.));
   p.y=mix(p.y,bow+aDrift.y*.22,canopy*.58);
   float selected=step(.15,aDrift.z);
   p.y-=receive*selected*(1.9+.65*abs(aDrift.x));
   p.x+=.12*sin(t*.09+seed)*settle;
   p.z+=.30*sin(t*.07+seed)*canopy;
   opacity=.48+.10*canopy;
   lum*=.85+.15*uHigh;
 } else if(type<7.5){opacity=.32;
 } else {
   // Three interleaved source chains use different temporal samples in depth.
   float layer=floor(seed*.5+.01);
   float sliceTime=t+(layer-1.)*7.*dissolve;
   float motion=(.018*tide+.045*dissolve)*energy*settle;
   p.y+=motion*sin(p.x*2.8+p.y*3.2-sliceTime*.17);
   p.x+=motion*.7*cos(p.x*1.5-p.y*2.-sliceTime*.12);
   p.z+=(layer-1.)*.42*dissolve;
   ink=vec3(.76,.84,.89);opacity=.77*mix(1.,.55,step(.5,abs(layer-1.))*dissolve);
 }
 float cameraReturn=sin(3.14159265*clamp(t/180.,0.,1.))*ss(24.,48.,t);
 float angle=.065*sin(t*.026)*cameraReturn,c=cos(angle),s=sin(angle);
 vec3 camera=vec3(c*p.x+s*p.z,p.y+.40,-s*p.x+c*p.z);
 float depth=11.-camera.z-.35*cameraReturn*sin(t*.012);
 float focal=2.747477;
 gl_Position=vec4(camera.x*focal,camera.y*focal,depth*1.002-.2002,depth);
 float scale=(type<.5||type>7.5)?1.55:(2.05+1.25*(1.-smoothstep(6.,15.,depth)));
 gl_PointSize=clamp(sz*scale,.8,4.5);
 vColor=vec4(ink*lum,clamp(opacity,0.,1.));
}`;
const fragment=`
precision mediump float;
uniform float uLine;
varying vec4 vColor;
void main(){
 float shape=1.;
 if(uLine<.5){float r=length(gl_PointCoord-vec2(.5));shape=1.-smoothstep(.16,.5,r);if(shape<=.001)discard;}
 gl_FragColor=vec4(vColor.rgb,vColor.a*shape);
}`;
const fps=24,size=1080,total=180;
const get=(name,defaultValue)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)??defaultValue;
const flag=name=>process.argv.includes(`--${name}`);
const preview=flag('preview'),stillsOnly=flag('stills-only');
const start=Number(get('start',preview?'72':'0'));
const duration=Number(get('duration',preview?'12':'180'));
if(!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<=0||start+duration>total||
  Math.abs(start*fps-Math.round(start*fps))>1e-7||Math.abs(duration*fps-Math.round(duration*fps))>1e-7)
  throw Error('Start and duration must be frame-aligned and lie within 180 seconds.');
const defaultStills=start===0&&duration===180?'15,45,60,85,105,135,150,165,175':[start,start+3,start+7,start+11].filter(t=>t<start+duration).join(',');
const stillArg=get('still-times',defaultStills);
const stills=stillArg?stillArg.split(',').map(Number):[];
if(stills.some(t=>!Number.isFinite(t)||t<start||t>=start+duration||Math.abs(t*fps-Math.round(t*fps))>1e-7)||new Set(stills).size!==stills.length)
  throw Error('Still times must be unique, frame-aligned and inside the requested interval.');
if(stillsOnly&&!stills.length)throw Error('--stills-only requires at least one still time.');
const input=path.resolve(get('input','runs/dp-sts-gujora-particles-v01'));
const out=path.resolve(get('out','runs/dp-sts-gujora-particles-v01'));
const audioPath=path.join(input,'audio.wav'),featurePath=path.join(input,'audio-features.json');
const coverPath=path.resolve(get('cover','runs/dp-sts-gujora-cover-v01/dp-sts-gujora-yundol-cover.png'));
const rendererPath=fileURLToPath(import.meta.url),scenePath=fileURLToPath(new URL('./gujora-particle-scene.mjs',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const [audio,featureBytes,rendererBytes,sceneBytes,coverBytes]=await Promise.all([readFile(audioPath),readFile(featurePath),readFile(rendererPath),readFile(scenePath),readFile(coverPath)]);
const features=JSON.parse(featureBytes),audioHash=hash(audio);
if(features.fps!==fps||!Array.isArray(features.frames)||features.frames.length<total*fps)throw Error('Expected 180 seconds of 24 fps audio features.');
if(!features.wav_sha256||features.wav_sha256!==audioHash)throw Error('Audio features must match the WAV SHA-256.');
const media=JSON.parse((await promisify(execFile)('ffprobe',['-v','error','-show_entries','format=duration','-of','json',audioPath])).stdout);
if(Number(media.format.duration)<total-.03)throw Error('Audio WAV is shorter than 180 seconds.');
// Slow, deterministic per-band envelopes are calculated from time zero so a
// preview and full render use the same data on the same absolute frame.
let state=[0,0,0];const controls=[],alpha=1-Math.exp(-1/(fps*1.2));
for(let i=0;i<total*fps;i++){
  const row=features.frames[i];
  if(!Array.isArray(row)||row.length<4||row.slice(1,4).some(v=>!Number.isFinite(v)))throw Error(`Invalid audio feature frame ${i}`);
  state=state.map((v,k)=>v+alpha*(Math.max(0,Math.min(1,row[k+1]))-v));controls.push([...state]);
}
let scene;
await mkdir(out,{recursive:true});
const tag=stillsOnly?'stills':preview?'preview':'film';
const video=path.join(out,preview?'preview.mp4':'artwork.mp4');
const nameAt=t=>`${preview?'preview':'frame'}-${String(Math.floor(t)).padStart(3,'0')}${Number.isInteger(t)?'':`-${String(Math.round(t*fps)%fps).padStart(2,'0')}`}.png`;
const targets=[...stills.map(t=>path.join(out,nameAt(t))),path.join(out,stillsOnly?'stills-render.json':preview?'preview-render.json':'render.json'),
  path.join(out,preview?'preview-renderer.mjs':'renderer.mjs'),path.join(out,preview?'preview-scene.mjs':'scene.mjs'),
  path.join(out,stillsOnly?'stills-reference.png':preview?'preview-reference.png':'reference.png')];
if(!stillsOnly)targets.push(video);
for(const target of targets){try{await access(target);throw Error(`Refusing to overwrite ${target}`);}catch(e){if(e.code!=='ENOENT')throw e;}}
const b64=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength).toString('base64');
const rr=createRequire(path.resolve('apps/render/package.json')),{chromium}=rr('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});let encoder;const errors=[],began=Date.now();
try{
 const page=await browser.newPage({viewport:{width:size,height:size}});
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.setContent(`<canvas id="film" width="${size}" height="${size}"></canvas>`);
 // Decode the original image once. It is converted to world-space vertices;
 // the renderer never uploads it as a texture or draws a flat image plane.
 const decoded=await page.evaluate(async base64=>{
   const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();
   const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
   const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
   const rgba=ctx.getImageData(0,0,c.width,c.height).data,gray=new Uint8Array(c.width*c.height);
   for(let i=0;i<gray.length;i++)gray[i]=Math.round(.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2]);
   let bin='';for(let i=0;i<gray.length;i+=8192)bin+=String.fromCharCode(...gray.subarray(i,i+8192));
   return {width:c.width,height:c.height,pixels:btoa(bin)};
 },coverBytes.toString('base64'));
 scene=buildScene({width:decoded.width,height:decoded.height,pixels:Buffer.from(decoded.pixels,'base64')});
 if(scene.people.length!==7||scene.people.filter(p=>p.group==='fire').length!==3||
   scene.people.filter(p=>p.group==='couple').length!==2||scene.people.filter(p=>p.group==='family').length!==2||
   scene.design.brazierHeight!==scene.design.adultHeight*.25||scene.design.islandBaseY<=scene.design.shorelineTopY)
   throw Error('Scene composition invariants failed.');
 const payload={vertex,fragment,size,points:[b64(scene.positions),b64(scene.drifts),b64(scene.data)],
   lines:[b64(scene.linePositions),b64(scene.lineDrifts),b64(scene.lineData)],pointCount:scene.count,lineCount:scene.lineCount};
 const gpu=await page.evaluate(data=>{
   const canvas=document.getElementById('film'),gl=canvas.getContext('webgl',{antialias:false,alpha:false,preserveDrawingBuffer:true});
   if(!gl)throw Error('WebGL is unavailable.');
   const shader=(kind,source)=>{const sh=gl.createShader(kind);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
   const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,data.vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,data.fragment));
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
   const decode=str=>{const b=atob(str),bytes=new Uint8Array(b.length);for(let i=0;i<b.length;i++)bytes[i]=b.charCodeAt(i);return new Float32Array(bytes.buffer);};
   const make=parts=>parts.map(part=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,decode(part),gl.STATIC_DRAW);return b;});
   const pointBuffers=make(data.points),lineBuffers=make(data.lines);
   const locations=['aPosition','aDrift','aData'].map(k=>gl.getAttribLocation(program,k));
   const uniforms=Object.fromEntries(['uTime','uLow','uMid','uHigh','uLine'].map(k=>[k,gl.getUniformLocation(program,k)]));
   const bind=buffers=>{for(let i=0;i<3;i++){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);gl.enableVertexAttribArray(locations[i]);gl.vertexAttribPointer(locations[i],i===2?4:3,gl.FLOAT,false,0,0);}};
   gl.viewport(0,0,data.size,data.size);gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
   window.drawFrame=({t,values})=>{
     gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
     gl.uniform1f(uniforms.uTime,t);gl.uniform1f(uniforms.uLow,values[0]);gl.uniform1f(uniforms.uMid,values[1]);gl.uniform1f(uniforms.uHigh,values[2]);
     gl.uniform1f(uniforms.uLine,0);bind(pointBuffers);gl.drawArrays(gl.POINTS,0,data.pointCount);
     gl.uniform1f(uniforms.uLine,1);bind(lineBuffers);gl.drawArrays(gl.LINES,0,data.lineCount);
     const err=gl.getError();if(err!==gl.NO_ERROR)throw Error(`WebGL error ${err}`);
     return canvas.toDataURL('image/png').split(',')[1];
   };
   const ext=gl.getExtension('WEBGL_debug_renderer_info');
   return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',version:gl.getParameter(gl.VERSION),pointSizeRange:Array.from(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE))};
 },payload);
 if(errors.length)throw Error(errors.join('\n'));
 let count=0,done,pipeError;
 if(!stillsOnly){
   encoder=spawn('ffmpeg',['-v','error','-n','-f','image2pipe','-vcodec','png','-framerate',String(fps),'-i','pipe:0',
     '-ss',String(start),'-i',audioPath,'-t',String(duration),'-map','0:v:0','-map','1:a:0',
     '-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k','-movflags','+faststart',video]);
   encoder.stderr.on('data',b=>process.stderr.write(b));encoder.stdin.on('error',e=>{pipeError=e;});done=once(encoder,'close');
 }
 const wanted=new Set(stills.map(t=>Math.round(t*fps)));
 const indexes=stillsOnly?stills.map(t=>Math.round(t*fps)):Array.from({length:Math.round(duration*fps)},(_,i)=>Math.round(start*fps)+i);
 for(const frameIndex of indexes){
   if(pipeError)throw pipeError;
   const t=frameIndex/fps,frame=Buffer.from(await page.evaluate(payload=>window.drawFrame(payload),{t,values:controls[frameIndex]}),'base64');
   if(errors.length)throw Error(errors.join('\n'));
   if(encoder&&!encoder.stdin.write(frame))await once(encoder.stdin,'drain');
   if(wanted.has(frameIndex))await writeFile(path.join(out,nameAt(t)),frame,{flag:'wx'});
   count++;
   if(count%360===0||count===1||count===indexes.length)console.log(`${tag} ${count}/${indexes.length} ${((Date.now()-began)/1000).toFixed(1)}s`);
 }
 if(encoder){encoder.stdin.end();const [status]=await done;if(status!==0)throw Error(`Encoder exited ${status}`);}
 if(count!==indexes.length)throw Error('Incomplete frame sequence.');
 const meta={title:'Gujora / Yundol — particles',method:'Source-cover line pixels projected into 3D points and short filaments, perspective camera, audio-band motion; no cover texture',
   start,duration:stillsOnly?null:duration,fps,frames:count,width:size,height:size,stillTimes:stills,stillsOnly,
   source:{cover:coverPath,coverSha256:hash(coverBytes),audio:audioPath,audioSha256:audioHash,features:featurePath,featuresSha256:hash(featureBytes),implementationSha256:hash(rendererBytes),sceneSha256:hash(sceneBytes),
     vertexSha256:hash(vertex),fragmentSha256:hash(fragment)},
   geometry:{seed:scene.seed,pointCount:scene.count,lineVertexCount:scene.lineCount,groups:scene.groups,people:scene.people,design:scene.design},
   gpu,elapsedSeconds:(Date.now()-began)/1000,errors};
 await writeFile(path.join(out,stillsOnly?'stills-render.json':preview?'preview-render.json':'render.json'),JSON.stringify(meta,null,2),{flag:'wx'});
 await writeFile(path.join(out,preview?'preview-renderer.mjs':'renderer.mjs'),rendererBytes,{flag:'wx'});
 await writeFile(path.join(out,preview?'preview-scene.mjs':'scene.mjs'),sceneBytes,{flag:'wx'});
 await writeFile(path.join(out,stillsOnly?'stills-reference.png':preview?'preview-reference.png':'reference.png'),coverBytes,{flag:'wx'});
 console.log(`Completed ${out}`);
}finally{if(encoder&&encoder.exitCode===null)encoder.kill();await browser.close();}
