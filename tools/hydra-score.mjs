import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root=process.cwd();
const ar=createRequire(`${root}/packages/audiovisual/package.json`);
const rr=createRequire(`${root}/apps/render/package.json`);
const {chromium}=rr('playwright');
const source=JSON.parse(await readFile('assets/scores/ave-maria/melody.json','utf8'));
const segments=[];let cursor=0;
for(const e of source.events){
  if(e.beat>cursor) segments.push(`~@${(e.beat-cursor)*16}`);
  segments.push(`${e.note-24}@${e.beats*16}`);cursor=e.beat+e.beats;
}
const expression=segments.join(' ');
const browser=await chromium.launch({headless:true,channel:'chrome'});
let events;
try{
  const page=await browser.newPage();
  await page.addScriptTag({path:ar.resolve('@strudel/web')});
  events=await page.evaluate(({expression,total})=>strudel.note(strudel.mini(expression)).queryArc(0,1)
    .filter(h=>h.hasOnset()).map(h=>({note:Number(h.value.note),t:15+Number(h.whole.begin)*total*3.36,
      duration:Number(h.duration)*total*3.36})),{expression,total:cursor});
}finally{await browser.close();}
if(events.length!==121)throw new Error(`Expected121 notes, got ${events.length}`);
const reference=JSON.parse(await readFile('runs/dp-sts-moonwater-ave-v01/render.json','utf8')).events;
let maxTimeError=0;
for(let i=0;i<events.length;i++){
  if(events[i].note!==reference[i].note)throw new Error(`Pitch mismatch ${i}`);
  maxTimeError=Math.max(maxTimeError,Math.abs(events[i].t-reference[i].t),Math.abs(events[i].duration-reference[i].duration));
}
if(maxTimeError>1e-8)throw new Error(`Timing mismatch ${maxTimeError}`);
await mkdir('compositions/moonwater-hydra',{recursive:true});
await writeFile('compositions/moonwater-hydra/strudel-score.json',JSON.stringify({expression,events,
  totalBeats:cursor,secondsPerBeat:3.36,maxTimeError,notesMatch:true,
  audio:'Existing Python-synthesized master retained; actual Strudel queried events exactly match its melody score',
  source:source.source},null,2));
console.log({notes:events.length,maxTimeError});
