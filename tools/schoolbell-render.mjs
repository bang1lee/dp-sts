import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),rr=createRequire(`${root}/apps/render/package.json`),ar=createRequire(`${root}/packages/audiovisual/package.json`);
const {chromium}=rr('playwright');
const score=JSON.parse(await readFile('compositions/schoolbell-ambient/score.json','utf8'));
const out='runs/schoolbell-ambient-v01'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>console.error('PAGE',e));
 await page.addScriptTag({path:ar.resolve('@strudel/web')});
 const info=await page.evaluate(async score=>{
  await strudel.initStrudel();
  const beat=60/score.bpm, bar=4*beat, events=[];
  for(let pass=0;pass<score.passes;pass++)for(let b=0;b<8;b++){
   const start=score.melodyStartSeconds+pass*8*bar+b*bar;
   for(const h of strudel.note(strudel.mini(score.melodyBars[b])).queryArc(0,1).filter(h=>h.hasOnset())){
    events.push({part:'melody',note:Number(h.value.note),time:start+Number(h.whole.begin)*bar,duration:Number(h.duration)*bar,pass,bar:b});
   }
   const chord=score.harmonyBars[b];
   for(const n of chord) events.push({part:'harmony',note:n,time:start-0.7,duration:bar+0.35,pass,bar:b});
  }
  const realtime=strudel.getAudioContext(); await realtime.close();
  const ctx=new OfflineAudioContext(2,score.durationSeconds*score.sampleRate,score.sampleRate);
  strudel.setAudioContext(ctx);strudel.setSuperdoughAudioController(null);
  await strudel.initAudio({maxPolyphony:1024});
  const orbit=strudel.getSuperdoughAudioController().getOrbit(0,[0,1]);
  const voices=[];orbit.connectToOutput=node=>voices.push(node);
  for(const e of events){
   const melody=e.part==='melody';
   // Fractional MIDI offsets provide small, stable beat frequencies without bright modulation.
   const layers=melody?[
    {s:'sine',offset:0,gain:.31,pan:.5},
    {s:'triangle',offset:-.035,gain:.135,pan:.46},
    {s:'sine',offset:.045,gain:.105,pan:.54},
    {s:'sine',offset:11.97,gain:.16,pan:.43},
    {s:'sine',offset:12.04,gain:.085,pan:.57},
    {s:'sine',offset:19.01,gain:.12,pan:.64},
    {s:'sine',offset:24.00,gain:.06,pan:.38}
   ]:[
    {s:'sine',offset:0,gain:.09,pan:.5},
    {s:'triangle',offset:.035,gain:.038,pan:e.note%2?.46:.54},
    {s:'sine',offset:12.03,gain:.050,pan:e.note%2?.43:.57},
    {s:'sine',offset:19.02,gain:.027,pan:e.note%2?.64:.36}
   ];
   for(const layer of layers){
    await strudel.superdough({note:e.note+layer.offset,s:layer.s,gain:layer.gain,pan:layer.pan,attack:melody?.24:1.7,decay:melody?.4:1.5,sustain:melody?.88:.78,release:melody?.7:2.5,lpf:melody?900:650,orbit:0},e.time,e.duration*(melody?.88:1),.2,e.time);
   }
  }
  // Stable summing tree avoids order-dependent hundreds-of-input graph summation.
  let nodes=voices;
  while(nodes.length>1){const next=[];for(let i=0;i<nodes.length;i+=2){if(i+1===nodes.length){next.push(nodes[i]);continue;}const g=ctx.createGain();nodes[i].connect(g);nodes[i+1].connect(g);next.push(g);}nodes=next;}
  const source=nodes[0];
  const dry=ctx.createGain();dry.gain.value=.90; source.connect(dry);
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1200;lp.Q.value=.55;dry.connect(lp);
  const master=ctx.createGain();lp.connect(master);
  // Diffuse tail is filtered away from bass, leaving the low-mid mostly central.
  const reverbIn=ctx.createBiquadFilter();reverbIn.type='highpass';reverbIn.frequency.value=370;source.connect(reverbIn);
  const convolution=ctx.createConvolver(), impulse=ctx.createBuffer(2,Math.round(3.7*score.sampleRate),score.sampleRate);
  let state=147319;
  for(let c=0;c<2;c++){const data=impulse.getChannelData(c);let smooth=0;for(let i=0;i<data.length;i++){
   state=(1664525*state+1013904223)>>>0;const noise=(state/4294967296)*2-1;
   smooth=.85*smooth+.15*noise;const t=i/score.sampleRate;
   data[i]=t<.035?0:smooth*Math.exp(-t*1.55);
  }}
  convolution.buffer=impulse;reverbIn.connect(convolution);
  const dark=ctx.createBiquadFilter();dark.type='lowpass';dark.frequency.value=1100;convolution.connect(dark);
  const wet=ctx.createGain();wet.gain.value=.24;dark.connect(wet);wet.connect(master);
  master.gain.setValueAtTime(0,0);master.gain.linearRampToValueAtTime(1,3);master.gain.setValueAtTime(1,84);master.gain.linearRampToValueAtTime(0,92);master.connect(ctx.destination);
  window.rendered=await ctx.startRendering();
  let peak=0;for(let c=0;c<2;c++)for(const x of window.rendered.getChannelData(c))peak=Math.max(peak,Math.abs(x));
  return {events,voices:voices.length,peak};
 },score);
 console.log('Rendered',info.events.length,'events',info.voices,'Strudel voices, pre-master peak',info.peak);
 if(info.peak<.00001)throw Error('Silent render');
 // Encode with measured normalization. WAV is 24-bit PCM after FFmpeg conversion.
 await writeFile(`${out}/scheduled-events.json`,JSON.stringify(info.events,null,2));
 const normal=.66/info.peak;
 const frameCount=score.durationSeconds*score.sampleRate, bytes=Buffer.alloc(frameCount*4*2);
 const block=48000*4;
 for(let start=0;start<frameCount;start+=block){
  const count=Math.min(block,frameCount-start);
  const chunk=await page.evaluate(({start,count,normal})=>{
   const a=window.rendered.getChannelData(0),b=window.rendered.getChannelData(1),v=new Float32Array(count*2);
   for(let i=0;i<count;i++){v[i*2]=a[start+i]*normal;v[i*2+1]=b[start+i]*normal;}
   const bytes=new Uint8Array(v.buffer);let text='';for(let j=0;j<bytes.length;j+=16384)text+=String.fromCharCode(...bytes.subarray(j,j+16384));return btoa(text);
  },{start,count,normal});
  Buffer.from(chunk,'base64').copy(bytes,start*8);
 }
 await writeFile(`${out}/schoolbell-render.f32le`,bytes);
 const wav=`${out}/schoolbell-ambient-v01.wav`,mp3=`${out}/schoolbell-ambient-v01.mp3`;
 const encode=(args)=>{const r=spawnSync('ffmpeg',['-y','-v','error',...args],{stdio:'inherit'});if(r.status!==0)throw Error(`ffmpeg exited ${r.status}`);};
 encode(['-f','f32le','-ar',String(score.sampleRate),'-ac','2','-i',`${out}/schoolbell-render.f32le`,'-c:a','pcm_s24le',wav]);
 encode(['-i',wav,'-c:a','libmp3lame','-b:a','320k',mp3]);
 const hash=createHash('sha256').update(await readFile(wav)).digest('hex');
 await writeFile(`${out}/render-manifest.json`,JSON.stringify({score,engine:'@strudel/web 1.3.0 + Superdough 1.3.0; Chromium OfflineAudioContext',eventCount:info.events.length,voiceCount:info.voices,preMasterPeak:info.peak,normalization:normal,wavSha256:hash,referenceAudioInOutput:false},null,2));
 console.log('WAV',wav,'SHA256',hash);
}finally{await browser.close();}
