import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const melody = arg('melody', 'bwv846');
const output = arg('out', 'compositions/gujora-ambient/score.json');
if (melody !== 'bwv846') throw new Error(`Unsupported melody: ${melody}; provide a verified score before adding another`);
const scorePath = 'compositions/gujora-ambient/bwv846-first-four-bars.json';
const scoreBytes = await readFile(scorePath);
const original = JSON.parse(scoreBytes.toString());
const digest = createHash('sha256').update(scoreBytes).digest('hex');
const generatorDigest = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
if (!original.verified || !Array.isArray(original.bars) || original.bars.length !== 4 ||
    original.bars.some(b => !Array.isArray(b) || b.length !== 8 || b.some(n => !Number.isInteger(n) || n<0 || n>127))) {
  throw new Error('BWV 846 source must contain four independently verified bars of eight MIDI notes');
}
if (createHash('sha256').update(await readFile(original.sourceFile)).digest('hex') !== original.sourceSha256) {
  throw new Error('The original BWV 846 source no longer matches its recorded hash');
}
const root = process.cwd();
const rr = createRequire(`${root}/apps/render/package.json`);
const ar = createRequire(`${root}/packages/audiovisual/package.json`);
const {chromium} = rr('playwright');
const browser = await chromium.launch({headless: true, channel: 'chrome'});
let score;
try {
  const page = await browser.newPage();
  await page.addScriptTag({path: ar.resolve('@strudel/web')});
  score = await page.evaluate(({original, melody, digest, generatorDigest, scorePath}) => {
    const duration = 180, barSeconds = 8, events = [], patterns = [];
    const sections = [
      {name:'Sustained field', start:0, end:102}, {name:'Retreat', start:102, end:123},
      {name:'Brief return', start:123, end:129}, {name:'Retreat again', start:129, end:141},
      {name:'Restored field', start:141, end:165}, {name:'Final fade', start:165, end:180},
    ];
    function query(track, expression, at, seconds, gain, pan=0) {
      patterns.push({track, expression, at, seconds});
      const hits = strudel.note(strudel.mini(expression)).queryArc(0,1).filter(h => h.hasOnset());
      if (!hits.length) throw new Error(`Strudel returned no onset for ${expression}`);
      for (const hit of hits) {
        const when = at + Number(hit.whole.begin)*seconds;
        if (when >= duration) continue;
        events.push({track, note:Number(hit.value.note), t:when,
          duration:Math.min(Number(hit.duration)*seconds,duration-when), gain, pan});
      }
    }
    const padChords = [[48,52,55,59], [48,50,53,57], [47,50,53,55], [48,52,55,59]];
    for (let bar=0; bar<23; bar++) {
      const at = bar*barSeconds, slot=bar%4, seconds=Math.min(barSeconds,duration-at);
      if (seconds<=0) break;
      const motif = original.bars[slot];
      const expression = [...motif,...motif].join(' ');
      // Broad dynamic movement is applied to the final mix from the measured RMS curve.
      const energy = 1;
      query('melody', expression, at, barSeconds, .13*energy, -.06);
      const chord=padChords[slot];
      query('pad', `[${chord.join(',')}]`, at, Math.min(11,duration-at), .021*energy, 0);
      query('bass', String(chord[0]-12), at, Math.min(10,duration-at), .038*energy, 0);
      if (at>=104 && at<152 && slot===0) query('answer', String(67), at+4, 2.3, .025, .34);
    }
    events.sort((a,b) => a.t-b.t || a.note-b.note);
    return {duration, sampleRate:48000, fps:24, melody,
      melodyStatus:'BWV 846 selected by user',
      melodyAttribution:'Johann Sebastian Bach, Prelude in C major BWV 846, The Well-Tempered Clavier Book I; opening four bars repeated.',
      melodySource:original.source, melodyEdition:original.edition, melodyLicense:original.license,
      originalScorePath:original.sourceFile, originalScoreSha256:original.sourceSha256,
      melodyScorePath:scorePath, melodyScoreSha256:digest, scoreGeneratorSha256:generatorDigest,
      reference:{url:'https://aphextwin.bandcamp.com/track/3', verified:'track identity and numerical RMS envelope',
        limitations:'Numerical analysis of public playback only; no listening, instrument identification, transcription or audio samples from the reference.'},
      method:'All pitched events queried through Strudel in a browser',
      character:'Original interpretation with a recurring Bach arpeggio, warm detuned pads, muted bass and diffuse reverb; no drums or guitar.',
      sections, patterns, events};
  }, {original, melody, digest, generatorDigest, scorePath});
} finally { await browser.close(); }
await mkdir(dirname(resolve(output)), {recursive:true});
await writeFile(output, JSON.stringify(score, null, 2)+'\n', {flag:'wx'});
console.log(JSON.stringify({output, events:score.events.length, patterns:score.patterns.length, melody, duration:score.duration}));
