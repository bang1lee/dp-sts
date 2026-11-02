import type { ScheduledAudioEvent } from '@ambient-lab/audiovisual/offline';
import type { MusicConfig } from './workbench-engine';

export interface MusicDocument {
  schema: 'ambient-lab.music-document';
  version: 1;
  timeUnit: 'seconds';
  pitchUnit: 'midi';
  durationSeconds: number;
  tempo: { bpm: number; beatsPerCycle: 4; cyclesPerSecond: number };
  seed: number;
  masterGain: number;
  sections: Array<{ id: string; startSeconds: number; endSeconds: number }>;
  tracks: Array<{ id: string; sourceSound: string }>;
  notes: Array<{
    id: string;
    trackId: string;
    pitchMidi: number;
    startSeconds: number;
    durationSeconds: number;
    velocity: null;
    sourceGain: number | null;
    sourceParameters: Record<string, string | number | boolean | null>;
  }>;
  generator: { name: 'Strudel'; version: '1.3.0'; sourceNotes: string; slow: number; mood: MusicConfig['mood']; rootMidi: number; sparsity: number };
  limitations: string[];
}

export function pitchToMidi(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 127) return value;
  if (typeof value !== 'string') throw new Error('Unsupported scheduled pitch');
  if (/^\d+(?:\.\d+)?$/.test(value)) return pitchToMidi(Number(value));
  const match = /^([a-g])([#bsf]*)(-?\d+)$/i.exec(value.trim());
  if (!match) throw new Error(`Unsupported scheduled pitch: ${value}`);
  const semitone:Record<string,number>={c:0,d:2,e:4,f:5,g:7,a:9,b:11};
  let accidental=0;
  for (const symbol of match[2].toLowerCase()) accidental += symbol==='#'||symbol==='s'?1:-1;
  return pitchToMidi((Number(match[3])+1)*12+semitone[match[1].toLowerCase()]+accidental);
}

export function createMusicDocument(
  settings: MusicConfig,
  source: { notes: string; cps: number; slow: number; seed: number },
  scheduled: ReadonlyArray<ScheduledAudioEvent>,
): MusicDocument {
  const names=new Map<string,string>();
  const idsBySound=new Map<string,string>();
  const notes=scheduled.map((event,index)=>{
    if (!Number.isFinite(event.startSeconds)||event.startSeconds<0||!Number.isFinite(event.durationSeconds)||event.durationSeconds<=0)
      throw new Error('Invalid scheduled note timing');
    const sound=typeof event.source['s']==='string'?event.source['s']:'unknown';
    let trackId=idsBySound.get(sound);
    if (!trackId) {
      trackId=sound==='sine'||sound==='triangle'?sound:'track-'+(names.size+1);
      idsBySound.set(sound,trackId);
      names.set(trackId,sound);
    }
    const gain=event.source['gain'];
    return {id:`note-${index+1}`,trackId,pitchMidi:pitchToMidi(event.source['note']),
      startSeconds:event.startSeconds,durationSeconds:event.durationSeconds,velocity:null,
      sourceGain:typeof gain==='number'&&Number.isFinite(gain)?gain:null,
      sourceParameters:{...event.source}};
  });
  return {schema:'ambient-lab.music-document',version:1,timeUnit:'seconds',pitchUnit:'midi',
    durationSeconds:settings.duration,tempo:{bpm:settings.bpm,beatsPerCycle:4,cyclesPerSecond:source.cps},
    seed:source.seed,masterGain:settings.gain,sections:[{id:'section-1',startSeconds:0,endSeconds:settings.duration}],
    tracks:Array.from(names,([id,sourceSound])=>({id,sourceSound})),notes,
    generator:{name:'Strudel',version:'1.3.0',sourceNotes:source.notes,slow:source.slow,mood:settings.mood,rootMidi:settings.root,sparsity:settings.sparsity},
    limitations:[
      'Velocity was not specified by the source; null is not a MIDI velocity.',
      'sourceGain is the Strudel per-event gain and masterGain is applied later to rendered PCM; neither is velocity.',
      'Durations are scheduled note durations; envelopes, release tails, filtering and master fade are not reversible from notes alone.',
      'Events near the end may extend past the rendered audio duration; the PCM output is clipped at durationSeconds.',
      'This document records generated notes, not a verified round-trip or a promise of identical synthesis across engines.',
    ]};
}
