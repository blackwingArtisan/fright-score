import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const kiro = join(root, '.kiro');
const scripts = Object.keys((JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts);
const jsonIn = (dir: string) => readdirSync(join(kiro, dir)).filter((f) => f.endsWith('.json'));
const read = (dir: string, file: string) => JSON.parse(readFileSync(join(kiro, dir, file), 'utf8')) as Record<string, unknown>;

/** The npm script a command runs, e.g. "bench" for "npm run bench --silent". */
const npmScript = (command: string) => /^npm run ([\w:-]+)/.exec(command)?.[1];

interface Hook {
  name: string;
  trigger: string;
  matcher?: string;
  action: { type: 'command'; command: string } | { type: 'agent'; prompt: string };
}

describe('the .kiro workspace stays wired to the repo', () => {
  it('every hook names a known trigger, a valid matcher and an npm script or node script that exists', () => {
    const hooks = jsonIn('hooks').flatMap((f) => (read('hooks', f).hooks as Hook[]).map((h) => ({ file: f, ...h })));
    expect(hooks.map((h) => h.name)).toContain('Render benchmark');
    for (const hook of hooks) {
      expect(['PostFileSave', 'Stop', 'UserTriggered'], hook.file).toContain(hook.trigger);
      if (hook.matcher) expect(() => new RegExp(hook.matcher!), hook.file).not.toThrow();
      if (hook.action.type !== 'command') continue;
      const script = npmScript(hook.action.command);
      if (script) expect(scripts, hook.file).toContain(script);
      else expect(existsSync(join(root, hook.action.command.replace(/^node /, ''))), hook.file).toBe(true);
    }
  });

  it('every steering file declares how it is included, and file-matched ones point at real folders', () => {
    for (const file of readdirSync(join(kiro, 'steering')).filter((f) => f.endsWith('.md'))) {
      const front = /^---\n([\s\S]*?)\n---/.exec(readFileSync(join(kiro, 'steering', file), 'utf8'))?.[1] ?? '';
      const inclusion = /inclusion: (\w+)/.exec(front)?.[1];
      expect(['always', 'fileMatch', 'manual'], file).toContain(inclusion);
      if (inclusion !== 'fileMatch') continue;
      const patterns = JSON.parse(/fileMatchPattern: (.+)/.exec(front)![1]) as string[];
      for (const p of patterns) expect(existsSync(join(root, p.split('/**')[0])), `${file}: ${p}`).toBe(true);
    }
  });

  it('the sound-designer agent loads files that exist and may only run npm scripts that exist', () => {
    const agent = read('agents', 'fs666-sound-designer.json') as {
      name: string;
      resources: string[];
      toolsSettings: { execute_bash: { allowedCommands: string[] } };
    };
    expect(agent.name).toBe('fs666-sound-designer');
    for (const r of agent.resources) expect(existsSync(join(root, r.replace(/^file:\/\//, ''))), r).toBe(true);
    for (const c of agent.toolsSettings.execute_bash.allowedCommands) expect(scripts, c).toContain(npmScript(c));
  });
});
