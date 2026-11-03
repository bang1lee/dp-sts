import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const output = process.argv.find(a => a.startsWith('--out='))?.slice(6) || 'compositions/gujora-hihat/score.json';
const root = process.cwd();
const rr = createRequire(`${root}/apps/render/package.json`);
const ar = createRequire(`${root}/packages/audiovisual/package.json`);
const {chromium} = rr('playwright');
const browser = await chromium.launch({headless:true,channel:'chrome'});
let score;
try {
  const page = await browser.newPage();
  await page.addScriptTag({path:ar.resolve('@strudel/web')});
  score = await page.evaluate(() => {
    const hits=strudel.note(strudel.mini('0')).queryArc(0,30).filter(h=>h.hasOnset());
    if (hits.length!==30) throw new Error(`Expected 30 Strudel onsets, got ${hits.length}`);
    let state=20261103;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const events=hits.map((h,index)=>({track:'hat',beat:index,gridSeconds:Number(h.whole.begin),
      timeSeconds:Number((Number(h.whole.begin)+.25+(random()-.5)*.02).toFixed(6)),
      velocity:index%2===0?.26:.20}));
    return {duration:30,bpm:60,seed:20261103,pattern:'one hi-hat each 1 second',
      timing:'Strudel queryArc(0,30), one-second cycles with a 250ms offset and deterministic ±10ms variation',
      strudelExpression:'note(mini("0"))',events};
  });
} finally {await browser.close();}
score.generatorSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
await mkdir(dirname(resolve(output)),{recursive:true});
await writeFile(output,JSON.stringify(score,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,events:score.events.length,bpm:score.bpm}));
