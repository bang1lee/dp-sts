import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=process.cwd(),rr=createRequire(`${root}/apps/render/package.json`),ar=createRequire(`${root}/packages/audiovisual/package.json`);
const {chromium}=rr('playwright');
const original=JSON.parse(await readFile('assets/scores/ave-maria/melody.json','utf8')).events;
const browser=await chromium.launch({headless:true,channel:'chrome'});let score;
try{
 const page=await browser.newPage();await page.addScriptTag({path:ar.resolve('@strudel/web')});
 score=await page.evaluate(original=>{
  const bpm=84,beat=60/bpm,barSeconds=4*beat,events=[],patterns=[];
  const sections=[['Seed',0,8,.4],['First light',8,40,.72],['Body and wood',40,72,.9],['Suspended water',72,96,.48],['Bloom',96,144,1],['Fragments',144,176,.7],['Home',176,200,.88],['Afterglow',200,210,.35]];
  function q(track,expression,at,seconds,gain,pan=0,variant=0){
   patterns.push({track,expression,at,seconds});
   for(const h of strudel.note(strudel.mini(expression)).queryArc(0,1).filter(h=>h.hasOnset())){
    const phase=Number(h.whole.begin),swing=['pluck','shaker','rim','answer'].includes(track)&&Math.round(phase*8)%2?.035:0;
    events.push({track,note:Number(h.value.note),t:at+phase*seconds+swing,duration:Number(h.duration)*seconds,gain,pan,variant});
   }
  }
  let cursor=16;const parts=[];
  for(const e of original){if(e.beat>cursor)parts.push(`~@${(e.beat-cursor)*16}`);parts.push(`${e.note-12}@${e.beats*16}`);cursor=e.beat+e.beats;}
  const full=parts.join(' '),span=(cursor-16)*beat;
  for(const [at,track,gain] of [[8,'theme',.20],[278,'reed',.14],[478,'theme',.19]])q(track,full,at,span,gain,track==='reed'?.08:-.12);
  const chords=[[53,57,60,64],[50,53,57,60],[46,53,57,62],[48,55,60,62],[55,58,62,65],[53,56,60,63],[52,55,58,62]];
  for(let bar=0;bar<210;bar++){
   const at=bar*barSeconds,sec=sections.find(s=>bar>=s[1]&&bar<s[2]),energy=sec[3];
   let chord=chords[[0,1,2,3][Math.floor(bar/2)%4]];
   const activeStart=[8,278,478].find(t=>at>=t&&at<t+span);
   if(activeStart!==undefined){
    const b=(at-activeStart)/beat+16;
    const notes=original.filter(e=>e.beat<b+4&&e.beat+e.beats>b);
    chord=chords.map(c=>({c,s:notes.reduce((n,e)=>n+(c.some(v=>v%12===e.note%12)?Math.min(4,e.beats):0),0)})).sort((a,b)=>b.s-a.s)[0].c;
   }
   const [r,third,fifth,ninth]=chord;
   if(bar%2===0)q('cloud',`[${r},${third},${fifth},${ninth}]`,at,barSeconds*2,.012*energy,bar%4?.5:-.5,bar%3);
   const intimate=bar<8||bar>=72&&bar<96||bar>=200;
   if(bar%4!==3||intimate){
    const figures=[`${r+12} ~ ${fifth+12} ${third+12} ~ ${ninth+12} ${fifth+12} ~`,`${r+12} ${third+12} ~ ${fifth+12} ~ ~ ${ninth+12} ~`,`${fifth+12} ~ ${third+12} ~ ${r+12} ~ ~ ${ninth+12}`];
    q('pluck',figures[bar%3],at,barSeconds,.070*energy,bar%2?.48:-.48,bar%5);
   }
   if(bar>=8&&!intimate){
    q('bass',bar%2?`${r-12} ~ ~ ${r} ~ ${fifth-12} ~ ${r-12}`:`${r-12} ~ ~ ~ ${fifth-12} ~ ${r} ~`,at,barSeconds,.11*energy);
    q('kick',bar%4===3?'29 ~ ~ ~ ~ ~ 29 ~':'29 ~ ~ 29 ~ ~ ~ 29',at,barSeconds,.36*energy);
    q('snare','~ 0 ~ 0',at,barSeconds,.075*energy,-.05,bar%3);
    q('shaker',bar%4===3?'0 ~ 0 ~ ~ 0 0 ~':'0 ~ 0 0 ~ 0 ~ 0',at,barSeconds,.035*energy,.42,bar%4);
    if(bar%4===2)q('rim','~ ~ ~ 0 ~ ~ 0 ~',at,barSeconds,.08*energy,-.55);
   }
   if(bar>=40&&bar%4===3)q('answer',`${fifth+12} ~ ${ninth+12} ${third+12}`,at,barSeconds,.075,.28,bar%3);
   if(bar%8===6)q('reverse',`${third+12}`,at,barSeconds*2,.055,-.5,bar%5);
   if(bar>=96&&bar<176&&bar%2===0)q('grain',`${r+24} ~ ${fifth+24} ~`,at,barSeconds,.042,bar%4?.7:-.7,bar%6);
   if(bar>=144&&bar<176&&bar%8<4)q('theme',`${r+12} ~ ${third+12} ~ ${fifth+12} ~ ${third+12} ~`,at,barSeconds,.11,-.12,2);
   if([8,40,96,176].includes(bar))q('bloom',String(r),at,barSeconds*3,.07,0);
  }
  return {duration:600,bpm,genre:'Downtempo Folktronica',method:'All composition events queried through actual Strudel',sections:sections.map(([name,a,b,energy])=>({name,start:a*barSeconds,end:b*barSeconds,energy})),events:events.sort((a,b)=>a.t-b.t),patterns};
 },original);
}finally{await browser.close();}
await mkdir('compositions/folktronica-bloom',{recursive:true});
await writeFile('compositions/folktronica-bloom/score.json',JSON.stringify(score,null,2));
await writeFile('compositions/folktronica-bloom/strudel-score.json',JSON.stringify({events:score.events.filter(e=>['theme','reed'].includes(e.track)),maxTimeError:null,method:score.method},null,2));
console.log({events:score.events.length,sections:score.sections.length,bpm:score.bpm});
