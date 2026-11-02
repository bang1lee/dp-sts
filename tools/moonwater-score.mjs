import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const root = process.cwd();
const audioRequire = createRequire(`${root}/packages/audiovisual/package.json`);
const renderRequire = createRequire(`${root}/apps/render/package.json`);
const { chromium } = renderRequire('playwright');
const browser = await chromium.launch({headless:true, channel:'chrome'});
try {
  const page = await browser.newPage();
  await page.addScriptTag({path:audioRequire.resolve('@strudel/web')});
  const score = await page.evaluate(() => {
    const events = [], patterns = [];
    function query(track, expression, start, cycle, duration, velocity, pan=0) {
      patterns.push({track,expression,start,cycle});
      for (const h of strudel.note(strudel.mini(expression)).queryArc(0,1).filter(h=>h.hasOnset())) {
        events.push({track,note:Number(h.value.note),t:start+Number(h.whole.begin)*cycle,duration,velocity,pan});
      }
    }
    for(let bar=4;bar<116;bar++) {
      if (bar % 8 !== 7) query('pulse','38 ~ 38 ~',bar*5,5,1.3,.055);
    }
    // Open fifths and suspended colours overlap by twenty seconds.
    const roots=[38,38,45,41,38,43,45,41,43,45,38,38,38,38,38];
    roots.forEach((root,i)=>query('tide',`[${root},${root+7},${root+14}]`,i*40,40,70,.025));
    for(let i=0;i<37;i++) {
      const notes=i<10?[74,81]:i<25?[74,77,81,84]:[74,81];
      query('glint',String(notes[i%notes.length]),25+i*15.2,15.2,15,.012,i%2?.45:-.45);
    }
    return {title:'dp-sts — moonwater',duration:600,bpm:48,seed:20261102,
      method:'Actual Strudel note(mini(expression)).queryArc; Python offline timbres',
      sections:[{start:0,end:90,name:'Immersion'},{start:90,end:210,name:'Moon encounter'},
        {start:210,end:360,name:'Refraction'},{start:360,end:480,name:'Connection'},
        {start:480,end:600,name:'One surface'}],patterns,events:events.sort((a,b)=>a.t-b.t)};
  });
  await mkdir(`${root}/compositions/moonwater`,{recursive:true});
  await writeFile(`${root}/compositions/moonwater/score.json`,JSON.stringify(score,null,2)+'\n');
  console.log({events:score.events.length,duration:score.duration});
} finally { await browser.close(); }
