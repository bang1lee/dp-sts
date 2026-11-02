import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMusicDocument, pitchToMidi } from '../apps/studio/src/music-document';

const settings = {bpm:60,root:48,mood:'moonlit' as const,sparsity:.5,duration:30,gain:.4};
const source = {notes:'[c3,e3]',cps:.25,slow:4,seed:42};
const scheduled = [
  {startSeconds:0,durationSeconds:4,source:{note:'c3',s:'sine',gain:.15,pan:.3,attack:1.5,release:3.8,lpf:1100}},
  {startSeconds:4,durationSeconds:2,source:{note:52,s:'triangle',gain:.036,pan:.7,attack:1.8,release:3.8,lpf:660}},
];

test('exports the exact scheduled onsets and durations without inventing velocity',()=>{
  const doc=createMusicDocument(settings,source,scheduled);
  assert.equal(doc.version,1);
  assert.equal(doc.timeUnit,'seconds');
  assert.equal(doc.durationSeconds,30);
  assert.equal(doc.tempo.bpm,60);
  assert.deepEqual(doc.notes.map(n=>[n.pitchMidi,n.startSeconds,n.durationSeconds,n.velocity,n.sourceGain]),[[48,0,4,null,.15],[52,4,2,null,.036]]);
  assert.deepEqual(doc.notes.map(n=>n.trackId),['sine','triangle']);
  assert.equal(doc.masterGain,.4);
  assert.equal(doc.generator.sourceNotes,'[c3,e3]');
});

test('pitch conversion accepts standard sharps, flats and numeric MIDI without guessing invalid names',()=>{
  assert.equal(pitchToMidi('c#3'),49);
  assert.equal(pitchToMidi('Db3'),49);
  assert.equal(pitchToMidi(48),48);
  assert.throws(()=>pitchToMidi('not-a-note'));
});

test('document does not retain mutable references to source data',()=>{
  const a=createMusicDocument(settings,source,scheduled);
  a.notes[0].startSeconds=12;
  assert.equal(createMusicDocument(settings,source,scheduled).notes[0].startSeconds,0);
  assert.equal(scheduled[0].startSeconds,0);
});

test('groups repeated unrecognized source sounds into one stable track',()=>{
  const notes=[
    {startSeconds:0,durationSeconds:1,source:{note:'c3',s:'custom'}},
    {startSeconds:1,durationSeconds:1,source:{note:'d3',s:'custom'}},
  ];
  const doc=createMusicDocument(settings,source,notes);
  assert.equal(doc.tracks.length,1);
  assert.equal(doc.notes[0].trackId,doc.notes[1].trackId);
});
