import '@fontsource/pirata-one/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/700.css';
import './styles.css';
import type { RenderStats, VizFrames } from '../engine/render';
import { MOOD_PROFILES } from '../score/moods';
import { scoreFromRequest } from '../score/pipeline';
import { parseTimePhrase, readScene } from '../score/scene';
import { MOODS, type Mood, type Score } from '../score/schema';
import { MODE_LABELS, formatTime } from '../score/theory';
import { createWebDirector } from './director';
import { Player } from './player';
import type { RenderRequestMessage, WorkerMessage } from './protocol';
import { ChipView } from './views/chip';
import { ScopeView } from './views/scope';
import { TimelineView } from './views/timeline';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const EXAMPLES: { label: string; scene: string }[] = [
  { label: 'Cellar dread', scene: 'Creeping dread in the cellar, 90 seconds, builds to a sting at 0:70' },
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
  clock: $<HTMLSpanElement>('clock'),
  exportWav: $<HTMLButtonElement>('export-wav'),
  exportJson: $<HTMLButtonElement>('export-json'),
  chip: $<HTMLCanvasElement>('chip'),
  scope: $<HTMLCanvasElement>('scope'),
  notes: $<HTMLParagraphElement>('director-notes'),
  stats: $<HTMLParagraphElement>('render-stats'),
};

const director = createWebDirector(import.meta.env.VITE_FRIGHT_DIRECTOR);
const player = new Player();
const timeline = new TimelineView(els.timeline);
const chip = new ChipView(els.chip);
const scope = new ScopeView(els.scope);
const worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });

interface Rendered {
  score: Score;
  wav: Uint8Array;
  frames: VizFrames;
  stats: RenderStats;
}

let current: Rendered | undefined;
let renderId = 0;

type State = 'idle' | 'composing' | 'rendering' | 'ready' | 'playing' | 'error';

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

function setReady(enabled: boolean): void {
  els.play.disabled = !enabled;
  els.exportWav.disabled = !enabled;
  els.exportJson.disabled = !enabled;
  els.share.disabled = !enabled;
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

function render(score: Score): Promise<Rendered> {
  const id = ++renderId;
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        els.progress.style.width = `${Math.round(msg.fraction * 100)}%`;
        setStatus('rendering', `Rendering ${Math.round(msg.fraction * 100)}%`);
        return;
      }
      worker.removeEventListener('message', onMessage);
      if (msg.type === 'error') reject(new Error(msg.message));
      else {
        player.load(msg.left, msg.right, 44_100, score.plan.loop === true);
        timeline.setScore(score, msg.left, msg.right);
        resolve({ score, wav: msg.wav, frames: msg.frames, stats: msg.stats });
      }
    };
    worker.addEventListener('message', onMessage);
    const request: RenderRequestMessage = { type: 'render', id, score };
    worker.postMessage(request);
  });
}

async function summon(event: Event): Promise<void> {
  event.preventDefault();
  const seed = Math.max(0, Math.floor(Number(els.seed.value) || 0)) >>> 0;
  els.seed.value = String(seed);
  const seconds = els.seconds.value.trim() ? Number(els.seconds.value) : undefined;
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds < 5 || seconds > 300)) {
    setStatus('error', 'Length must be 5 to 300 seconds');
    els.seconds.focus();
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

  player.stop();
  setReady(false);
  els.summon.disabled = true;
  els.progress.style.width = '0%';
  try {
    setStatus('composing', 'Composing');
    const score = await scoreFromRequest(director, request);
    els.title.textContent = score.plan.title;
    els.meta.textContent = describe(score);
    els.notes.textContent = score.plan.directorNotes ?? '';
    timeline.setScore(score);
    chip.set(score, undefined);
    setStatus('rendering', 'Rendering 0%');
    current = await render(score);
    chip.set(score, current.frames);
    const s = current.stats;
    els.stats.textContent = `${s.noteCount} notes on ${score.tracks.length} channels, up to ${s.maxVoices} voices at once. True peak ${s.truePeakDb.toFixed(1)} dBTP. Rendered in ${(s.renderMs / 1000).toFixed(1)} s in your browser.`;
    els.progress.style.width = '100%';
    setReady(true);
    setStatus('ready', 'Ready');
    lastRequest = request;
    history.replaceState(null, '', `?${shareParams(request).toString()}`);
    document.body.dataset.cue = 'ready';
  } catch (error) {
    setStatus('error', (error as Error).message.slice(0, 120));
  } finally {
    els.summon.disabled = false;
  }
}

async function togglePlay(): Promise<void> {
  if (!current) return;
  if (player.playing) {
    player.pause();
    els.play.textContent = 'Play';
    setStatus('ready', 'Paused');
  } else {
    await player.play();
    els.play.textContent = 'Pause';
    setStatus('playing', 'Playing');
  }
}

player.onEnded = () => {
  els.play.textContent = 'Play';
  setStatus('ready', 'Ready');
};

function frame(): void {
  const pos = player.position;
  timeline.draw(pos);
  chip.draw(pos);
  scope.draw(player.analyser, player.playing);
  els.clock.textContent = `${formatTime(pos)} / ${formatTime(current?.score.durationSec ?? 0)}`;
  els.clock.dataset.position = pos.toFixed(2);
  requestAnimationFrame(frame);
}

buildMoods();
buildExamples();
els.directorName.textContent = `Director: ${director.label}`;
els.scene.addEventListener('input', updateHeard);
els.form.addEventListener('submit', (e) => void summon(e));
els.reroll.addEventListener('click', () => {
  els.seed.value = String(Math.floor(Math.random() * 100_000));
});
els.play.addEventListener('click', () => void togglePlay());
els.timeline.addEventListener('click', (e) => {
  if (!current) return;
  const rect = els.timeline.getBoundingClientRect();
  void player.seek(timeline.timeAt(e.clientX - rect.left));
});
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
els.exportJson.addEventListener('click', () => {
  if (!current) return;
  download(JSON.stringify(current.score, null, 2), 'application/json', `fright-score-${slug(current.score.plan.title)}-seed${current.score.seed}.json`);
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && current && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement)) {
    e.preventDefault();
    void togglePlay();
  }
});
requestAnimationFrame(frame);
if (loadFromUrl()) els.form.requestSubmit();
