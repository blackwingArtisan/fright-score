import type { Score, Track } from '../score/schema';
import { CONTROL_BLOCK, SAMPLE_RATE } from './constants';
import { integratedLoudness, MOOD_LOUDNESS_LUFS } from './loudness';
import { DEFAULT_MASTER, applyGain, dbToGain, gainToDb, master, peakOf, rmsOf } from './master';
import { getPatch, maxReleaseSec, type Patch } from './patches';
import { applyReverb } from './reverb';
import { Voice } from './voice';

/** Maximum simultaneous voices per track, like channels on the original chip. */
export const TRACK_POLYPHONY: Record<string, number> = {
  drone: 5,
  choir: 6,
  bass: 2,
  pulse: 2,
  percussion: 3,
  motif: 6,
  texture: 6,
  riser: 2,
  stinger: 6,
  boom: 2,
};

/** Seconds of release tails rendered past the end of a loop and wrapped onto its start. */
export const LOOP_TAIL_SEC = 4;

/** Envelope levels per track per operator, sampled for the visualizer. */
export interface VizFrames {
  frameRate: number;
  frameCount: number;
  trackIds: string[];
  /** frameCount x trackCount x 4 operator envelope levels (0..1). */
  envelopes: Float32Array;
  /** frameCount x trackCount: number of sounding voices. */
  voices: Uint8Array;
  /** frameCount x trackCount: MIDI note of the most recent voice (0 when silent). */
  notes: Uint8Array;
}

export interface RenderStats {
  durationSec: number;
  /** Sample peak in dBFS. */
  peakDb: number;
  /** Estimated true (inter-sample) peak in dBTP; the master chain holds this at -1. */
  truePeakDb: number;
  rmsDb: number;
  /** Integrated loudness (ITU-R BS.1770) in LUFS, after the mood's loudness ceiling. */
  loudnessLufs: number;
  noteCount: number;
  maxVoices: number;
  renderMs: number;
}

export interface RenderResult {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
  frames?: VizFrames;
  stats: RenderStats;
}

export interface RenderOptions {
  /** Collect envelope frames for the visualizer. */
  frames?: boolean;
  frameRate?: number;
  /** Called with 0..1 as rendering progresses. */
  onProgress?: (fraction: number) => void;
  /** Clock for render timing stats; defaults to performance.now when available. */
  now?: () => number;
}

interface Active {
  voice: Voice;
  startSample: number;
  offSample: number;
  choke: boolean;
  midi: number;
  panL: number;
  panR: number;
}

interface PreparedTrack {
  track: Track;
  patch: Patch;
  gain: number;
  send: number;
  polyphony: number;
  events: { start: number; off: number; noteIndex: number }[];
  next: number;
  active: Active[];
}

function panGains(pan: number): [number, number] {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

/** Fade-out length that never swallows a late sting. */
export function fadeOutFor(score: Score): number {
  const stings = score.plan.cues.filter((c) => c.kind === 'sting' || c.kind === 'hit').map((c) => c.atSec);
  const last = stings.length > 0 ? Math.max(...stings) : -Infinity;
  const room = score.durationSec - (last + 0.6);
  return Math.max(0.25, Math.min(2, Number.isFinite(room) ? room : 2));
}

export function renderScore(score: Score, options: RenderOptions = {}): RenderResult {
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0));
  const startedAt = now();
  const sr = SAMPLE_RATE;
  const total = Math.ceil(score.durationSec * sr);
  const loop = score.plan.loop === true;
  // Loops render a few extra seconds of tails, then wrap them onto the start.
  const tail = loop ? Math.min(total, LOOP_TAIL_SEC * sr) : 0;
  const length = total + tail;
  let left = new Float32Array(length);
  let right = new Float32Array(length);
  const send = new Float32Array(length);
  const frameRate = options.frameRate ?? 30;
  const frameSamples = Math.round(sr / frameRate);
  const frameCount = Math.ceil(total / frameSamples);
  const trackCount = score.tracks.length;
  const frames: VizFrames | undefined = options.frames
    ? {
        frameRate,
        frameCount,
        trackIds: score.tracks.map((t) => t.id),
        envelopes: new Float32Array(frameCount * trackCount * 4),
        voices: new Uint8Array(frameCount * trackCount),
        notes: new Uint8Array(frameCount * trackCount),
      }
    : undefined;

  const prepared: PreparedTrack[] = score.tracks.map((track) => {
    const patch = getPatch(track.patchId);
    const events = track.notes
      .map((n, i) => ({
        start: Math.round(n.atSec * sr),
        off: Math.round((n.atSec + n.durSec) * sr),
        noteIndex: i,
      }))
      .sort((a, b) => a.start - b.start || a.noteIndex - b.noteIndex);
    return {
      track,
      patch,
      gain: dbToGain(track.gainDb),
      send: track.reverb,
      polyphony: TRACK_POLYPHONY[track.id] ?? TRACK_POLYPHONY[track.role] ?? 4,
      events,
      next: 0,
      active: [],
    };
  });

  let maxVoices = 0;
  let noteCount = 0;
  const progressEvery = Math.max(CONTROL_BLOCK, Math.floor(total / 50 / CONTROL_BLOCK) * CONTROL_BLOCK);

  for (let blockStart = 0; blockStart < length; blockStart += CONTROL_BLOCK) {
    const blockEnd = Math.min(length, blockStart + CONTROL_BLOCK);
    let voiceTotal = 0;
    for (const pt of prepared) {
      // Start notes that begin in this block.
      while (pt.next < pt.events.length && pt.events[pt.next].start < blockEnd) {
        const ev = pt.events[pt.next++];
        const n = pt.track.notes[ev.noteIndex];
        if (pt.active.length >= pt.polyphony) {
          // Voice stealing: drop the oldest released voice, otherwise the oldest voice.
          let victim = pt.active.findIndex((a) => a.voice.isReleased);
          if (victim < 0) victim = 0;
          pt.active.splice(victim, 1);
        }
        const [pl, pr] = panGains(n.pan ?? pt.track.pan);
        pt.active.push({
          voice: new Voice(pt.patch, n, sr, (ev.noteIndex * 0.137) % 1),
          startSample: ev.start,
          offSample: ev.off,
          choke: n.choke === true,
          midi: n.midi,
          panL: pl,
          panR: pr,
        });
        noteCount++;
      }
      const g = pt.gain;
      const sendAmt = pt.send;
      for (let a = pt.active.length - 1; a >= 0; a--) {
        const act = pt.active[a];
        const from = Math.max(blockStart, act.startSample);
        const gl = act.panL * g;
        const gr = act.panR * g;
        for (let i = from; i < blockEnd; i++) {
          if (i === act.offSample) act.voice.noteOff(act.choke ? 0.05 : undefined);
          const s = act.voice.tick();
          left[i] += s * gl;
          right[i] += s * gr;
          send[i] += s * g * sendAmt;
        }
        if (blockEnd > act.offSample && !act.voice.isReleased) act.voice.noteOff(act.choke ? 0.05 : undefined);
        const tailLimit = act.offSample + Math.round((maxReleaseSec(pt.patch) * 3 + 0.5) * sr);
        if ((act.voice.isReleased && !act.voice.active) || blockEnd > tailLimit) pt.active.splice(a, 1);
      }
      voiceTotal += pt.active.length;
    }
    if (voiceTotal > maxVoices) maxVoices = voiceTotal;

    if (frames) {
      const frameIndex = Math.floor(blockStart / frameSamples);
      if (blockStart < total && blockStart % frameSamples < CONTROL_BLOCK && frameIndex < frameCount) {
        for (let t = 0; t < trackCount; t++) {
          const pt = prepared[t];
          const base = (frameIndex * trackCount + t) * 4;
          let latest = 0;
          for (const act of pt.active) {
            for (let o = 0; o < 4; o++) {
              const lvl = act.voice.ops[o].env.level;
              if (lvl > frames.envelopes[base + o]) frames.envelopes[base + o] = lvl;
            }
            latest = act.midi;
          }
          frames.voices[frameIndex * trackCount + t] = Math.min(255, pt.active.length);
          frames.notes[frameIndex * trackCount + t] = pt.active.length > 0 ? latest : 0;
        }
      }
    }
    if (options.onProgress && blockStart % progressEvery === 0) options.onProgress(Math.min(0.9, (blockStart / length) * 0.9));
  }

  applyReverb(send, left, right);
  if (loop) {
    for (const ch of [left, right]) for (let i = 0; i < tail; i++) ch[i % total] += ch[total + i];
    left = left.slice(0, total);
    right = right.slice(0, total);
  }
  const masterOptions = loop
    ? { ...DEFAULT_MASTER, sampleRate: sr, fadeInSec: 0, fadeOutSec: 0, circular: true }
    : { ...DEFAULT_MASTER, sampleRate: sr, fadeOutSec: fadeOutFor(score) };
  let truePeak = master(left, right, masterOptions);
  // Trim to the mood's loudness ceiling, so sparse and dense moods sit at a sensible level.
  let loudness = integratedLoudness(sr, left, right);
  const ceiling = MOOD_LOUDNESS_LUFS[score.plan.mood];
  if (loudness > ceiling) {
    const trim = dbToGain(ceiling - loudness);
    applyGain(trim, left, right);
    truePeak *= trim;
    loudness = ceiling;
  }
  options.onProgress?.(1);

  return {
    sampleRate: sr,
    left,
    right,
    ...(frames ? { frames } : {}),
    stats: {
      durationSec: total / sr,
      peakDb: gainToDb(peakOf(left, right)),
      truePeakDb: gainToDb(truePeak),
      rmsDb: gainToDb(rmsOf(left, right)),
      loudnessLufs: loudness,
      noteCount,
      maxVoices,
      renderMs: Math.round(now() - startedAt),
    },
  };
}
