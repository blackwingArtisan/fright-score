import '@fontsource/pirata-one/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/700.css';
import './styles.css';
import { PATCHES, PATCH_IDS, type PatchId } from '../engine/patches';
import { scoreToVgm, type VgmResult } from '../export/vgm';
import type { RenderStats, VizFrames } from '../engine/render';
import { MOOD_PROFILES } from '../score/moods';
import { scoreFromRequest } from '../score/pipeline';
import { parseTimePhrase, readScene } from '../score/scene';
import { MOODS, type Mood, type Score } from '../score/schema';
import { MODE_LABELS, formatTime, midiToName } from '../score/theory';
import demoPreviewUrl from '../../samples/cellar-dread-sting-at-1m10s.mp3?url';
import { DEMO_SCENE, DEMO_SEED, DEMO_WAV_SHA256, sha256Hex, shortHash } from './demo';
import { createWebDirector } from './director';
import { LiveChip } from './live/live-chip';
import { Player } from './player';
import type { RenderRequestMessage, WorkerMessage } from './protocol';
import { ChipView } from './views/chip';
import { LiveView } from './views/live';
import { ScopeView } from './views/scope';
import { StitchView } from './views/stitch';
import { TimelineView } from './views/timeline';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const EXAMPLES: { label: string; scene: string }[] = [
  { label: 'Cellar dread', scene: DEMO_SCENE },
  { label: 'Music box', scene: 'A music box winds down in the nursery, 45 seconds, jump scare at 0:40' },
  { label: 'Corn maze chase', scene: 'They chase us through the corn maze, 40 seconds' },
  { label: 'The ritual', scene: 'Cult chanting around the altar by candlelight, 75 seconds, it answers at 1:05' },
  { label: 'Parking garage', scene: 'Footsteps behind you in the parking garage, 60 seconds, hit at 20s, scream at 0:50' },
];

const els = {
  form: $<HTMLFormElement>('cue-form'),
  scene: $<HTMLTextAreaElement>('scene'),
  heard: $<HTMLParagraphElement>('heard'),
  moods: $<HTMLDivElement>('moods'),
  seconds: $<HTMLInputElement>('seconds'),
  stings: $<HTMLInputElement>('stings'),
  loop: $<HTMLInputElement>('loop'),
  share: $<HTMLButtonElement>('share'),
  seed: $<HTMLInputElement>('seed'),
  reroll: $<HTMLButtonElement>('reroll'),
  summon: $<HTMLButtonElement>('summon'),
  directorName: $<HTMLParagraphElement>('director-name'),
  title: $<HTMLHeadingElement>('cue-title'),
  meta: $<HTMLParagraphElement>('cue-meta'),
  status: $<HTMLParagraphElement>('status'),
  progress: $<HTMLDivElement>('progress-bar'),
  timeline: $<HTMLCanvasElement>('timeline'),
  play: $<HTMLButtonElement>('play'),
  exportMenu: $<HTMLDetailsElement>('export-menu'),
  clock: $<HTMLSpanElement>('clock'),
  exportWav: $<HTMLButtonElement>('export-wav'),
  exportJson: $<HTMLButtonElement>('export-json'),
  exportVgm: $<HTMLButtonElement>('export-vgm'),
  chip: $<HTMLCanvasElement>('chip'),
  scope: $<HTMLCanvasElement>('scope'),
  notes: $<HTMLParagraphElement>('director-notes'),
  stats: $<HTMLParagraphElement>('render-stats'),
  livePatch: $<HTMLSelectElement>('live-patch'),
  liveBlurb: $<HTMLParagraphElement>('live-blurb'),
  liveOps: $<HTMLCanvasElement>('live-ops'),
  keys: $<HTMLDivElement>('keys'),
  octave: $<HTMLSpanElement>('live-octave'),
  octaveDown: $<HTMLButtonElement>('octave-down'),
  octaveUp: $<HTMLButtonElement>('octave-up'),
  liveStatus: $<HTMLParagraphElement>('live-status'),
  stage: document.querySelector<HTMLElement>('.stage')!,
  listen: $<HTMLButtonElement>('listen'),
  listenHint: $<HTMLSpanElement>('listen-hint'),
  jump: $<HTMLButtonElement>('jump'),
  tryLive: $<HTMLButtonElement>('try-live'),
  live: $<HTMLElement>('live'),
  direction: $<HTMLElement>('direction'),
  board: document.querySelector<HTMLElement>('.board')!,
  transport: document.querySelector<HTMLElement>('.transport')!,
  writeCta: $<HTMLAnchorElement>('write-cta'),
  proof: $<HTMLParagraphElement>('render-proof'),
};

/** The cue rendered on first load, so the board shows a real score before anyone clicks. */
const DEMO_REQUEST = { seed: DEMO_SEED, scene: DEMO_SCENE } as const;

const director = createWebDirector(import.meta.env.VITE_FRIGHT_DIRECTOR);
const player = new Player();
const timeline = new TimelineView(els.timeline);
const chip = new ChipView(els.chip);
const scope = new ScopeView(els.scope);
const live = new LiveChip(() => player.audio());
const liveView = new LiveView(els.liveOps, live);
const stitch = new StitchView($('stitch-plan'), $<HTMLOListElement>('stitch-writes'), $('stitch-count'));

const createWorker = () => new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
let worker = createWorker();

/** Raised when a newer request replaces a render that is still running. */
class Superseded extends Error {}

interface Rendered {
  score: Score;
  /** The same cue arranged for the Sega Genesis (YM2612). */
  vgm: VgmResult;
  wav: Uint8Array;
  frames: VizFrames;
  stats: RenderStats;
}

let current: Rendered | undefined;
/** The cue loaded in the player: the demo's pre-rendered preview, or the live render once it is ready. */
let playable: Score | undefined;
/** True while the player holds the demo preview and the live render is still running. */
let previewing = false;
/** Length shown on the clock while a new cue renders, before `current` is set. */
let clockDurationSec = 0;
let renderId = 0;
let pending: { reject: (error: Error) => void } | undefined;
let hasPlayed = false;

type State = 'idle' | 'composing' | 'rendering' | 'preview' | 'ready' | 'playing' | 'error';

function setStatus(state: State, text: string): void {
  els.status.dataset.state = state;
  els.status.textContent = text;
}

/* Mood selector, including Auto (read from the scene). */
function buildMoods(): void {
  const options: { value: string; label: string; title: string }[] = [
    { value: 'auto', label: 'From scene', title: 'Let the director read the mood from your scene' },
    ...MOODS.map((m) => ({ value: m, label: MOOD_PROFILES[m].label.replace(/^(The|Creeping|Haunted) /, ''), title: MOOD_PROFILES[m].tagline })),
  ];
  for (const opt of options) {
    const label = document.createElement('label');
    label.className = 'mood';
    label.title = opt.title;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'mood';
    input.value = opt.value;
    input.checked = opt.value === 'auto';
    const span = document.createElement('span');
    span.textContent = opt.label;
    label.append(input, span);
    els.moods.append(label);
  }
}

function buildExamples(): void {
  const wrap = document.querySelector('.examples')!;
  for (const ex of EXAMPLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'example';
    b.textContent = ex.label;
    b.title = ex.scene;
    b.addEventListener('click', () => {
      els.scene.value = ex.scene;
      els.seconds.value = '';
      els.stings.value = '';
      (els.form.querySelector('input[name="mood"][value="auto"]') as HTMLInputElement).checked = true;
      updateHeard();
      els.scene.focus();
    });
    wrap.append(b);
  }
}

function selectedMood(): Mood | undefined {
  const v = (els.form.querySelector('input[name="mood"]:checked') as HTMLInputElement | null)?.value;
  return v && v !== 'auto' ? (v as Mood) : undefined;
}

/** Show an error under a field and mark it invalid, or clear it when `message` is undefined. */
function fieldError(input: HTMLInputElement, message: string | undefined): void {
  const el = document.getElementById(`${input.id}-error`)!;
  el.textContent = message ?? '';
  el.hidden = message === undefined;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

/** Sting tokens that are not a time, such as "soon" in "1:10, soon". */
function badStingTokens(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .filter(Boolean)
    .filter((v) => {
      const t = parseTimePhrase(v);
      return t === undefined || t <= 0;
    });
}

function parseStings(value: string): number[] | undefined {
  const times = value
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((v) => parseTimePhrase(v))
    .filter((v): v is number => v !== undefined && v > 0);
  return times.length > 0 ? times : undefined;
}

/** Show what the director understood from the scene, as the user types. */
function updateHeard(): void {
  const text = els.scene.value.trim();
  if (!text) {
    els.heard.textContent = '';
    return;
  }
  const r = readScene(text);
  const parts: string[] = [];
  parts.push(r.mood ? `${MOOD_PROFILES[r.mood].label.toLowerCase()}` : 'no clear mood yet (defaults to dread)');
  if (r.durationSec) parts.push(`${formatTime(r.durationSec).replace(/\.0$/, '')} long`);
  if (r.stingAtSec.length) parts.push(`sting at ${r.stingAtSec.map((t) => formatTime(t).replace(/\.0$/, '')).join(', ')}`);
  if (r.hitAtSec.length) parts.push(`hit at ${r.hitAtSec.map((t) => formatTime(t).replace(/\.0$/, '')).join(', ')}`);
  if (r.shape === 'build') parts.push('building');
  els.heard.textContent = `Heard: ${parts.join(', ')}.`;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function download(bytes: Uint8Array | string, type: string, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Sting times of the current cue, in seconds, earliest first. */
function stingTimes(score: Score | undefined): number[] {
  return (score?.plan.cues ?? []).filter((c) => c.kind === 'sting').map((c) => c.atSec).sort((a, b) => a - b);
}

/** How far before the first sting "Jump to the scare" lands, so the riser and the silence are heard. */
const JUMP_LEAD_SEC = 6;

/** How long the stage reacts when a sting lands. */
const STING_FLASH_MS = 600;

/** Enable or disable Play, Listen and Jump to the scare for the cue in the player. */
function setPlayable(score: Score | undefined): void {
  playable = score;
  const enabled = score !== undefined;
  const stings = stingTimes(score);
  els.jump.disabled = !enabled || stings.length === 0;
  els.listen.hidden = !enabled || hasPlayed;
  if (enabled) {
    els.listenHint.textContent = stings.length ? `The scare lands at ${formatTime(stings[0]).replace(/\.0$/, '')}` : 'Hear the cue';
  }
  els.play.disabled = !enabled;
}

function setReady(enabled: boolean): void {
  setPlayable(enabled ? current?.score : undefined);
  els.exportWav.disabled = !enabled;
  els.exportJson.disabled = !enabled;
  els.exportVgm.disabled = !enabled;
  els.share.disabled = !enabled;
  els.exportMenu.classList.toggle('is-disabled', !enabled);
  if (!enabled) closeExportMenu();
}

/** The request behind the current cue, as URL parameters. Same parameters, same cue, on any machine. */
function shareParams(request: CueRequestLike): URLSearchParams {
  const p = new URLSearchParams();
  if (request.scene) p.set('scene', request.scene);
  if (request.mood) p.set('mood', request.mood);
  if (request.durationSec) p.set('s', String(request.durationSec));
  if (request.stingAtSec?.length) p.set('sting', request.stingAtSec.join(','));
  if (request.loop) p.set('loop', '1');
  p.set('seed', String(request.seed));
  return p;
}

/** Fill the form from URL parameters. Returns true when there was something to load. */
function loadFromUrl(): boolean {
  const p = new URLSearchParams(window.location.search);
  if (![...p.keys()].some((k) => ['scene', 'mood', 's', 'sting', 'seed', 'loop'].includes(k))) return false;
  els.scene.value = p.get('scene')?.slice(0, 500) ?? '';
  const mood = p.get('mood');
  const moodInput = els.form.querySelector(`input[name="mood"][value="${mood && (MOODS as readonly string[]).includes(mood) ? mood : 'auto'}"]`) as HTMLInputElement;
  moodInput.checked = true;
  els.seconds.value = p.get('s') ?? '';
  els.stings.value = p.get('sting') ?? '';
  els.seed.value = p.get('seed') ?? els.seed.value;
  els.loop.checked = p.get('loop') === '1';
  updateHeard();
  return true;
}

interface CueRequestLike {
  seed: number;
  scene?: string;
  mood?: Mood;
  durationSec?: number;
  stingAtSec?: number[];
  loop?: boolean;
}

let lastRequest: CueRequestLike | undefined;

function describe(score: Score): string {
  const p = score.plan;
  const moodLabel = MOOD_PROFILES[p.mood].label;
  const loop = p.loop ? ' Seamless loop.' : '';
  return `${moodLabel}. ${p.key.root} ${MODE_LABELS[p.key.mode]}, ${p.tempoBpm} BPM in ${p.beatsPerBar}/4, ${formatTime(p.durationSec)}. Seed ${score.seed}.${loop}`;
}

/** The More menu holds the score JSON and the share link; it closes on Escape, outside clicks and a new cue. */
function closeExportMenu(): void {
  els.exportMenu.open = false;
}

/** Stop a render that is still running, so a newer request starts at once and cannot be overwritten. */
function cancelRender(): void {
  if (!pending) return;
  timeline.setProgress(undefined);
  worker.terminate();
  worker = createWorker();
  pending.reject(new Superseded('A newer cue replaced this one'));
  pending = undefined;
}

interface RenderedAudio extends Rendered {
  left: Float32Array;
  right: Float32Array;
}

function render(score: Score): Promise<RenderedAudio> {
  cancelRender();
  const id = ++renderId;
  const w = worker;
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        els.progress.style.width = `${Math.round(msg.fraction * 100)}%`;
        timeline.setProgress(msg.fraction);
        if (!previewing) setStatus('rendering', `Rendering ${Math.round(msg.fraction * 100)}%`);
        else if (!player.playing) setStatus('preview', `Preview ready. Exact render ${Math.round(msg.fraction * 100)}%`);
        return;
      }
      w.removeEventListener('message', onMessage);
      pending = undefined;
      timeline.setProgress(undefined);
      if (msg.type === 'error') reject(new Error(msg.message));
      else resolve({ score, vgm: scoreToVgm(score), wav: msg.wav, frames: msg.frames, stats: msg.stats, left: msg.left, right: msg.right });
    };
    pending = { reject };
    w.addEventListener('message', onMessage);
    const request: RenderRequestMessage = { type: 'render', id, score };
    w.postMessage(request);
  });
}

let summonToken = 0;

async function summon(event: Event): Promise<void> {
  event.preventDefault();
  const token = ++summonToken;
  cancelRender();
  const seed = Math.max(0, Math.floor(Number(els.seed.value) || 0)) >>> 0;
  els.seed.value = String(seed);
  const seconds = els.seconds.value.trim() ? Number(els.seconds.value) : undefined;
  fieldError(els.seconds, undefined);
  fieldError(els.stings, undefined);
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds < 5 || seconds > 300)) {
    fieldError(els.seconds, 'Use 5 to 300 seconds.');
    setStatus('error', 'Length must be 5 to 300 seconds');
    els.seconds.focus();
    return;
  }
  const bad = badStingTokens(els.stings.value);
  if (bad.length > 0) {
    fieldError(els.stings, `"${bad[0].slice(0, 12)}" is not a time. Use 1:10 or 70, separated by commas.`);
    setStatus('error', 'Check the sting times');
    els.stings.focus();
    return;
  }
  const scene = els.scene.value.trim();
  const mood = selectedMood();
  const stingAtSec = parseStings(els.stings.value) ?? (scene ? readScene(scene).stingAtSec : undefined);
  const request = {
    seed,
    ...(scene ? { scene } : {}),
    ...(mood ? { mood } : {}),
    ...(seconds ? { durationSec: seconds } : {}),
    ...(stingAtSec && stingAtSec.length ? { stingAtSec } : {}),
    ...(els.loop.checked ? { loop: true } : {}),
  };

  await summonCue(request, token, { demo: false });
}

/** Compose and render a request, then show it on the board. Stale results (an older token) are dropped. */
async function summonCue(request: CueRequestLike, token: number, { demo }: { demo: boolean }): Promise<void> {
  player.stop();
  // Reset the transport for the new cue: a disabled Play, the clock at zero, ghost panels while it renders.
  current = undefined;
  previewing = false;
  clockDurationSec = 0;
  els.proof.textContent = '';
  delete els.proof.dataset.sha256;
  lastPos = 0;
  els.play.textContent = 'Play';
  closeExportMenu();
  chip.set(undefined, undefined);
  stitch.set(undefined, undefined);
  setReady(false);
  els.summon.disabled = true;
  els.progress.style.width = '0%';
  try {
    setStatus('composing', 'Composing');
    const score = await scoreFromRequest(director, request);
    if (token !== summonToken) return;
    els.title.textContent = score.plan.title;
    els.meta.textContent = demo ? `Demo cue from "${request.scene}". ${describe(score)}` : describe(score);
    els.notes.textContent = score.plan.directorNotes ?? '';
    timeline.setScore(score);
    timeline.setProgress(0);
    clockDurationSec = score.durationSec;
    chip.set(score, undefined);
    stitch.set(score, undefined);
    setStatus('rendering', 'Rendering 0%');
    if (demo) void startPreview(score, token);
    const rendered = await render(score);
    if (token !== summonToken) return;
    // If the demo preview is playing, carry on from the same spot in the exact render.
    const resumeAt = previewing ? player.position : 0;
    const wasPlaying = previewing && player.playing;
    previewing = false;
    player.load(rendered.left, rendered.right, 44_100, score.plan.loop === true);
    if (resumeAt > 0) await player.seek(resumeAt);
    if (wasPlaying) await player.play();
    lastPos = player.position;
    timeline.setScore(score, rendered.left, rendered.right);
    current = { score, vgm: rendered.vgm, wav: rendered.wav, frames: rendered.frames, stats: rendered.stats };
    stitch.set(score, rendered.vgm);
    chip.set(score, current.frames);
    const s = current.stats;
    els.stats.textContent = `${s.noteCount} notes on ${score.tracks.length} channels, up to ${s.maxVoices} voices at once. True peak ${s.truePeakDb.toFixed(1)} dBTP, ${s.loudnessLufs.toFixed(1)} LUFS. Rendered in ${(s.renderMs / 1000).toFixed(1)} s in your browser.`;
    els.progress.style.width = '100%';
    setReady(true);
    if (wasPlaying) setStatus('playing', 'Playing');
    else setStatus('ready', demo ? 'Ready: press Play' : 'Ready');
    void showProof(rendered.wav, demo, token);
    els.play.classList.toggle('btn--beckon', !hasPlayed);
    lastRequest = request;
    if (!demo) history.replaceState(null, '', `?${shareParams(request).toString()}`);
    document.body.dataset.cue = 'ready';
  } catch (error) {
    if (error instanceof Superseded || token !== summonToken) return;
    timeline.setProgress(undefined);
    setStatus('error', (error as Error).message.slice(0, 120));
  } finally {
    if (token === summonToken) els.summon.disabled = false;
  }
}

/**
 * Load the demo's pre-rendered preview (the same cue, encoded as MP3) so Listen works within a second, while
 * the exact render finishes in the background. Any failure just leaves the live render to arrive as usual.
 */
async function startPreview(score: Score, token: number): Promise<void> {
  try {
    const response = await fetch(demoPreviewUrl);
    if (!response.ok) return;
    const audio = await player.audio().ctx.decodeAudioData(await response.arrayBuffer());
    if (token !== summonToken || current) return;
    const left = audio.getChannelData(0);
    const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left;
    player.load(left, right, audio.sampleRate, false);
    timeline.setScore(score, left, right);
    previewing = true;
    setPlayable(score);
    els.play.classList.toggle('btn--beckon', !hasPlayed);
    setStatus('preview', 'Preview ready: press Listen');
  } catch {
    // No preview: the live render still lands in a few seconds.
  }
}

/** Show the sha256 of the rendered WAV; for the demo, check it against the published hash. */
async function showProof(wav: Uint8Array, demo: boolean, token: number): Promise<void> {
  if (!globalThis.crypto?.subtle) return;
  const hex = await sha256Hex(wav);
  if (token !== summonToken) return;
  els.proof.dataset.sha256 = hex;
  els.proof.title = `sha256 ${hex}`;
  if (demo) {
    els.proof.dataset.match = String(hex === DEMO_WAV_SHA256);
    els.proof.textContent =
      hex === DEMO_WAV_SHA256
        ? `Live render matches the published demo, byte for byte: sha256 ${shortHash(hex)}`
        : `Live render finished: sha256 ${shortHash(hex)}, which differs from the published demo.`;
  } else {
    els.proof.textContent = `sha256 ${shortHash(hex)}. The same request and seed give this hash on any machine.`;
  }
}

async function togglePlay(): Promise<void> {
  if (!playable) return;
  if (player.playing) {
    player.pause();
    els.play.textContent = 'Play';
    setStatus(previewing ? 'preview' : 'ready', 'Paused');
  } else {
    await player.play();
    hasPlayed = true;
    lastPos = player.position;
    els.listen.hidden = true;
    els.play.classList.remove('btn--beckon');
    els.play.textContent = 'Pause';
    setStatus('playing', 'Playing');
  }
}

player.onEnded = () => {
  lastPos = 0;
  els.play.textContent = 'Play';
  setStatus(previewing ? 'preview' : 'ready', previewing ? 'Preview ended' : 'Ready');
};

let sliderAt = 0;
/** Keep the timeline slider's value in step with the playhead, a few times a second. */
function updateTimelineValue(pos: number, force = false): void {
  const t = performance.now();
  if (!force && t - sliderAt < 250) return;
  sliderAt = t;
  const dur = playable?.durationSec ?? 0;
  const short = (sec: number) => formatTime(sec).replace(/\.\d$/, '');
  els.timeline.setAttribute('aria-valuemax', dur.toFixed(1));
  els.timeline.setAttribute('aria-valuenow', pos.toFixed(1));
  els.timeline.setAttribute('aria-valuetext', `${short(pos)} of ${short(dur)}`);
}

let stitchAt = 0;
let lastPos = 0;
let stingsLanded = 0;
let scareUntil = 0;
let scareTimer: ReturnType<typeof setTimeout> | undefined;

/** The visual payoff when the playhead crosses a sting: blood vignette, shake, pad flare, red playhead. */
function landSting(): void {
  setHush(false);
  document.body.classList.remove('is-stung');
  void document.body.offsetWidth;
  document.body.classList.add('is-stung');
  stingsLanded++;
  els.stage.dataset.stings = String(stingsLanded);
  els.stage.classList.remove('stage--sting');
  void els.stage.offsetWidth; // restart the animation if two stings land close together
  els.stage.classList.add('stage--sting');
  scareUntil = performance.now() + STING_FLASH_MS;
  clearTimeout(scareTimer);
  scareTimer = setTimeout(() => {
    els.stage.classList.remove('stage--sting');
    document.body.classList.remove('is-stung');
  }, STING_FLASH_MS);
}

let hushed = false;
/** The board goes dark during the planned silence before a sting, so the hit lands out of black. */
function setHush(on: boolean): void {
  if (on === hushed) return;
  hushed = on;
  document.body.classList.toggle('is-hush', on);
}

/** True while the playhead is inside one of the plan's silence windows (the 0.6 s before a sting). */
function inSilence(pos: number): boolean {
  if (!player.playing) return false;
  return (playable?.plan.cues ?? []).some((c) => c.kind === 'silence' && pos >= c.atSec && pos < c.atSec + (c.lengthSec ?? 0.6));
}

/** Fire `landSting` for every sting the playhead passed since the last frame (not across a seek or loop wrap). */
function checkStings(pos: number): void {
  if (player.playing && pos >= lastPos && pos - lastPos < 0.5) {
    for (const t of stingTimes(playable)) if (lastPos < t && t <= pos) landSting();
  }
  lastPos = pos;
}

let dreadShown = -1;
/** Tie the page's atmosphere (--dread, 0..1) to the intensity of the section under the playhead. */
function updateDread(pos: number): void {
  const sections = playable?.plan.sections ?? [];
  const section = player.playing ? sections.find((s) => pos >= s.startSec && pos < s.endSec) : undefined;
  const dread = hushed ? 1 : Math.round((section?.intensity ?? 0.25) * 20) / 20;
  if (dread === dreadShown) return;
  dreadShown = dread;
  document.documentElement.style.setProperty('--dread', String(dread));
}

function frame(): void {
  const pos = player.position;
  setHush(inSilence(pos));
  checkStings(pos);
  updateDread(pos);
  timeline.draw(pos, performance.now() < scareUntil);
  chip.draw(pos);
  scope.draw(player.analyser, player.playing || live.latest.voices > 0);
  if (performance.now() - stitchAt > 66) {
    stitchAt = performance.now();
    stitch.draw(pos);
  }
  liveView.draw();
  updateLiveStatus();
  els.clock.textContent = `${formatTime(pos)} / ${formatTime(current?.score.durationSec ?? clockDurationSec)}`;
  els.clock.dataset.position = pos.toFixed(2);
  updateTimelineValue(pos);
  requestAnimationFrame(frame);
}

/* Play the chip live: a one-octave keyboard driving the FS-666 AudioWorklet in real time. */

/** Computer keys for one octave plus the top C, laid out like a piano on the home row. */
const KEY_MAP = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'];
const BLACK = new Set([1, 3, 6, 8, 10]);

/** A comfortable starting octave for each patch, as the lowest C on the keyboard. */
const PATCH_BASE: Record<PatchId, number> = {
  'grave-drone': 36,
  'wraith-pad': 60,
  heartbeat: 36,
  'tritone-brass': 48,
  'music-box': 72,
  'glass-bell': 72,
  'crypt-bass': 36,
  screech: 60,
  'ritual-drum': 36,
  'choir-organ': 48,
};
const DEFAULT_LIVE_PATCH: PatchId = 'choir-organ';
let liveBase = PATCH_BASE[DEFAULT_LIVE_PATCH];
const keyButtons: HTMLButtonElement[] = [];

function setLiveBase(base: number): void {
  liveBase = Math.max(24, Math.min(84, base));
  els.octave.textContent = midiToName(liveBase);
  keyButtons.forEach((b, i) => {
    b.setAttribute('aria-label', midiToName(liveBase + i));
  });
}

function setLivePatch(id: PatchId): void {
  live.panic();
  live.setPatch(id);
  els.livePatch.value = id;
  els.liveBlurb.textContent = PATCHES[id].blurb;
  setLiveBase(PATCH_BASE[id]);
}

function pressKey(index: number, source: string): void {
  keyButtons[index]?.classList.add('key--down');
  void live.noteOn(`${source}:${index}`, liveBase + index);
}

function releaseKey(index: number, source: string): void {
  keyButtons[index]?.classList.remove('key--down');
  live.noteOff(`${source}:${index}`);
}

function focusKey(index: number): void {
  keyButtons.forEach((k, j) => (k.tabIndex = j === index ? 0 : -1));
  keyButtons[index]?.focus();
}

function buildLiveChip(): void {
  for (const id of PATCH_IDS) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = PATCHES[id].name;
    els.livePatch.append(option);
  }
  els.livePatch.addEventListener('change', () => setLivePatch(els.livePatch.value as PatchId));
  let white = 0;
  KEY_MAP.forEach((letter, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    const black = BLACK.has(i);
    b.className = black ? 'key key--black' : 'key';
    b.dataset.index = String(i);
    b.style.setProperty('--slot', String(black ? white - 0.5 : white));
    if (!black) white++;
    const cap = document.createElement('span');
    cap.className = 'key__cap';
    cap.textContent = letter.toUpperCase();
    b.append(cap);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      pressKey(i, `p${e.pointerId}`);
    });
    const up = (e: PointerEvent) => releaseKey(i, `p${e.pointerId}`);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.tabIndex = i === 0 ? 0 : -1;
    b.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        pressKey(i, 'kb-focus');
        return;
      }
      // One tab stop for the whole keyboard; arrow keys, Home and End move between keys.
      const move: Record<string, number> = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: KEY_MAP.length - 1 };
      if (e.key in move) {
        e.preventDefault();
        focusKey(Math.max(0, Math.min(KEY_MAP.length - 1, move[e.key])));
      }
    });
    b.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') releaseKey(i, 'kb-focus');
    });
    keyButtons.push(b);
    els.keys.append(b);
  });
  els.keys.style.setProperty('--whites', String(white));
  els.octaveDown.addEventListener('click', () => setLiveBase(liveBase - 12));
  els.octaveUp.addEventListener('click', () => setLiveBase(liveBase + 12));
  window.addEventListener('blur', () => {
    live.panic();
    keyButtons.forEach((b) => b.classList.remove('key--down'));
  });
  setLivePatch(DEFAULT_LIVE_PATCH);
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

document.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
  const key = e.key.toLowerCase();
  const index = KEY_MAP.indexOf(key);
  if (index >= 0) {
    e.preventDefault();
    pressKey(index, 'kb');
  } else if (key === 'z') setLiveBase(liveBase - 12);
  else if (key === 'x') setLiveBase(liveBase + 12);
});
document.addEventListener('keyup', (e) => {
  const index = KEY_MAP.indexOf(e.key.toLowerCase());
  if (index >= 0) releaseKey(index, 'kb');
});

let liveStatusAt = 0;
function updateLiveStatus(): void {
  const t = performance.now();
  if (t - liveStatusAt < 200) return;
  liveStatusAt = t;
  const r = live.latest;
  const el = els.liveStatus;
  el.dataset.frames = String(r.framesRendered);
  el.dataset.voices = String(r.voices);
  el.dataset.peak = live.peakEver.toFixed(4);
  if (!live.awake) return;
  const seconds = (r.framesRendered / 44_100).toFixed(1);
  el.textContent =
    r.voices > 0
      ? `Synthesizing ${r.voices} voice${r.voices === 1 ? '' : 's'} in real time on the audio thread. ${seconds} s of audio so far.`
      : `Chip awake and listening. ${seconds} s synthesized in real time so far.`;
}

buildMoods();
buildExamples();
els.directorName.textContent = `Director: ${director.label}`;
els.scene.addEventListener('input', updateHeard);
els.seconds.addEventListener('input', () => fieldError(els.seconds, undefined));
els.stings.addEventListener('input', () => fieldError(els.stings, undefined));
els.form.addEventListener('submit', (e) => void summon(e));
els.reroll.addEventListener('click', () => {
  els.seed.value = String(Math.floor(Math.random() * 100_000));
});
els.play.addEventListener('click', () => void togglePlay());
els.listen.addEventListener('click', () => void togglePlay());

async function seekTo(sec: number): Promise<void> {
  await player.seek(sec);
  lastPos = player.position;
}

els.jump.addEventListener('click', async () => {
  const first = stingTimes(playable)[0];
  if (first === undefined) return;
  await seekTo(Math.max(0, first - JUMP_LEAD_SEC));
  if (!player.playing) await togglePlay();
});
els.tryLive.addEventListener('click', () => {
  els.live.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  els.live.classList.remove('live--beckon');
  void els.live.offsetWidth;
  els.live.classList.add('live--beckon');
});
els.timeline.addEventListener('click', (e) => {
  if (!playable) return;
  const rect = els.timeline.getBoundingClientRect();
  void seekTo(timeline.timeAt(e.clientX - rect.left));
});
/** Scrub with the keyboard: arrows move 1 s (5 s with Shift), Page keys 10 s, Home and End jump to the ends. */
els.timeline.addEventListener('keydown', (e) => {
  if (!playable) return;
  const dur = playable.durationSec;
  const pos = player.position;
  const step = e.shiftKey ? 5 : 1;
  const target: Record<string, number> = {
    ArrowLeft: pos - step,
    ArrowDown: pos - step,
    ArrowRight: pos + step,
    ArrowUp: pos + step,
    PageDown: pos - 10,
    PageUp: pos + 10,
    Home: 0,
    End: Math.max(0, dur - 0.05),
  };
  if (!(e.key in target)) return;
  e.preventDefault();
  void seekTo(Math.max(0, Math.min(dur, target[e.key]))).then(() => updateTimelineValue(player.position, true));
});
// Canvas text is drawn once per cue, so redraw it after the web fonts arrive.
void document.fonts?.ready.then(() => timeline.invalidate());
els.exportWav.addEventListener('click', () => {
  if (!current) return;
  const kind = current.score.plan.loop ? '-loop' : '';
  download(current.wav, 'audio/wav', `fright-score-${slug(current.score.plan.title)}${kind}-seed${current.score.seed}.wav`);
});
els.share.addEventListener('click', async () => {
  if (!lastRequest) return;
  const url = `${window.location.origin}${window.location.pathname}?${shareParams(lastRequest).toString()}`;
  try {
    await navigator.clipboard.writeText(url);
    setStatus('ready', 'Link copied');
  } catch {
    window.prompt('Copy this link', url);
  }
  els.share.dataset.url = url;
});
els.exportVgm.addEventListener('click', () => {
  if (!current) return;
  download(current.vgm.bytes, 'audio/x-vgm', `fright-score-${slug(current.score.plan.title)}-seed${current.score.seed}.vgm`);
});
els.exportMenu.querySelector('summary')!.addEventListener('click', (e) => {
  if (!current) e.preventDefault();
});
document.addEventListener('click', (e) => {
  if (els.exportMenu.open && !els.exportMenu.contains(e.target as Node)) closeExportMenu();
});
els.exportMenu.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && els.exportMenu.open) {
    closeExportMenu();
    els.exportMenu.querySelector('summary')?.focus();
  }
});
els.exportJson.addEventListener('click', () => {
  if (!current) return;
  download(JSON.stringify(current.score, null, 2), 'application/json', `fright-score-${slug(current.score.plan.title)}-seed${current.score.seed}.json`);
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && playable && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement)) {
    e.preventDefault();
    void togglePlay();
  }
});
/* Phones: put the form right after the transport, and pin a "Write your scene" button until it is in view. */
const narrow = window.matchMedia('(max-width: 900px)');
function placeDirection(): void {
  if (narrow.matches) {
    if (els.direction.previousElementSibling !== els.transport) els.transport.after(els.direction);
  } else if (els.direction.parentElement !== els.board) {
    els.board.prepend(els.direction);
  }
}
placeDirection();
narrow.addEventListener('change', placeDirection);
new IntersectionObserver(([entry]) => {
  els.writeCta.hidden = entry.isIntersecting;
}).observe(els.direction);
els.writeCta.addEventListener('click', (e) => {
  e.preventDefault();
  els.direction.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  els.scene.focus({ preventScroll: true });
});

buildLiveChip();
requestAnimationFrame(frame);
if (loadFromUrl()) els.form.requestSubmit();
else void summonCue(DEMO_REQUEST, ++summonToken, { demo: true });
