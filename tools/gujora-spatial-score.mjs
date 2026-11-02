import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const melody = arg('melody', 'bwv846');
if (melody !== 'bwv846') throw new Error(`Unsupported melody: ${melody}`);
const output = arg('out', 'compositions/gujora-spatial/score.json');
const melodyPath = 'compositions/gujora-ambient/bwv846-first-four-bars.json';
const bytes = await readFile(melodyPath);
const original = JSON.parse(bytes.toString());
const hash = value => createHash('sha256').update(value).digest('hex');
const melodyHash = hash(bytes);
const generatorHash = hash(await readFile(fileURLToPath(import.meta.url)));
if (!original.verified || original.bars?.length !== 4 || original.bars.some(b => b.length !== 8 || b.some(n => !Number.isInteger(n)))) {
  throw new Error('Verified BWV 846 four-bar transcription is required');
}
if (hash(await readFile(original.sourceFile)) !== original.sourceSha256) throw new Error('Original score hash mismatch');
const root = process.cwd();
const rr = createRequire(`${root}/apps/render/package.json`);
const ar = createRequire(`${root}/packages/audiovisual/package.json`);
const {chromium} = rr('playwright');
const browser = await chromium.launch({headless:true, channel:'chrome'});
let score;
try {
  const page = await browser.newPage();
  await page.addScriptTag({path:ar.resolve('@strudel/web')});
  score = await page.evaluate(({original, melodyHash, generatorHash, melodyPath}) => {
    const duration=464, barSeconds=40, events=[], patterns=[];
    function query(track, expression, at, seconds, gain, pan=0) {
      patterns.push({track, expression, at, seconds});
      const hits=strudel.note(strudel.mini(expression)).queryArc(0,1).filter(h=>h.hasOnset());
      if (!hits.length) throw new Error(`Strudel returned no onset for ${expression}`);
      for (const hit of hits) {
        const when=at+Number(hit.whole.begin)*seconds;
        if (when>=duration) continue;
        events.push({track,note:Number(hit.value.note),t:when,
          duration:Math.min(Number(hit.duration)*seconds,duration-when),gain,pan});
      }
    }
    const chords=[[48,52,55,60],[48,50,53,57],[47,50,53,55],[48,52,55,60]];
    for (let bar=0;bar<12;bar++) {
      const melodyAt=10+bar*barSeconds, slot=bar%4;
      if (melodyAt>=duration) break;
      const motif=original.bars[slot];
      query('melody',[...motif,...motif].join(' '),melodyAt,barSeconds,.055,-.025);
      const padAt=bar===0 ? 0 : melodyAt;
      const padDuration=Math.min(bar===0 ? 50 : 40,duration-padAt);
      query('pad',`[${chords[slot].join(',')}]`,padAt,padDuration,.028,0);
      query('bass',String(chords[slot][0]-12),padAt,padDuration,.012,0);
    }
    events.sort((a,b)=>a.t-b.t||a.note-b.note);
    return {duration,sampleRate:48000,fps:24,melody:'bwv846',
      melodyStatus:'BWV 846 selected by user',
      melodyAttribution:'Johann Sebastian Bach, Prelude in C major BWV 846, opening four bars; sustained ambient interpretation.',
      melodySource:original.source,melodyEdition:original.edition,melodyLicense:original.license,
      melodyScorePath:melodyPath,melodyScoreSha256:melodyHash,
      originalScorePath:original.sourceFile,originalScoreSha256:original.sourceSha256,
      scoreGeneratorSha256:generatorHash,
      arrangement:{firstMelodySecond:10,secondsPerNote:2.5,secondsPerBar:40,secondsPerFourBars:160,
        notes:'Four source bars repeat; the lower notes are rearticulated. Sustained synth interpretation, no percussion or additional counter-melody.'},
      reference:{url:'https://open.spotify.com/track/7glKwbR1DyuIuE6XvZvJbQ',
        limitations:'Reference is used for measured aggregate structure, not copied recordings, verified instrument identities, or a claim of identical sound.'},
      method:'All pitched events queried through Strudel in a browser',patterns,events};
  },{original,melodyHash,generatorHash,melodyPath});
} finally {await browser.close();}
await mkdir(dirname(resolve(output)),{recursive:true});
await writeFile(output,JSON.stringify(score,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,events:score.events.length,melody:score.melody,duration:score.duration}));
