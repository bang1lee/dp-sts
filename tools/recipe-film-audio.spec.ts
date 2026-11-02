import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav } from '@ambient-lab/audiovisual';
import { readPcm16Mono, makeRhythmPlan, mixSampledKit, measureFeatures } from '../apps/studio/src/recipe-film-audio';
const music={bpm:73.2085240142375,root:50,mood:'mysterious' as const,sparsity:.897198853656282,duration:89.4332732399575,gain:.216927059258574};

test('original PCM16 mono sample files decode their stored samples exactly',()=>{
  const wav=encodeWav([Float32Array.from([0,.5,-.5])],48000);
  const audio=readPcm16Mono(wav.buffer as ArrayBuffer);
  assert.deepEqual(Array.from(audio),[0,.5,-.5]);
  assert.throws(()=>readPcm16Mono(new ArrayBuffer(20)));
});

test('seeded rhythm plan keeps introduction quiet and includes varied fast subdivisions',()=>{
  const a=makeRhythmPlan(music,42), b=makeRhythmPlan(music,42);
  assert.deepEqual(a,b);
  assert.ok(a.every(p=>p.bar>=1));
  assert.ok(a.some(p=>p.bar===1 && p.sampleId==='kick'));
  assert.ok(a.some(p=>p.steps.some(step=>step.ratchet===2)));
  assert.ok(new Set(a.map(p=>p.section)).size>=4);
  assert.ok(a.some(p=>p.sampleId==='kick'));
  assert.ok(a.some(p=>p.sampleId==='snare'));
});

test('sampled onsets are mixed into stereo using event gain and preserve the pad gain',()=>{
  const pad=[Float32Array.from([.1,.1,.1,.1]),Float32Array.from([.1,.1,.1,.1])];
  const kit={kick:Float32Array.from([.4,.2]),snare:new Float32Array(),hat:new Float32Array(),rim:new Float32Array()};
  const events=[{timeSeconds:.25,sampleId:'kick' as const,gain:.5,pan:0,bar:0,step:0,section:'test'}];
  const {channels,attenuation}=mixSampledKit(pad,kit,events,4,.25);
  assert.equal(attenuation,1);
  assert.ok(Math.abs(channels[0][0]-.025)<1e-7);
  assert.ok(Math.abs(channels[0][1]-(.025+.4*.5/Math.SQRT2))<1e-7);
  assert.ok(Math.abs(channels[1][1]-channels[0][1])<1e-7);
});

test('feature onset responds to measured audio transients and silence stays silent',()=>{
  const samples=new Float32Array(16);samples.fill(.4,8,12);
  const features=measureFeatures([samples,samples],16,4);
  assert.equal(features.length,4);
  assert.equal(features[0].rms,0);
  assert.ok(features[2].rms>0);
  assert.ok(features[2].onset>0);
});

test('low-frequency energy remains measurable in an anti-phase stereo signal',()=>{
  const left=Float32Array.from({length:4800},(_,i)=>.2*Math.sin(2*Math.PI*80*i/48000));
  const right=Float32Array.from(left,x=>-x);
  const result=measureFeatures([left,right],48000,30);
  assert.ok(result.some(frame=>frame.low>.1));
});

test('mix attenuation limits overlapping full-level samples without clipping',()=>{
  const pad=[Float32Array.from([1,1,1,1]),Float32Array.from([1,1,1,1])];
  const kit={kick:Float32Array.from([1,1]),snare:new Float32Array(),hat:new Float32Array(),rim:new Float32Array()};
  const events=[{timeSeconds:0,sampleId:'kick' as const,gain:1,pan:0,bar:0,step:0,section:'test'}];
  const mixed=mixSampledKit(pad,kit,events,4,1);
  assert.ok(mixed.attenuation<1);
  assert.ok(mixed.peak<=.940001);
});
