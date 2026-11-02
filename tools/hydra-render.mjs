import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';

const root=process.cwd(), rr=createRequire(`${root}/apps/render/package.json`);
const {chromium}=rr('playwright');
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')??fallback;
const start=Number(arg('start','0')),duration=Number(arg('duration','600'));
const pitchMin=Number(arg('pitch-min','36')),pitchSpan=Number(arg('pitch-span','21'));
const muted=process.argv.includes('--mute');
const out=arg('out','runs/dp-sts-hydra-v01');
if(start<0||duration<=0||start+duration>600)throw new Error('Invalid interval');
await mkdir(out,{recursive:false});
const audio=arg('audio','runs/dp-sts-moonwater-ave-v01/dp-sts-moonwater-ave-master.wav');
const video=arg('video','runs/dp-sts-moonwater-ave-v01/dp-sts-moonwater-ave-master.mp4');
const features=JSON.parse(await readFile(arg('features','compositions/moonwater-hydra/audio-features.json'),'utf8'));
const score=JSON.parse(await readFile(arg('score','compositions/moonwater-hydra/strudel-score.json'),'utf8'));
const warmup=Math.min(8,start),from=start-warmup,frameCount=Math.round((duration+warmup)*24);
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});
const errors=[];
let decoder,encoder;
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'||m.text().includes('Error during tick'))errors.push(m.text());});
  await page.setContent('<canvas id="film" width="1280" height="720"></canvas>');
  await page.addScriptTag({path:rr.resolve('hydra-synth')});
  const gpu=await page.evaluate(()=>{
    const canvas=document.getElementById('film');
    window.engine=new Hydra({canvas,width:1280,height:720,autoLoop:false,detectAudio:false,enableStreamCapture:false,precision:'highp'});
    window.inputCanvas=document.createElement('canvas');inputCanvas.width=1280;inputCanvas.height=720;
    window.inputContext=inputCanvas.getContext('2d');
    s0.init({src:inputCanvas});
    window.control={rms:0,low:0,melody:0,upper:0,pitch:0,phrase:0,split:0,settle:0};
    // Actual Hydra feedback: previous output texture is fed through transforms.
    src(s0)
      .modulate(noise(2.2,.028),()=>.0015+.009*control.low*(1-.7*control.settle))
      .blend(src(o0)
        .scale(()=>1.0003+.0015*control.melody*(1-.8*control.settle))
        .rotate(()=>.00015*control.pitch*control.split)
        .modulate(noise(3.1,.018),()=>.0003+.002*control.upper),
        ()=>.65+.22*control.melody*(1-.7*control.settle))
      .add(src(s0)
        .scale(()=>1.025+.04*control.pitch)
        .scrollX(()=>.012*control.split)
        .color(.65,.75,.85),()=>.13*control.split*control.phrase)
      .out(o0);
    render(o0);
    window.drawFrame=async function(payload){
      const im=new Image();im.src='data:image/jpeg;base64,'+payload.jpeg;await im.decode();
      inputContext.drawImage(im,0,0);
      Object.assign(control,payload.control);
      engine.synth.time=payload.t-1/24;engine.tick(1000/24);
      return canvas.toDataURL('image/jpeg',.94).split(',')[1];
    };
    const gl=canvas.getContext('webgl');const ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',hydra:typeof Hydra};
  });
  decoder=spawn('ffmpeg',['-v','error','-ss',String(from),'-i',video,'-t',String(duration+warmup),'-an',
    '-vf','fps=24','-c:v','mjpeg','-q:v','2','-f','image2pipe','pipe:1']);
  encoder=spawn('ffmpeg',['-v','error','-f','image2pipe','-vcodec','mjpeg','-framerate','24','-i','pipe:0',
    '-ss',String(start),'-i',audio,'-t',String(duration),'-map','0:v:0','-map','1:a:0',
    '-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k',
    '-movflags','+faststart',`${out}/dp-sts-hydra.mp4`]);
  decoder.stderr.on('data',x=>process.stderr.write(x));encoder.stderr.on('data',x=>process.stderr.write(x));
  const decDone=once(decoder,'close'),encDone=once(encoder,'close');
  let buffer=Buffer.alloc(0),i=0,written=0;const stamp=Date.now();const telemetry=[];
  for await(const chunk of decoder.stdout){
    buffer=Buffer.concat([buffer,chunk]);let end;
    while((end=buffer.indexOf(Buffer.from([0xff,0xd9])))!==-1){
      const jpeg=buffer.subarray(0,end+2);buffer=buffer.subarray(end+2);
      const t=from+i/24,index=Math.min(14399,Math.round(t*24));
      const [rms,low,melody,upper]=muted?[0,0,0,0]:features.frames[index];
      const note=score.events.find(e=>e.t<=t&&t<e.t+e.duration);
      const ss=(a,b,x)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u);};
      const control={rms,low,melody,upper,pitch:muted||!note?0:Math.max(0,Math.min(1,(note.note-pitchMin)/pitchSpan)),
        phrase:muted||!note?0:Math.sin(Math.PI*(t-note.t)/note.duration),
        split:ss(190,325,t)*(1-ss(355,510,t)),settle:ss(470,560,t)};
      const data=await page.evaluate(payload=>window.drawFrame(payload),{jpeg:jpeg.toString('base64'),control,t});
      if(i>=Math.round(warmup*24)){
        const frame=Buffer.from(data,'base64');
        if(!encoder.stdin.write(frame))await once(encoder.stdin,'drain');
        if(written%720===0||written===Math.round(duration*24)-1){
          await writeFile(`${out}/frame-${String(Math.round(t)).padStart(3,'0')}.jpg`,frame);
          telemetry.push({frame:written,t,control});
          console.log(`${written}/${duration*24}; ${((Date.now()-stamp)/1000).toFixed(1)}s elapsed`);
        }
        written++;
      }
      i++;
      if(errors.length)throw new Error(errors.join('\n'));
    }
  }
  encoder.stdin.end();
  const [dc]=await decDone,[ec]=await encDone;
  if(dc!==0||ec!==0||i!==frameCount||written!==duration*24)throw new Error(`Incomplete render ${dc}/${ec} ${i}/${frameCount}`);
  await writeFile(`${out}/render.json`,JSON.stringify({start,duration,fps:24,frames:written,warmup,muted,gpu,
    hydraVersion:JSON.parse(await readFile('apps/render/node_modules/hydra-synth/package.json','utf8')).version,
    sourceVideo:video,sourceAudio:audio,wavSha256:features.wav_sha256,
    strudelNotes:score.events.length,strudelTimingError:score.maxTimeError,
    method:'Actual hydra-synth, fixed tick per frame, continuous output feedback. Offline WAV analysis; microphone disabled.',
    sourceHash:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),errors,telemetry},null,2));
  await writeFile(`${out}/source.mjs`,await readFile(new URL(import.meta.url)));
  console.log(`${out}/dp-sts-hydra.mp4`);
}finally{
  if(decoder&&decoder.exitCode===null)decoder.kill();
  if(encoder&&encoder.exitCode===null)encoder.kill();
  await browser.close();
}
