import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const kiro = join(root, '.kiro');

/** The counts sentence that README.md, KIRO-LOG.md and the Devpost write-up all carry. */
const COUNTS =
  /(\d+) specs, (\d+) steering files \(([\w, ]+)\), (\d+) kiro-cli hooks, (\d+) IDE hooks, (\d+) custom agents?, (\d+) MCP servers including its own/;

interface Counts {
  specs: number;
  steering: number;
  inclusionModes: string[];
  kiroCliHooks: number;
  ideHooks: number;
  agents: number;
  mcpServers: number;
}

const list = (dir: string): string[] => (existsSync(join(kiro, dir)) ? readdirSync(join(kiro, dir)) : []);

/** What the .kiro folder actually holds. */
function actualCounts(): Counts {
  const specs = list('specs').filter((d) => ['requirements.md', 'design.md', 'tasks.md'].every((f) => existsSync(join(kiro, 'specs', d, f))));
  const steering = list('steering').filter((f) => f.endsWith('.md'));
  const modes = steering.map((f) => /^---\n[\s\S]*?inclusion: (\w+)[\s\S]*?\n---/.exec(readFileSync(join(kiro, 'steering', f), 'utf8'))?.[1] ?? `none (${f})`);
  const mcp = JSON.parse(readFileSync(join(kiro, 'settings', 'mcp.json'), 'utf8')) as { mcpServers: Record<string, unknown> };
  return {
    specs: specs.length,
    steering: steering.length,
    inclusionModes: [...new Set(modes)].sort(),
    kiroCliHooks: list('hooks').filter((f) => f.endsWith('.json')).length,
    ideHooks: list('hooks').filter((f) => f.endsWith('.kiro.hook')).length,
    agents: list('agents').filter((f) => f.endsWith('.json')).length,
    mcpServers: Object.keys(mcp.mcpServers).length,
  };
}

/** The documents that carry the sentence; the Devpost write-up is checked only when it exists. */
const documents = ['README.md', 'KIRO-LOG.md', 'docs/writeups/devpost.md'].filter((f) => existsSync(join(root, f)));

describe('the Kiro workspace counts stay true', () => {
  const actual = actualCounts();

  it('counts what the .kiro folder holds', () => {
    expect(actual.specs, 'spec folders with requirements.md, design.md and tasks.md').toBeGreaterThan(0);
    expect(actual.steering).toBeGreaterThan(0);
  });

  it('registers the fright-score MCP server that runs scripts/mcp/fright-score-mcp.ts', () => {
    const mcp = JSON.parse(readFileSync(join(kiro, 'settings', 'mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { command: string; args?: string[] }>;
    };
    const own = Object.values(mcp.mcpServers).filter((s) => (s.args ?? []).includes('scripts/mcp/fright-score-mcp.ts'));
    expect(own, 'an MCP server that runs scripts/mcp/fright-score-mcp.ts').toHaveLength(1);
    expect(existsSync(join(root, 'scripts/mcp/fright-score-mcp.ts'))).toBe(true);
  });

  it.each(documents)('%s carries the counts sentence once, and every number in it is true', (file) => {
    const text = readFileSync(join(root, file), 'utf8');
    const matches = [...text.matchAll(new RegExp(COUNTS, 'g'))];
    expect(matches, `${file}: the counts sentence ("N specs, N steering files (...), ...") is missing or appears more than once`).toHaveLength(1);
    const [, specs, steering, modes, cliHooks, ideHooks, agents, servers] = matches[0];
    const checks: [string, string, number][] = [
      ['specs', specs, actual.specs],
      ['steering files', steering, actual.steering],
      ['kiro-cli hooks', cliHooks, actual.kiroCliHooks],
      ['IDE hooks', ideHooks, actual.ideHooks],
      ['custom agents', agents, actual.agents],
      ['MCP servers', servers, actual.mcpServers],
    ];
    for (const [label, said, real] of checks) {
      expect(Number(said), `${file} says ${said} ${label}, but .kiro has ${real}`).toBe(real);
    }
    const named = modes.split(',').map((m) => m.trim()).sort();
    expect(named, `${file} names the steering inclusion modes (${named.join(', ')}), but .kiro/steering uses (${actual.inclusionModes.join(', ')})`).toEqual(actual.inclusionModes);
  });
});

/** The "Kiro by the numbers" totals that README.md and the Devpost write-up quote from the KIRO-LOG summary. */
const TOTALS = /(\d+) logged Kiro calls, ([\d.]+) credits, ([\d,]+) lines written by Kiro with (\d+) lines? fixed/;

const num = (cell: string): number => Number(cell.replace(/[*,]/g, '').trim());

/** The rows of the KIRO-LOG summary table, and its total row. */
function summaryTable() {
  const text = readFileSync(join(root, 'KIRO-LOG.md'), 'utf8');
  const section = text.slice(text.indexOf('## Summary'), text.indexOf('\n## ', text.indexOf('## Summary') + 1));
  const rows = section.split('\n').filter((l) => /^\| \d{4}-\d{2}-\d{2} \|/.test(l)).map((l) => l.split('|').slice(1, -1));
  const total = section.split('\n').find((l) => l.includes('**Total**'))!.split('|').slice(1, -1);
  return { rows, total: { credits: num(total[4]), kiroLines: num(total[5]), fixLines: num(total[6]) } };
}

describe('the Kiro totals stay true', () => {
  const { rows, total } = summaryTable();

  it('the KIRO-LOG total row is the sum of its session rows', () => {
    const credits = rows.reduce((sum, r) => sum + (Number.isFinite(num(r[4])) ? num(r[4]) : 0), 0);
    const kiroLines = rows.reduce((sum, r) => sum + num(r[5]), 0);
    const fixLines = rows.reduce((sum, r) => sum + (Number.isFinite(num(r[6])) ? num(r[6]) : 0), 0);
    expect(credits.toFixed(2), 'credits').toBe(total.credits.toFixed(2));
    expect(kiroLines, 'Kiro lines').toBe(total.kiroLines);
    expect(fixLines, 'fix lines').toBe(total.fixLines);
  });

  it.each(['README.md', 'docs/writeups/devpost.md'].filter((f) => existsSync(join(root, f))))(
    '%s quotes the KIRO-LOG totals',
    (file) => {
      const match = TOTALS.exec(readFileSync(join(root, file), 'utf8'));
      expect(match, `${file}: the "N logged Kiro calls, N credits, N lines written by Kiro" line is missing`).not.toBeNull();
      const [, calls, credits, kiroLines, fixLines] = match!;
      expect(Number(calls), `${file} says ${calls} calls, the KIRO-LOG summary has ${rows.length}`).toBe(rows.length);
      expect(Number(credits), `${file} credits`).toBe(total.credits);
      expect(num(kiroLines), `${file} Kiro lines`).toBe(total.kiroLines);
      expect(Number(fixLines), `${file} fix lines`).toBe(total.fixLines);
    },
  );
});
