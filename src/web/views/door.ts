import loopUrl from '../../../examples/godot/audio/stalker-loop.wav?url';
import stingUrl from '../../../examples/godot/audio/door-slam-sting.wav?url';
import { DOOR_TIMING, formatOffset, planScare } from './door-timing';

/**
 * The door scene: a rendered loop plays as ambience, a door event cuts it, and a rendered sting lands its hit
 * 0.6 s later. Both sounds are the files the Godot example plays. Nothing here is synthesized in real time.
 */

type DoorState = 'idle' | 'loading' | 'ambient' | 'scaring' | 'returning' | 'error';

const SAMPLE_RATE = 44_100;
const IDLE_OFFSET = 'Enter the hallway, then open the door to measure the scare.';
const LOCKED_HINT = 'The door is locked until you enter the hallway. Press E while this scene has focus to open it.';
const OPEN_HINT = 'Press E while this scene has focus, or click the door, to open it.';

interface Graph {
  ctx: AudioContext;
  loop: AudioBuffer;
  sting: AudioBuffer;
  ambience: GainNode;
  loopSource: AudioBufferSourceNode;
  stingSource: AudioBufferSourceNode | null;
}

export class DoorScene {
  private state: DoorState = 'idle';
  private graph: Graph | null = null;
  private buffers: { loop: AudioBuffer; sting: AudioBuffer } | null = null;
  private timers: number[] = [];
  private generation = 0;

  private readonly enterBtn: HTMLButtonElement;
  private readonly leaveBtn: HTMLButtonElement;
  private readonly doorBtn: HTMLButtonElement;
  private readonly offset: HTMLElement;
  private readonly announceEl: HTMLElement;
  private readonly hint: HTMLElement;

  constructor(private readonly root: HTMLElement) {
    const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
    this.enterBtn = q('#door-enter');
    this.leaveBtn = q('#door-leave');
    this.doorBtn = q('#door');
    this.offset = q('#door-offset');
    this.announceEl = q('#door-announce');
    this.hint = q('#door-hint');

    this.enterBtn.addEventListener('click', () => void this.enter());
    this.leaveBtn.addEventListener('click', () => this.leave('You left the hallway. The scene is silent.'));
    this.doorBtn.addEventListener('click', () => this.openDoor());
    root.querySelector('.door__frame')?.addEventListener('click', () => this.openDoor());
    root.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state !== 'idle') this.leave('The page was hidden, so the scene went quiet.');
    });
    this.render();
  }

  /** The scene's AudioContext, or null while it is closed. Exposed for tests of "Leave the hallway". */
  get context(): AudioContext | null {
    return this.graph?.ctx ?? null;
  }

  private setState(next: DoorState): void {
    this.state = next;
    this.render();
  }

  private render(): void {
    const s = this.state;
    this.root.dataset.state = s;
    const inScene = s === 'ambient' || s === 'scaring' || s === 'returning';
    this.enterBtn.hidden = inScene;
    this.enterBtn.disabled = s === 'loading';
    this.enterBtn.textContent = s === 'loading' ? 'Loading the hallway' : s === 'error' ? 'Try the hallway again' : 'Enter the hallway';
    this.leaveBtn.hidden = !inScene;
    const open = s === 'ambient';
    this.doorBtn.setAttribute('aria-disabled', String(!open));
    this.root.classList.toggle('is-open', s === 'scaring');
    this.hint.textContent =
      s === 'error' ? 'The scene could not load its two audio files. The rest of the app still works.' : open ? OPEN_HINT : inScene ? 'The door is busy. It opens again when the sound returns.' : LOCKED_HINT;
  }

  private announce(text: string): void {
    this.announceEl.textContent = text;
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }

  private async load(ctx: AudioContext): Promise<{ loop: AudioBuffer; sting: AudioBuffer }> {
    if (this.buffers) return this.buffers;
    const decode = async (url: string): Promise<AudioBuffer> => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return ctx.decodeAudioData(await res.arrayBuffer());
    };
    const [loop, sting] = await Promise.all([decode(loopUrl), decode(stingUrl)]);
    this.buffers = { loop, sting };
    return this.buffers;
  }

  private async enter(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'error') return;
    const generation = ++this.generation;
    this.setState('loading');
    this.announce('Loading the hallway.');
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      await ctx.resume();
      const { loop, sting } = await this.load(ctx);
      if (generation !== this.generation) {
        void ctx.close().catch(() => undefined);
        return;
      }
      const ambience = ctx.createGain();
      ambience.connect(ctx.destination);
      const loopSource = ctx.createBufferSource();
      loopSource.buffer = loop;
      loopSource.loop = true;
      loopSource.loopStart = 0;
      loopSource.loopEnd = loop.duration;
      loopSource.connect(ambience);
      loopSource.start();
      this.graph = { ctx, loop, sting, ambience, loopSource, stingSource: null };
      this.offset.textContent = IDLE_OFFSET;
      this.setState('ambient');
      this.announce('You are in the hallway. The door is ready.');
    } catch {
      if (generation !== this.generation) return;
      void ctx?.close().catch(() => undefined);
      this.graph = null;
      this.setState('error');
      this.offset.textContent = 'The scene could not load.';
      this.announce('The scene could not load its audio files.');
    }
  }

  private leave(message: string): void {
    this.generation++;
    this.clearTimers();
    const g = this.graph;
    this.graph = null;
    if (g) {
      try {
        g.loopSource.stop();
        g.stingSource?.stop();
      } catch {
        // A source that already ended throws on stop(); closing the context silences it anyway.
      }
      void g.ctx.close().catch(() => undefined);
    }
    this.offset.textContent = IDLE_OFFSET;
    this.setState('idle');
    this.announce(message);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key !== 'e' && e.key !== 'E') return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (this.state !== 'ambient' || !this.root.contains(document.activeElement)) return;
    e.preventDefault();
    e.stopPropagation();
    this.openDoor();
  }

  /** One door event. Only the ambient state accepts it. */
  private openDoor(): void {
    const g = this.graph;
    if (this.state !== 'ambient' || !g) return;
    const { ctx } = g;
    const eventSec = ctx.currentTime;
    const plan = planScare(eventSec);
    this.setState('scaring');

    g.ambience.gain.cancelScheduledValues(plan.cutStartSec);
    g.ambience.gain.setValueAtTime(1, plan.cutStartSec);
    g.ambience.gain.linearRampToValueAtTime(0, plan.cutEndSec);

    const source = ctx.createBufferSource();
    source.buffer = g.sting;
    source.connect(ctx.destination);
    source.start(plan.stingStartSec, plan.stingOffsetSec);
    g.stingSource = source;

    const measuredSec = plan.hitSec - eventSec;
    this.announce('The door opened. The loop cut out.');
    const toMs = (sec: number): number => Math.max(0, sec * 1000);
    this.later(() => {
      this.offset.textContent = `Sting landed ${formatOffset(measuredSec)} s after the door opened`;
      this.announce(`The hit landed ${formatOffset(measuredSec)} seconds after the door opened.`);
    }, toMs(plan.hitDelaySec) + 30);

    const returnAtSec = plan.hitSec + DOOR_TIMING.ringSec;
    this.later(() => {
      if (!this.graph) return;
      const now = this.graph.ctx.currentTime;
      this.graph.ambience.gain.cancelScheduledValues(now);
      this.graph.ambience.gain.setValueAtTime(0, now);
      this.graph.ambience.gain.linearRampToValueAtTime(1, now + DOOR_TIMING.returnSec);
      this.setState('returning');
      this.announce('The loop is coming back.');
    }, toMs(returnAtSec - eventSec));

    this.later(() => {
      this.setState('ambient');
      this.announce('The loop is back. The door is ready again.');
    }, toMs(returnAtSec - eventSec + DOOR_TIMING.returnSec));
  }
}

/** The only export main.ts calls. */
export function mountDoorScene(root: HTMLElement): DoorScene {
  return new DoorScene(root);
}
