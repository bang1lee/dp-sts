import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFlowerTimeline } from '../apps/studio/src/flower-geometry';
import { makeFlowerSoundEvents, mixFlowerFire, type FireSampleId } from '../apps/studio/src/flower-audio';
import { readPcm16Mono } from '../apps/studio/src/recipe-film-audio';

const ids:FireSampleId[]=['ember01','ember02','ember03','ember04','ember05','ember06'];
const manifest=JSON.parse(readFileSync('assets/fire-kit/manifest.json','utf8'));
const samples=Object.fromEntries(ids.map(id=>{
  const bytes=readFileSync(`assets/fire-kit/${id}.wav`);
  return [id,readPcm16Mono(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))];
})) as Record<FireSampleId,Float32Array>;

test('synthesized sample assets match the original manifest and hashes',()=>{
  assert.match(manifest.origin,/no field recording/);
  assert.equal(manifest.files.length,6);
  for(const file of manifest.files){
    const bytes=readFileSync(`assets/fire-kit/${file.file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
    assert.equal(samples[file.id as FireSampleId].length,file.frames);
    assert.ok(file.seed&&file.parameters.secondaryFragments.length>=2);
  }
});

test('the real timeline generates exactly one sound event per geometric crossing with unchanged coordinates and time',()=>{
  const timeline=createFlowerTimeline(),events=makeFlowerSoundEvents(timeline);
  assert.ok(events.length>0);
  assert.deepEqual(events.map(({time,x,y,pairs})=>({time,x,y,pairs})),timeline.events);
  assert.deepEqual(events,makeFlowerSoundEvents(timeline));
  for(const event of events){assert.ok(event.time>=0&&event.time<timeline.duration);assert.ok(ids.includes(event.sampleId));}
  assert.throws(()=>makeFlowerSoundEvents({duration:1,events:[{time:NaN,x:0,y:0,pairs:[[0,1]]}]}));
});

test('48 kHz stereo render is finite and stays within headroom under a dense collision',()=>{
  const original={time:.1,x:.5,y:0,pairs:[[0,1]] as [number,number][]};
  const timeline={duration:1,events:Array.from({length:64},(_,i)=>({...original,time:.1+Math.floor(i/16)*.0001}))};
  const events=makeFlowerSoundEvents(timeline),mix=mixFlowerFire(timeline.duration,events,samples);
  assert.equal(mix.channels.length,2);assert.equal(mix.channels[0].length,48000);
  let peak=0;for(const channel of mix.channels)for(const sample of channel){assert.ok(Number.isFinite(sample));peak=Math.max(peak,Math.abs(sample));}
  assert.ok(peak>0&&peak<=.800001);
  assert.ok(mix.channels[0].slice(0,4800).every(x=>x===0));
});
