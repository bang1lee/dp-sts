import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const root = process.cwd();
const audioRequire = createRequire(`${root}/packages/audiovisual/package.json`);
const renderRequire = createRequire(`${root}/apps/render/package.json`);
const { chromium } = renderRequire('playwright');
const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'})});
try {
  const page = await browser.newPage();
  await page.addScriptTag({path:audioRequire.resolve('@strudel/web')});
  const score = await page.evaluate(() => {
    const bpm=144, beat=60/bpm, barSeconds=beat*4;
    const boundaries=[0,16,48,80,112,144,176,208,240,272,304,336,360];
    const names=['Threshold','Ignition','Lattice','Bloom','Mutation','Suspension','First Contact','Helix Drive','Ascension','Event Horizon','Transfiguration','Dissolution'];
    const energies=[.2,.55,.68,.78,.82,.35,.95,.85,.4,1,1,.45];
    const sections=names.map((name,i)=>({id:i,name,startBar:boundaries[i],endBar:boundaries[i+1],start:boundaries[i]*barSeconds,end:boundaries[i+1]*barSeconds,energy:energies[i]}));
    const events=[],patterns={};
    function query(track,expression,bar,options={}) {
      patterns[`${track}:${expression}`]={track,expression};
      const pattern=strudel.note(strudel.mini(expression));
      for(const hap of pattern.queryArc(0,1).filter(h=>h.hasOnset())){
        const phase=Number(hap.whole.begin), duration=Number(hap.duration)*barSeconds;
        events.push({track,bar,t:(bar+phase)*barSeconds,duration,note:Number(hap.value.note),...options});
      }
    }
    const rootProgress=[30,30,26,28,30,33,26,28];
    const motifA=['66 69 ~ 73 ~ 69 76 73','66 ~ 78 76 73 ~ 69 73','69 73 76 ~ 78 76 73 ~','66 ~ 64 66 ~ 69 73 69'];
    const motifB=['78 ~ 76 73 71 73 ~ 69','66 69 71 73 ~ 76 73 69','73 ~ 81 78 ~ 76 73 71','69 66 ~ 64 66 ~ 73 ~'];
    for(let bar=0;bar<360;bar++){
      const section=sections.find(s=>bar>=s.startBar&&bar<s.endBar), local=bar-section.startBar;
      const breakA=bar>=144&&bar<176, breakB=bar>=240&&bar<272, tail=bar>=352;
      let groove=bar>=16&&!breakA&&!breakB&&!tail;
      const rootNote=rootProgress[Math.floor(bar/8)%8];
      const fill=(bar+1)%8===0, majorFill=(bar+1)%16===0;
      if(groove){
        query('kick',majorFill?'0 0 0 ~':'0*4',bar,{velocity:.93});
        query('bass',`[~ ${rootNote} ${rootNote} ${rootNote}]*${majorFill?'3':'4'}`,bar,{velocity:.72,variant:Math.floor(bar/4)%12});
        if(majorFill) events.splice(events.length-9,9,...events.slice(-9).map(e=>({...e,t:bar*barSeconds+(e.t-bar*barSeconds)*.75})));
      } else if(bar>=8&&bar<16) query('kick','0 ~ ~ ~',bar,{velocity:.65});
      if((groove&&bar>=24)||(breakA&&local>=16&&local<28)||(breakB&&local>=16)){
        query('hat','~ 0 ~ 0 ~ 0 ~ 0',bar,{velocity:.23+(bar%4)*.018,pan:.18});
        if(bar>=48)query('tick','[0 ~ 0 0]*4',bar,{velocity:.115,pan:-.35,variant:bar%5});
        if(bar>=40)query('clap','~ 0 ~ 0',bar,{velocity:.26,pan:-.08});
        if(bar>=80&&!majorFill)query('openhat','~ ~ ~ 0 ~ ~ ~ 0',bar,{velocity:.2,pan:.3});
        if(bar>=112&&bar%4<3)query('perc','~ 0 ~ ~ 0 ~ 0 ~',bar,{velocity:.22,pan:(bar%2?.55:-.55),variant:bar%8});
      }
      if(groove&&bar>=48){
        const notes=[rootNote+24,rootNote+31,rootNote+36,rootNote+27];
        const expr=bar%2?`~ ${notes[0]} ~ ${notes[1]} ${notes[2]} ~ ${notes[1]} ${notes[3]}`:`${notes[0]} ~ ${notes[2]} ~ ${notes[1]} ${notes[3]} ~ ${notes[1]}`;
        query('acid',expr,bar,{velocity:bar>=272?.24:.18,variant:Math.floor((bar%16)/2)+(section.id%3)*4,pan:-.15});
      }
      const melodic=bar>=80&&bar<112||bar>=176&&bar<224||bar>=272&&bar<336;
      if(melodic&&local%16<12){
        const motif=(bar>=208?motifB:motifA)[Math.floor(bar/2)%4];
        query('lead',motif,bar,{velocity:bar>=304?.19:.16,variant:Math.floor(bar/8)%6,pan:.16});
      }
      if(bar%8===0){
        const chord=rootNote+24;
        events.push({track:'pad',bar,t:bar*barSeconds,duration:Math.min(8,360-bar)*barSeconds,note:chord,velocity:groove?.085:.17,variant:Math.floor(bar/8)%4,pan:0});
      }
      if((breakA||breakB)&&local<24&&bar%2===0)query('bell',`${rootNote+48} ~ ${rootNote+55} ~`,bar,{velocity:.16,variant:bar%4,pan:bar%4?-.5:.5});
      if((breakA&&local>=16&&local<28)||(breakB&&local>=16)){
        const steps=local>=28?32:local>=24?16:local>=20?8:4;
        query('snare',`0*${steps}`,bar,{velocity:.12+.19*(local-16)/16,variant:Math.min(15,local-16),pan:0});
      }
      if(fill&&groove){
        query('tom',majorFill?'~ ~ ~ [42 45 49 54]':'~ ~ ~ [45 ~ 49 ~]',bar,{velocity:.32,pan:-.25,variant:bar%3});
        if(majorFill) query('snare','~ ~ ~ [0 0 0 0]',bar,{velocity:.24,variant:5,pan:.25});
      }
      if(sections.some(s=>s.startBar===bar)&&bar>0){
        events.push({track:'impact',bar,t:bar*barSeconds,duration:4,note:30,velocity:.6,variant:section.id,pan:0});
      }
      if([40,72,104,136,168,200,232,264,296,328].includes(bar))events.push({track:'riser',bar,t:bar*barSeconds,duration:8*barSeconds,note:54,velocity:.18,variant:bar%3,pan:0});
      if(bar%16===12&&groove)events.push({track:'fm',bar,t:bar*barSeconds,duration:barSeconds*2,note:rootNote+36,velocity:.12,variant:bar%7,pan:bar%32?.6:-.6});
    }
    events.sort((a,b)=>a.t-b.t);
    return{title:'dp-sts',version:2,bpm,key:'F# minor',bars:360,duration:600,sampleRate:48000,seed:81273,strudel:{version:'@strudel/web 1.3.0',method:'Real mini notation patterns queried with note(mini(expression)).queryArc(0,1); each cycle is one bar.',patterns:Object.values(patterns)},sections,transitions:[{kind:'half-beat-vacuum',start:272*barSeconds-beat*.5,end:272*barSeconds,fadeSeconds:.012,description:'A brief held breath immediately before Event Horizon; the complete mix opens back at the drop.'}],events};
  });
  await mkdir(`${root}/compositions/psytrance`,{recursive:true});
  await writeFile(`${root}/compositions/psytrance/score.json`,JSON.stringify(score,null,2)+'\n');
  console.log(JSON.stringify({events:score.events.length,sections:score.sections.length,duration:score.duration,strudelPatterns:score.strudel.patterns.length}));
}finally{await browser.close();}
