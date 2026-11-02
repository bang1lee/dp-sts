import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const root=process.cwd(),rr=createRequire(`${root}/apps/render/package.json`),ar=createRequire(`${root}/packages/audiovisual/package.json`);
const {chromium}=rr('playwright');
const original=JSON.parse(await readFile('assets/scores/ave-maria/melody.json','utf8')).events;
const folk=process.argv.includes('--folktronica');
const folder=folk?'compositions/vapor-folktronica':'compositions/vapor-orchestra';
const browser=await chromium.launch({headless:true,channel:'chrome'});
let score;
try{
 const page=await browser.newPage();await page.addScriptTag({path:ar.resolve('@strudel/web')});
 score=await page.evaluate(({original,folk})=>{
  const beat=60/72,events=[],patterns=[];
  function query(track,expression,start,cycle,gain,pan=0){
   const pattern=strudel.note(strudel.mini(expression));patterns.push({track,expression,start,cycle});
   for(const h of pattern.queryArc(0,1).filter(h=>h.hasOnset())){
    const phase=Number(h.whole.begin);
    const swing=folk&&['guitarpick','brush','air'].includes(track)&&Math.round(phase*8)%2===1?.045:0;
    events.push({track,note:Number(h.value.note),t:start+phase*cycle+swing,duration:Number(h.duration)*cycle,gain,pan});
   }
  }
  let cursor=16;const parts=[];
  for(const e of original){if(e.beat>cursor)parts.push(`~@${(e.beat-cursor)*16}`);parts.push(`${e.note-12}@${e.beats*16}`);cursor=e.beat+e.beats;}
  const melody=parts.join(' '),span=(cursor-16)*beat;
  const candidates=[[53,57,60],[55,58,62],[57,60,64],[58,62,65],[60,64,67],[62,65,69],[64,67,70],[53,56,60],[59,62,65],[60,64,67,70]];
  for(let pass=0;pass<4;pass++){
   const start=[20,165,310,455][pass];
   query(folk?(pass%2?'woodwind':'guitar'):(pass%2?'strings':'woodwind'),melody,start,span,folk?.10:(pass===2?.085:.072),pass%2?-.18:.16);
   if(pass===2)query('strings',melody,start,span,folk?.012:.026,-.32);
   for(let bar=0;bar<Math.ceil((cursor-16)/4);bar++){
    const at=start+bar*4*beat;if(at>580)continue;
    const played=original.filter(e=>e.beat<20+bar*4&&e.beat+e.beats>16+bar*4);
    const scored=candidates.map((c,j)=>({c,score:played.reduce((s,e)=>s+(c.some(n=>n%12===e.note%12)?e.beats:0),0)+.05*(j===0)}));
    scored.sort((a,b)=>b.score-a.score);const chord=scored[0].c;
    // Original reharmonization, not a claimed transcription of Bach's accompaniment.
    query('pad',`[${chord.join(',')}]`,at,4*beat,folk?.006:.013,pass%2?.4:-.4);
    query('bass',`${chord[0]-24} ~ ${chord[0]-12} ~`,at,4*beat,.038);
    if(folk||pass>0||bar>12)query(folk?'guitarpick':'harp',`${chord[0]+12} ~ ${chord[1]+12} ${chord[2]+12} ~ ${chord[1]+12} ~ ~`,at,4*beat,folk?.036:.023,bar%2?.55:-.55);
    if(!folk&&pass===2&&bar%4===0)query('brass',`[${chord.join(',')}]`,at,8*beat,.010);
    if(bar%4!==3)query('pulse',folk?'29 ~ ~ ~ ~ 29 ~ ~':'29 ~ 29 ~',at,4*beat,folk?.055:.038);
    if(folk&&bar%4!==3)query('brush','~ ~ 0 ~',at,4*beat,.028,-.25);
    if(pass>0&&bar%2===0)query('air',folk?'~ 0 ~ 0 ~ ~ 0 ~':'0 ~ ~ 0 ~ ~ ~ ~',at,4*beat,folk?.014:.008,.5);
   }
  }
  for(const at of [0,140,285,430,575])query('pad','[53,57,60]',at,Math.min(25,600-at),.010,-.2);
  events.sort((a,b)=>a.t-b.t);
  return {duration:600,bpm:72,genre:folk?'Downtempo Folktronica':'Electronic chamber orchestra',method:'Actual Strudel note(mini).queryArc generates every arrangement event',
   melodyTransposition:-12,originalMelodyNotes:121,passes:4,events,patterns,
   sections:[{start:0,end:165,name:'Opening cloud'},{start:165,end:310,name:'Micro currents'},
    {start:310,end:455,name:'Electronic orchestra'},{start:455,end:600,name:'Return and condensation'}]};
 },{original,folk});
}finally{await browser.close();}
await mkdir(folder,{recursive:true});
const first=score.events.filter(e=>e.track===(folk?'guitar':'woodwind')&&e.t<165);
if(first.length!==original.length)throw new Error('Melody count changed');
let maxTimeError=0;
for(let i=0;i<first.length;i++){
 if(first[i].note!==original[i].note-12)throw new Error(`Melody pitch changed at ${i}`);
 maxTimeError=Math.max(maxTimeError,Math.abs(first[i].t-(20+(original[i].beat-16)*60/72)),Math.abs(first[i].duration-original[i].beats*60/72));
}
if(maxTimeError>1e-8)throw new Error('Melody timing changed');
await writeFile(`${folder}/score.json`,JSON.stringify(score,null,2));
await writeFile(`${folder}/strudel-score.json`,JSON.stringify({events:score.events.filter(e=>['woodwind','strings','guitar'].includes(e.track)),maxTimeError,method:score.method},null,2));
console.log({events:score.events.length,bpm:score.bpm});
