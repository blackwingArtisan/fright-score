import { describeWrite, parseVgm, VGM_SAMPLE_RATE, type VgmResult, type VgmWrite } from '../../export/vgm';
import type { Score } from '../../score/schema';
import { formatTime } from '../../score/theory';

/** Register writes shown at once, ending at the playhead. */
const VISIBLE_WRITES = 10;

/**
 * The stitch panel: the director's plan as JSON beside the YM2612 register writes it becomes on a
 * Sega Genesis, both following the playhead (the current section lights up, the newest writes scroll in).
 */
export class StitchView {
  private writes: VgmWrite[] = [];
  private sectionEls: HTMLElement[] = [];
  private sections: { startSec: number; endSec: number }[] = [];
  private shownIndex = -2;
  private shownSection = -2;

  constructor(
    private readonly planEl: HTMLElement,
    private readonly listEl: HTMLOListElement,
    private readonly countEl: HTMLElement,
  ) {}

  set(score: Score | undefined, vgm: VgmResult | undefined): void {
    this.writes = vgm ? parseVgm(vgm.bytes).writes : [];
    this.sections = score?.plan.sections ?? [];
    this.shownIndex = -2;
    this.shownSection = -2;
    this.renderPlan(score);
    if (vgm) {
      const s = vgm.stats;
      this.countEl.textContent = `${s.registerWrites.toLocaleString('en-US')} register writes. ${s.notes - s.dropped} of ${s.notes} notes fit on the chip's six FM channels; the sting always gets all six.`;
    } else {
      this.countEl.textContent = '';
    }
  }

  draw(positionSec: number): void {
    const sample = Math.round(positionSec * VGM_SAMPLE_RATE);
    // Last write at or before the playhead (binary search).
    let lo = 0;
    let hi = this.writes.length - 1;
    let index = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.writes[mid].at <= sample) {
        index = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (index !== this.shownIndex) {
      this.shownIndex = index;
      this.renderWrites(index);
    }
    const section = this.sections.findIndex((s) => positionSec >= s.startSec && positionSec < s.endSec);
    if (section !== this.shownSection) {
      this.sectionEls[this.shownSection]?.classList.remove('is-now');
      const now = this.sectionEls[section];
      now?.classList.add('is-now');
      this.shownSection = section;
      // Keep the lit section in view inside the JSON box, without scrolling the page.
      if (now) {
        const box = this.planEl.getBoundingClientRect();
        const row = now.getBoundingClientRect();
        this.planEl.scrollTop += row.top - box.top - box.height / 3;
      }
    }
  }

  private renderWrites(index: number): void {
    const from = Math.max(0, index - VISIBLE_WRITES + 1);
    const rows: HTMLLIElement[] = [];
    for (let i = from; i <= index; i++) {
      const w = this.writes[i];
      const label = describeWrite(w);
      const li = document.createElement('li');
      li.className = `stitch__write${label.name === 'KEY ON' ? ' stitch__write--on' : ''}`;
      const where = label.channel === undefined ? 'GLOBAL' : `CH${label.channel}${label.op ? ` OP${label.op}` : ''}`;
      const cells = [formatTime(w.at / VGM_SAMPLE_RATE), where, label.name, label.detail];
      for (const text of cells) {
        const span = document.createElement('span');
        span.textContent = text;
        li.append(span);
      }
      rows.push(li);
    }
    this.listEl.replaceChildren(...rows);
    this.listEl.dataset.index = String(index);
  }

  private renderPlan(score: Score | undefined): void {
    this.sectionEls = [];
    if (!score) {
      this.planEl.textContent = '';
      return;
    }
    const p = score.plan;
    const q = (v: unknown) => JSON.stringify(v);
    const parts: (string | HTMLElement)[] = [];
    const line = (text: string) => parts.push(`${text}\n`);
    line('{');
    line(`  "title": ${q(p.title)},`);
    line(`  "mood": ${q(p.mood)},`);
    line(`  "key": { "root": ${q(p.key.root)}, "mode": ${q(p.key.mode)} },`);
    line(`  "tempoBpm": ${p.tempoBpm},`);
    line('  "sections": [');
    p.sections.forEach((s, i) => {
      const span = document.createElement('span');
      span.className = 'stitch__section';
      span.textContent = `    { "name": ${q(s.name)}, "startSec": ${s.startSec}, "endSec": ${s.endSec}, "intensity": ${s.intensity}, "layers": ${q(s.layers)} }${i < p.sections.length - 1 ? ',' : ''}\n`;
      this.sectionEls.push(span);
      parts.push(span);
    });
    line('  ],');
    line('  "cues": [');
    p.cues.forEach((c, i) => {
      const extra = c.lengthSec !== undefined ? `, "lengthSec": ${c.lengthSec}` : '';
      line(`    { "kind": ${q(c.kind)}, "atSec": ${c.atSec}${extra} }${i < p.cues.length - 1 ? ',' : ''}`);
    });
    line('  ],');
    line(`  "palette": ${q(p.palette)}`);
    parts.push('}');
    this.planEl.replaceChildren(...parts);
  }
}
