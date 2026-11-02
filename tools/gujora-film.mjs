import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile, access} from 'node:fs/promises';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Offline image-based Hydra composition. The original image is the only
// visual texture; the coordinate shader moves it without accumulating trails.
const motionShader=`
  vec2 view=vec2(mix(_st.x,1.-_st.x,screenFlipX),mix(_st.y,1.-_st.y,screenFlipY));
  float x=view.x,y=view.y,t=time;
  float quiet=.22+.78*smoothstep(35.,75.,t);
  float home=1.-smoothstep(135.,180.,t);
  float onset=smoothstep(0.,12.,t);
  float arc=quiet*home*onset;
  float bass=clamp(low,0.,1.);
  float body=clamp(mid,0.,1.);
  float air=clamp(high,0.,1.);
  // These soft envelopes are image-space art direction, not a surveyed map.
  float horizontal=smoothstep(.095,.15,x)*(1.-smoothstep(.86,.91,x));
  float island=horizontal*smoothstep(.270,.315,y)*(1.-smoothstep(.425,.465,y));
  float water=horizontal*smoothstep(.432,.475,y)*(1.-smoothstep(.735,.770,y));
  float shore=water*exp(-pow((y-.505)/.105,2.));
  float foreground=water*(1.-.52*shore);
  float crest=sin(11.*x-7.*y-t*.24+.35*sin(5.*y+t*.07));
  float cross=sin(18.*x+5.*y-t*.32+.3*sin(7.*x-t*.08));
  float broad=sin(5.*x-4.*y-t*.105);
  vec2 d=vec2(0.);
  // Island largely holds still while the shoreline has greater lateral flow.
  d.x+=island*arc*.00065*sin(t*.13+4.*y)*(0.65+.35*bass);
  d.y+=island*arc*.00050*sin(t*.105+3.*x)*(0.7+.3*body);
  d.x+=shore*arc*(.0034*crest+.0010*cross)*(.75+.30*bass);
  d.y+=shore*arc*(.0018*crest+.00065*cross)*(.75+.30*body);
  d.x+=foreground*arc*.0012*broad*(.8+.25*body);
  d.y+=foreground*arc*(.00075*sin(9.*x+6.*y-t*.18)+.00035*cross)*(.8+.25*air);
  vec2 sampleView=view+d;
  vec2 sampleUV=vec2(mix(sampleView.x,1.-sampleView.x,screenFlipX),mix(sampleView.y,1.-sampleView.y,screenFlipY));
  sampleUV=vec2(mix(sampleUV.x,1.-sampleUV.x,sourceFlipX),mix(sampleUV.y,1.-sampleUV.y,sourceFlipY));
  return clamp(sampleUV,vec2(.00001),vec2(.99999));
`;

const fps=24, size=1080, fullSeconds=180;
const defaultInputs='runs/dp-sts-gujora-film-v01';
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const preview=process.argv.includes('--preview');
const input=path.resolve(arg('input',defaultInputs));
const out=path.resolve(arg('out',defaultInputs));
const start=preview?72:0, seconds=preview?8:fullSeconds, count=seconds*fps;
const video=path.join(out,preview?'preview.mp4':'artwork.mp4');
const stillArg=arg('still-times',preview?'72,75,79':'15,60,90,135,165');
const stills=stillArg?stillArg.split(',').map(Number):[];
if(stills.some(t=>!Number.isFinite(t)||t<start||t>=start+seconds||Math.abs(t*fps-Math.round(t*fps))>1e-7))
  throw Error('Still times must be on the 24 fps frame grid and inside the rendered interval.');
const sourcePath=path.join(input,'cover.png'),audioPath=path.join(input,'audio.wav');
const featurePath=path.join(input,'audio-features.json');
const campfireArg=arg('campfire',null);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const [source,audio,featureBytes,ownSource]=await Promise.all([readFile(sourcePath),readFile(audioPath),readFile(featurePath),readFile(fileURLToPath(import.meta.url))]);
const features=JSON.parse(featureBytes);
let campfire=null,campfireBytes=null,campfirePath=null,protectRegions=[];
if(campfireArg!==null){
  if(!campfireArg)throw Error('--campfire requires a JSON file path.');
  campfirePath=path.resolve(campfireArg);
  campfireBytes=await readFile(campfirePath);
  campfire=JSON.parse(campfireBytes);
  if(!campfire||typeof campfire!=='object'||Array.isArray(campfire))throw Error('Campfire JSON must be an object.');
  protectRegions=Array.isArray(campfire.protect)?campfire.protect:[campfire.protect];
  if(protectRegions.length<1||protectRegions.length>8)throw Error('protect must contain between 1 and 8 ellipses.');
  const validateRegion=(region,name)=>{
    if(!region||typeof region!=='object'||Array.isArray(region))throw Error(`Missing or invalid campfire region: ${name}`);
    for(const key of ['x','y','rx','ry']){
      const value=region[key];
      if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1||((key==='rx'||key==='ry')&&value===0))
        throw Error(`Invalid ${name}.${key}: coordinates must be in [0,1], radii in (0,1].`);
    }
  };
  validateRegion(campfire.fire,'fire');
  validateRegion(campfire.reflection,'reflection');
  protectRegions.forEach((region,i)=>validateRegion(region,`protect[${i}]`));
}
// Campfire support is compiled only when explicitly requested: the original
// coordinate shader and Hydra graph remain identical for non-campfire runs.
const number=n=>Number(n).toFixed(10);
const ellipse=(r,maxRadius=1)=>`vec4(${number(r.x)},${number(r.y)},${number(Math.min(r.rx,maxRadius))},${number(Math.min(r.ry,maxRadius))})`;
let effectiveShader=motionShader,glowShader=null;
if(campfire){
  const fire=ellipse(campfire.fire,.05),reflection=ellipse(campfire.reflection,.12);
  const exclusion=protectRegions.map((region,i)=>`
    vec4 protectArea${i}=${ellipse(region)};
    freeOfPeople=min(freeOfPeople,smoothstep(1.,1.3,length((view-protectArea${i}.xy)/protectArea${i}.zw)));`).join('');
  effectiveShader=motionShader.replace('  vec2 sampleView=view+d;',`
  vec4 fireArea=${fire};
  float freeOfPeople=1.;
  ${exclusion}
  d*=freeOfPeople;
  float fireDistance=length((view-fireArea.xy)/fireArea.zw);
  float flameMask=(1.-smoothstep(.5,1.,fireDistance))*freeOfPeople;
  float flameMotion=.60*sin(t*1.13)+.25*sin(t*.71+1.4)+.15*sin(t*1.73+.5);
  d.x+=flameMask*arc*min(fireArea.z*.07,.0014)*flameMotion;
  d.y+=flameMask*arc*min(fireArea.w*.09,.0014)*(.65*sin(t*.91+.4)+.35*sin(t*1.39));
  vec2 sampleView=view+d;`);
  glowShader=`
    vec2 view=vec2(mix(_st.x,1.-_st.x,screenFlipX),mix(_st.y,1.-_st.y,screenFlipY));
    vec4 fireArea=${fire}, reflectionArea=${reflection};
    float freeOfPeople=1.;
    ${exclusion}
    float f=length((view-fireArea.xy)/fireArea.zw);
    float r=length((view-reflectionArea.xy)/reflectionArea.zw);
    float flame=(1.-smoothstep(.35,1.,f))*exp(-f*f*2.);
    float reflection=(1.-smoothstep(.45,1.,r))*exp(-r*r*2.);
    float life=.70+.12*sin(time*1.13)+.10*sin(time*.71+1.4)+.08*sin(time*1.73+.5);
    float arrival=smoothstep(0.,12.,time)*(1.-smoothstep(135.,180.,time));
    float white=(.025*flame+.012*reflection)*life*arrival*freeOfPeople;
    return vec4(vec3(white),0.);
  `;
}
if(features.fps!==fps||!Array.isArray(features.frames)||features.frames.length<fullSeconds*fps)throw Error('Expected at least 180 seconds of 24 fps audio features.');
const audioHash=hash(audio);
if(features.wav_sha256&&features.wav_sha256!==audioHash)throw Error('WAV does not match the supplied feature analysis.');
const probe=JSON.parse((await promisify(execFile)('ffprobe',['-v','error','-show_entries','format=duration','-of','json',audioPath])).stdout);
if(Number(probe.format.duration)<fullSeconds-.03)throw Error('WAV is shorter than 180 seconds.');
// Exponential smoothing is evaluated from frame zero even for a preview, so
// a given frame has exactly the same audio controls in either render mode.
const smoothed=[];let state=[0,0,0];
const attack=1-Math.exp(-1/(fps*.55));
for(let i=0;i<fullSeconds*fps;i++){
  const row=features.frames[i];
  if(!Array.isArray(row)||row.length<4||row.slice(1,4).some(v=>!Number.isFinite(v)))throw Error(`Invalid feature frame ${i}`);
  state=state.map((v,k)=>v+attack*(Math.max(0,Math.min(1,row[k+1]))-v));
  smoothed.push([...state]);
}
await mkdir(out,{recursive:true});
try{await access(video);throw Error(`Refusing to overwrite ${video}`);}catch(e){if(e.code!=='ENOENT')throw e;}
const rr=createRequire(path.resolve('apps/render/package.json'));
const {chromium}=rr('playwright');
const hydraVersion=JSON.parse(await readFile(path.resolve('apps/render/node_modules/hydra-synth/package.json'),'utf8')).version;
const browser=await chromium.launch({headless:true,channel:'chrome'});
let encoder;const errors=[];const started=Date.now();
try{
  const page=await browser.newPage({viewport:{width:size,height:size}});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'||m.text().includes('Error during tick'))errors.push(m.text());});
  await page.setContent(`<canvas id="film" width="${size}" height="${size}"></canvas>`);
  await page.addScriptTag({path:rr.resolve('hydra-synth')});
  const setup=await page.evaluate(async({image64,shader,glowShader,size})=>{
    const canvas=document.getElementById('film');
    const im=new Image();im.src='data:image/png;base64,'+image64;await im.decode();
    if(im.naturalWidth!==im.naturalHeight)throw Error('The cover must be square.');
    window.engine=new Hydra({canvas,width:size,height:size,autoLoop:false,detectAudio:false,enableStreamCapture:false,precision:'highp'});
    s0.init({src:im,dynamic:false});
    const ref=document.createElement('canvas');ref.width=160;ref.height=160;
    const rctx=ref.getContext('2d',{willReadFrequently:true});rctx.drawImage(im,0,0,160,160);
    const reference=rctx.getImageData(0,0,160,160).data;
    const snapshot=()=>{rctx.clearRect(0,0,160,160);rctx.drawImage(canvas,0,0,160,160);return rctx.getImageData(0,0,160,160).data;};
    const tick=(t=0)=>{engine.synth.time=t-1/24;engine.tick(1000/24);};
    // Measure how Hydra's _st maps to the display; avoid assuming WebGL's Y.
    setFunction({name:'gujoraOrientationProbe',type:'src',inputs:[],glsl:'return vec4(_st.x,_st.y,0.,1.);'});
    gujoraOrientationProbe().out(o0);render(o0);tick();
    const grid=snapshot();
    const px=(x,y,c)=>grid[(y*160+x)*4+c];
    const screenFlipX=px(24,80,0)>px(136,80,0)?1:0;
    const screenFlipY=px(80,24,1)>px(80,136,1)?1:0;
    src(s0).out(o0);tick();
    const base=snapshot();
    const score=(sample,fx,fy)=>{
      let sum=0;for(let y=4;y<156;y++)for(let x=4;x<156;x++){
        const i=(y*160+x)*4,j=((fy?159-y:y)*160+(fx?159-x:x))*4;
        for(let c=0;c<3;c++)sum+=Math.abs(sample[i+c]-reference[j+c]);
      }return sum/(152*152*3);
    };
    const candidates=[];for(let fy=0;fy<=1;fy++)for(let fx=0;fx<=1;fx++)candidates.push({fx,fy,error:score(base,fx,fy)});
    candidates.sort((a,b)=>a.error-b.error);
    if(candidates[0].error>=candidates[1].error*.98)throw Error('Source orientation is ambiguous; inspect image alignment.');
    const sourceFlipX=candidates[0].fx,sourceFlipY=candidates[0].fy;
    window.controls={low:0,mid:0,high:0};
    setFunction({name:'gujoraCurrent',type:'coord',inputs:[
      {name:'low',type:'float',default:0},{name:'mid',type:'float',default:0},{name:'high',type:'float',default:0},
      {name:'screenFlipX',type:'float',default:0},{name:'screenFlipY',type:'float',default:0},
      {name:'sourceFlipX',type:'float',default:0},{name:'sourceFlipY',type:'float',default:0}],glsl:shader});
    src(s0).gujoraCurrent(()=>controls.low,()=>controls.mid,()=>controls.high,screenFlipX,screenFlipY,sourceFlipX,sourceFlipY).out(o0);
    tick();
    const corrected=snapshot(),correctedScores=[];
    for(let fy=0;fy<=1;fy++)for(let fx=0;fx<=1;fx++)correctedScores.push({fx,fy,error:score(corrected,fx,fy)});
    correctedScores.sort((a,b)=>a.error-b.error);
    if(correctedScores[0].fx||correctedScores[0].fy||correctedScores[0].error>=correctedScores[1].error*.98)
      throw Error('Rendered zero-motion image does not align with the cover.');
    if(glowShader){
      setFunction({name:'gujoraCampfireGlow',type:'src',inputs:[
        {name:'screenFlipX',type:'float',default:0},{name:'screenFlipY',type:'float',default:0}],glsl:glowShader});
      src(s0).gujoraCurrent(()=>controls.low,()=>controls.mid,()=>controls.high,screenFlipX,screenFlipY,sourceFlipX,sourceFlipY)
        .add(gujoraCampfireGlow(screenFlipX,screenFlipY),1).out(o0);
      // At t=0 the optional glow is zero; check after installing the full graph.
      tick();
      const campZero=snapshot(),zeroScores=[];
      for(let fy=0;fy<=1;fy++)for(let fx=0;fx<=1;fx++)zeroScores.push({fx,fy,error:score(campZero,fx,fy)});
      zeroScores.sort((a,b)=>a.error-b.error);
      if(zeroScores[0].fx||zeroScores[0].fy||zeroScores[0].error>=zeroScores[1].error*.98)
        throw Error('Campfire zero-motion image does not align with the cover.');
    }
    window.drawFrame=({t,values})=>{
      controls.low=values[0];controls.mid=values[1];controls.high=values[2];tick(t);
      return canvas.toDataURL('image/png').split(',')[1];
    };
    const gl=canvas.getContext('webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return {sourceWidth:im.naturalWidth,sourceHeight:im.naturalHeight,screenFlipX,screenFlipY,sourceFlipX,sourceFlipY,
      baseline:candidates,corrected:correctedScores,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown'};
  },{image64:source.toString('base64'),shader:effectiveShader,glowShader,size});
  if(errors.length)throw Error(errors.join('\n'));
  encoder=spawn('ffmpeg',['-v','error','-n','-f','image2pipe','-vcodec','png','-framerate',String(fps),'-i','pipe:0',
    '-ss',String(start),'-i',audioPath,'-t',String(seconds),'-map','0:v:0','-map','1:a:0',
    '-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k','-movflags','+faststart',video]);
  encoder.stderr.on('data',b=>process.stderr.write(b));
  let pipeError;encoder.stdin.on('error',e=>{pipeError=e;});
  const done=once(encoder,'close');
  const wanted=new Set(stills.map(t=>Math.round(t*fps)));
  let written=0;
  for(let i=0;i<count;i++){
    if(pipeError)throw pipeError;
    const frameIndex=start*fps+i,t=frameIndex/fps;
    const data=await page.evaluate(payload=>window.drawFrame(payload),{t,values:smoothed[frameIndex]});
    if(errors.length)throw Error(errors.join('\n'));
    const frame=Buffer.from(data,'base64');
    if(!encoder.stdin.write(frame))await once(encoder.stdin,'drain');
    if(wanted.has(frameIndex)){
      const label=String(Math.floor(t)).padStart(3,'0')+(Number.isInteger(t)?'':`-${String(frameIndex%fps).padStart(2,'0')}`);
      await writeFile(path.join(out,`${preview?'preview':'frame'}-${label}.png`),frame);
    }
    written++;
    if(i%720===0||i===count-1)console.log(`${preview?'preview':'film'} ${i+1}/${count} (${((Date.now()-started)/1000).toFixed(1)}s)`);
  }
  encoder.stdin.end();const [status]=await done;
  if(status!==0||written!==count)throw Error(`Incomplete render: encoder=${status}, frames=${written}/${count}`);
  const meta={title:'Gujora / Yundol',method:'Hydra source texture and regional coordinate motion; no temporal feedback',
    start,duration:seconds,fps,frames:written,width:size,height:size,stillTimes:stills,
    source:{cover:sourcePath,coverSha256:hash(source),audio:audioPath,audioSha256:audioHash,features:featurePath,featuresSha256:hash(featureBytes),
      implementationSha256:hash(ownSource),shaderSha256:hash(glowShader?effectiveShader+'\n'+glowShader:effectiveShader)},
    campfire:campfire?{path:campfirePath,sha256:hash(campfireBytes),parameters:campfire}:null,
    orientation:setup,hydraVersion,
    elapsedSeconds:(Date.now()-started)/1000,errors};
  await writeFile(path.join(out,preview?'preview-render.json':'render.json'),JSON.stringify(meta,null,2));
  await writeFile(path.join(out,preview?'preview-source.mjs':'source.mjs'),ownSource);
  console.log(`Completed ${video}`);
}finally{
  if(encoder&&encoder.exitCode===null)encoder.kill();
  await browser.close();
}
