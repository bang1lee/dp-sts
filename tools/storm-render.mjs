import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {works,shader} from './storm-scenes.mjs';

const root=process.cwd(),rr=createRequire(`${root}/apps/render/package.json`);
const {chromium}=rr('playwright');
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const base=arg('out','runs/dp-sts-visual-storm-v01');
const only=Number(arg('only','0'));
const preview=process.argv.includes('--preview');
const previewTag=arg('preview-tag','preview');
const frames=preview?96:4320;
const begin=preview?72:0;
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 for(let wi=0;wi<works.length;wi++){
  if(only&&only!==wi+1)continue;
  const work=works[wi],out=`${base}/${work.id}`;
  await mkdir(out,{recursive:true});
  const features=JSON.parse(await readFile(`${out}/audio-features.json`,'utf8'));
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'||m.text().includes('Error during tick'))errors.push(m.text());});
  await page.setContent('<canvas id="film" width="1280" height="720"></canvas>');
  await page.addScriptTag({path:rr.resolve('hydra-synth')});
  const gpu=await page.evaluate(({code,seed,psy})=>{
   const canvas=document.getElementById('film');
   window.engine=new Hydra({canvas,width:1280,height:720,autoLoop:false,detectAudio:false,enableStreamCapture:false,precision:'highp'});
   window.controls={low:0,mid:0,high:0};
   setFunction({name:'organicStorm',type:'src',inputs:[
    {name:'seed',type:'float',default:seed},{name:'low',type:'float',default:0},
    {name:'mid',type:'float',default:0},{name:'high',type:'float',default:0}],glsl:code});
   organicStorm(seed,()=>controls.low,()=>controls.mid,()=>controls.high)
    .modulate(noise(2.8,.018),()=>.0015+.004*controls.low)
    .blend(src(o0).scale(psy?1.0012:1.0001),psy?.16:.24).out(o0);
   render(o0);
   window.drawFrame=({t,values})=>{
    controls.low=values[1];controls.mid=values[2];controls.high=values[3];
    engine.synth.time=t-1/24;engine.tick(1000/24);
    return canvas.toDataURL('image/jpeg',.96).split(',')[1];
   };
   const gl=canvas.getContext('webgl'),ext=gl.getExtension('WEBGL_debug_renderer_info');
   return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';
  },{code:shader(wi),seed:work.seed,psy:work.psy});
  const output=`${out}/${preview?previewTag+'-4s':'artwork'}.mp4`;
  const encoder=spawn('ffmpeg',['-v','error','-n','-f','image2pipe','-vcodec','mjpeg','-framerate','24','-i','pipe:0',
   '-ss',String(begin),'-i',`${out}/audio.wav`,'-t',String(frames/24),'-map','0:v:0','-map','1:a:0',
   '-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k','-movflags','+faststart',output]);
  encoder.stderr.on('data',x=>process.stderr.write(x));
  let pipeError;encoder.stdin.on('error',e=>{pipeError=e;});
  const done=once(encoder,'close');const stamp=Date.now();
  try{
   // Preview feedback starts eight seconds before the inspected moment.
   if(preview)for(let k=0;k<192;k++)await page.evaluate(x=>drawFrame(x),{t:64+k/24,values:features.frames[1536+k]});
   for(let i=0;i<frames;i++){
    if(pipeError)throw pipeError;
    const t=begin+i/24;
    const data=await page.evaluate(x=>drawFrame(x),{t,values:features.frames[Math.round(t*24)]});
    if(errors.length)throw Error(errors.join('\n'));
    const frame=Buffer.from(data,'base64');
    if(!encoder.stdin.write(frame))await once(encoder.stdin,'drain');
    if(i%720===0||i===frames-1){
     await writeFile(`${out}/${preview?previewTag:'frame'}-${String(Math.floor(t)).padStart(3,'0')}.jpg`,frame);
     console.log(`${work.id} ${i}/${frames} ${(Date.now()-stamp)/1000}s`);
    }
   }
   encoder.stdin.end();const [exit]=await done;if(exit!==0)throw Error(`Encoder ${exit}`);
  }finally{if(encoder.exitCode===null)encoder.kill();await page.close();}
  await writeFile(`${out}/${preview?previewTag+'-render':'render'}.json`,JSON.stringify({work,duration:frames/24,begin,frames,width:1280,height:720,fps:24,gpu,hydraVersion:'1.4.0',errors,sourceAudio:features.sourceAudio,audioSha256:features.wav_sha256,sourceHash:createHash('sha256').update(shader(wi)).digest('hex')},null,2));
  await writeFile(`${out}/shader.glsl`,shader(wi));
  console.log(`Completed ${output}`);
 }
 await copyFile('tools/storm-scenes.mjs',`${base}/storm-scenes.mjs`);
 await copyFile('tools/storm-render.mjs',`${base}/storm-render.mjs`);
}finally{await browser.close();}
