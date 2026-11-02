import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildScene} from './gujora-spatial-scene.mjs';

// Original, deterministic WebGL point-and-filament scene. The source image is
// not used as a background or texture. Individual particles occupy 3D space.
const vertex=`
precision highp float;
attribute vec3 aPosition;
attribute vec3 aDrift;
attribute vec4 aData;
uniform mat4 uView,uProjection;
uniform float uLow,uMid,uHigh,uLine;
varying vec4 vColor;
varying vec2 vStretch;
void main(){
 float type=aData.x,sz=aData.z,lum=aData.w;
 // All geometry is static: only the camera transforms aPosition.
 vec4 eye=uView*vec4(aPosition,1.);
 float depth=max(.08,-eye.z);
 gl_Position=uProjection*eye;
 float pointScale=type<.5||type>7.5?20.:27.;
 gl_PointSize=clamp(sz*pointScale/depth,1.25,9.);
 float fog=mix(1.,.65,smoothstep(10.,40.,depth))*smoothstep(.20,1.3,depth);
 vec3 ink=vec3(.78,.85,.91);
 float alpha=.43;
 if(type<.5){alpha=.82;}
 else if(type<1.5){alpha=.28;}
 else if(type<2.5){ink=vec3(.78,.72,.67);alpha=.80;}
 else if(type<3.5){ink=vec3(.62,.60,.57);alpha=.75;}
 else if(type<4.5){ink=mix(vec3(.85,.64,.42),vec3(1.,.92,.77),.65);alpha=.75;}
 else if(type<5.5){ink=vec3(.80,.84,.87);alpha=.22;}
 else if(type<6.5){ink=vec3(.83,.88,.96);alpha=.80;}
 else if(type<7.5){ink=vec3(.66,.62,.57);alpha=.38;}
 else if(type<8.5){ink=vec3(.76,.84,.90);alpha=.82;}
 else {ink=vec3(.70,.78,.83);alpha=.65*smoothstep(.05,.38,abs(uView[0][2]));}
 // Band envelopes influence light only, never geometry.
 float light=1.+.07*uLow+.05*uMid+.03*uHigh;
 vColor=vec4(ink*lum*light*1.65,clamp(alpha*fog,0.,1.));
 vStretch=vec2(1.+.22*abs(aDrift.x),1.+.42*abs(aDrift.y));
}`;
const fragment=`
precision mediump float;
uniform float uLine;
varying vec4 vColor;
varying vec2 vStretch;
void main(){
 float shape=1.;
 if(uLine<.5){
   vec2 p=(gl_PointCoord*2.-1.)*vStretch;
   float r=dot(p,p);if(r>1.)discard;
   shape=exp(-1.4*r)*(1.-smoothstep(.72,1.,r));
   if(shape<.08)discard;
 }
 if(vColor.a*shape<.04)discard;
 gl_FragColor=vec4(vColor.rgb,vColor.a*shape);
}`;
const fps=24,size=1080;
// One authoritative route is passed to the renderer and written to metadata.
const CAMERA_KEYFRAMES=Object.freeze([
  {phase:0,eye:[0,5.5,14],target:[0,0,0]},
  {phase:.15,eye:[0,5.5,14],target:[0,0,0]},
  {phase:.35,eye:[-1.8,3.9,12.5],target:[-.2,1.2,1]},
  {phase:.45,eye:[-.5,1.4,5.8],target:[-.3,.05,1.5]},
  {phase:.55,eye:[9.5,5.7,14.8],target:[-.3,1.25,1]},
  {phase:.67,eye:[.9,2.5,4.7],target:[.3,3.7,1.4]},
  {phase:.75,eye:[2.7,8.7,13.4],target:[.3,2.2,1.6]},
  {phase:.95,eye:[0,5.5,14],target:[0,0,0]},
  {phase:1,eye:[0,5.5,14],target:[0,0,0]}
]);

const get=(name,defaultValue)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)??defaultValue;
const flag=name=>process.argv.includes(`--${name}`);
const preview=flag('preview'),stillsOnly=flag('stills-only');
const total=Number(get('duration-total','464'));
if(!Number.isFinite(total)||total<=0||Math.abs(total*fps-Math.round(total*fps))>1e-7)throw Error('Total duration must be positive and frame-aligned.');
const start=Number(get('start',preview?String(Math.round(total*.4*fps)/fps):'0'));
const duration=Number(get('duration',preview?String(Math.min(12,total-start)):String(total)));
if(!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<=0||start+duration>total||
  Math.abs(start*fps-Math.round(start*fps))>1e-7||Math.abs(duration*fps-Math.round(duration*fps))>1e-7)
  throw Error('Start and duration must be frame-aligned and lie within the total duration.');
const defaultStills=start===0&&duration===total?[.13,.35,.54,.75,.95].map(x=>Math.round(total*x*fps)/fps).join(','):[start,start+3,start+7,start+11].filter(t=>t<start+duration).join(',');
const stillArg=get('still-times',defaultStills);
const stills=stillArg?stillArg.split(',').map(Number):[];
if(stills.some(t=>!Number.isFinite(t)||t<start||t>=start+duration||Math.abs(t*fps-Math.round(t*fps))>1e-7)||new Set(stills).size!==stills.length)
  throw Error('Still times must be unique, frame-aligned and inside the requested interval.');
if(stillsOnly&&!stills.length)throw Error('--stills-only requires at least one still time.');
const input=path.resolve(get('input','runs/dp-sts-gujora-spatial-v01'));
const out=path.resolve(get('out','runs/dp-sts-gujora-spatial-v01'));
const audioPath=path.join(input,'audio.wav'),featurePath=path.join(input,'audio-features.json');
const coverPath=path.resolve(get('cover','runs/dp-sts-gujora-cover-v01/dp-sts-gujora-yundol-cover.png'));
const rendererPath=fileURLToPath(import.meta.url),scenePath=fileURLToPath(new URL('./gujora-spatial-scene.mjs',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const [audio,featureBytes,rendererBytes,sceneBytes,coverBytes]=await Promise.all([readFile(audioPath),readFile(featurePath),readFile(rendererPath),readFile(scenePath),readFile(coverPath)]);
const features=JSON.parse(featureBytes),audioHash=hash(audio);
if(features.fps!==fps||!Array.isArray(features.frames)||features.frames.length<total*fps)throw Error('Audio features must cover the total duration at 24 fps.');
if(!features.wav_sha256||features.wav_sha256!==audioHash)throw Error('Audio features must match the WAV SHA-256.');
const media=JSON.parse((await promisify(execFile)('ffprobe',['-v','error','-show_entries','format=duration','-of','json',audioPath])).stdout);
if(Number(media.format.duration)<total-.03)throw Error('Audio WAV is shorter than the total duration.');
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
 if(!scene.staticParticlePositions||scene.waterPlaneY!==0||scene.people.length!==7||scene.people.filter(p=>p.group==='fire').length!==3||
   scene.people.filter(p=>p.group==='couple').length!==2||scene.people.filter(p=>p.group==='family').length!==2||
   scene.design.brazierHeight!==scene.design.adultHeight*.25||scene.design.islandBaseY<=scene.design.shorelineTopY)
   throw Error('Scene composition invariants failed.');
 const payload={vertex,fragment,size,keyframes:CAMERA_KEYFRAMES,points:[b64(scene.positions),b64(scene.drifts),b64(scene.data)],
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
   const uniforms=Object.fromEntries(['uView','uProjection','uLow','uMid','uHigh','uLine'].map(k=>[k,gl.getUniformLocation(program,k)]));
   const near=.08,far=150,focal=2.747477;
   const projection=new Float32Array([focal,0,0,0,0,focal,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
   gl.uniformMatrix4fv(uniforms.uProjection,false,projection);
   const bind=buffers=>{for(let i=0;i<3;i++){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);gl.enableVertexAttribArray(locations[i]);gl.vertexAttribPointer(locations[i],i===2?4:3,gl.FLOAT,false,0,0);}};
   gl.viewport(0,0,data.size,data.size);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);
   gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
   window.drawFrame=({t,phase,values})=>{
     gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
     gl.uniformMatrix4fv(uniforms.uView,false,new Float32Array(window.cameraAt({phase}).view));
     gl.uniform1f(uniforms.uLow,values[0]);gl.uniform1f(uniforms.uMid,values[1]);gl.uniform1f(uniforms.uHigh,values[2]);
     gl.uniform1f(uniforms.uLine,0);bind(pointBuffers);gl.drawArrays(gl.POINTS,0,data.pointCount);
     gl.uniform1f(uniforms.uLine,1);bind(lineBuffers);gl.drawArrays(gl.LINES,0,data.lineCount);
     const err=gl.getError();if(err!==gl.NO_ERROR)throw Error(`WebGL error ${err}`);
     return canvas.toDataURL('image/png').split(',')[1];
   };
   window.cameraAt=({phase})=>{
     const keys=data.keyframes;
     let j=0;while(j<keys.length-2&&phase>keys[j+1].phase)j++;
     const a=keys[j],b=keys[j+1];let q=Math.max(0,Math.min(1,(phase-a.phase)/(b.phase-a.phase)));q=q*q*(3-2*q);
     const eye=a.eye.map((v,i)=>v+(b.eye[i]-v)*q),target=a.target.map((v,i)=>v+(b.target[i]-v)*q);
     const sub=(x,y)=>x.map((v,i)=>v-y[i]),dot=(x,y)=>x.reduce((sum,v,i)=>sum+v*y[i],0);
     const norm=x=>{const n=Math.hypot(...x);return x.map(v=>v/n);};
     const cross=(x,y)=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
     const f=norm(sub(target,eye)),r=norm(cross(f,[0,1,0])),up=cross(r,f);
     return {eye,target,view:[r[0],up[0],-f[0],0,r[1],up[1],-f[1],0,r[2],up[2],-f[2],0,-dot(r,eye),-dot(up,eye),dot(f,eye),1]};
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
   const t=frameIndex/fps,frame=Buffer.from(await page.evaluate(payload=>window.drawFrame(payload),{t,phase:t/total,values:controls[frameIndex]}),'base64');
   if(errors.length)throw Error(errors.join('\n'));
   if(encoder&&!encoder.stdin.write(frame))await once(encoder.stdin,'drain');
   if(wanted.has(frameIndex))await writeFile(path.join(out,nameAt(t)),frame,{flag:'wx'});
   count++;
   if(count%360===0||count===1||count===indexes.length)console.log(`${tag} ${count}/${indexes.length} ${((Date.now()-began)/1000).toFixed(1)}s`);
 }
 if(encoder){encoder.stdin.end();const [status]=await done;if(status!==0)throw Error(`Encoder exited ${status}`);}
 if(count!==indexes.length)throw Error('Incomplete frame sequence.');
 const meta={title:'Gujora / Yundol — spatial',method:'Static 3D source-line particles and soft splat-style sprites; a perspective camera travels through the field, audio modulates brightness only; no trained Gaussian reconstruction',
   start,duration:stillsOnly?null:duration,fps,frames:count,width:size,height:size,stillTimes:stills,stillsOnly,
   source:{cover:coverPath,coverSha256:hash(coverBytes),audio:audioPath,audioSha256:audioHash,features:featurePath,featuresSha256:hash(featureBytes),implementationSha256:hash(rendererBytes),sceneSha256:hash(sceneBytes),
     vertexSha256:hash(vertex),fragmentSha256:hash(fragment)},
   geometry:{seed:scene.seed,pointCount:scene.count,lineVertexCount:scene.lineCount,groups:scene.groups,people:scene.people,design:scene.design,staticParticlePositions:true,waterPlaneY:scene.waterPlaneY},
   camera:{fovDegrees:40,near:.08,far:150,keyframes:CAMERA_KEYFRAMES},
   gpu,elapsedSeconds:(Date.now()-began)/1000,errors};
 await writeFile(path.join(out,stillsOnly?'stills-render.json':preview?'preview-render.json':'render.json'),JSON.stringify(meta,null,2),{flag:'wx'});
 await writeFile(path.join(out,preview?'preview-renderer.mjs':'renderer.mjs'),rendererBytes,{flag:'wx'});
 await writeFile(path.join(out,preview?'preview-scene.mjs':'scene.mjs'),sceneBytes,{flag:'wx'});
 await writeFile(path.join(out,stillsOnly?'stills-reference.png':preview?'preview-reference.png':'reference.png'),coverBytes,{flag:'wx'});
 console.log(`Completed ${out}`);
}finally{if(encoder&&encoder.exitCode===null)encoder.kill();await browser.close();}
