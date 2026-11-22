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

const IDE_TRIGGERS = ['fileEdited', 'fileCreated', 'fileDeleted', 'userTriggered', 'promptSubmit', 'agentStop', 'preToolUse', 'postToolUse', 'preTaskExecution', 'postTaskExecution'];

interface IdeHook {
  enabled: boolean;
  name: string;
  description: string;
  version: string;
  when: { type: string; patterns: string[] };
  then: { type: 'askAgent'; prompt: string } | { type: 'runCommand'; command: string };
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

  it('every Kiro IDE hook file parses, has a known trigger with patterns, and runs only npm scripts that exist', () => {
    const files = readdirSync(join(kiro, 'hooks')).filter((f) => f.endsWith('.kiro.hook'));
    expect(files, 'the IDE hook files').toEqual(expect.arrayContaining(['test-on-save.kiro.hook', 'determinism-guard.kiro.hook', 'mcp-golden-cue.kiro.hook']));
    for (const file of files) {
      const hook = JSON.parse(readFileSync(join(kiro, 'hooks', file), 'utf8')) as IdeHook;
      expect(typeof hook.name, `${file}: name`).toBe('string');
      expect(typeof hook.description, `${file}: description`).toBe('string');
      expect(typeof hook.enabled, `${file}: enabled`).toBe('boolean');
      expect(hook.version, `${file}: version`).toBeTruthy();
      expect(IDE_TRIGGERS, `${file}: when.type`).toContain(hook.when.type);
      expect(hook.when.patterns.length, `${file}: when.patterns`).toBeGreaterThan(0);
      for (const p of hook.when.patterns) expect(p.trim(), `${file}: empty pattern`).not.toBe('');
      expect(['askAgent', 'runCommand'], `${file}: then.type`).toContain(hook.then.type);
      if (hook.then.type === 'askAgent') {
        expect(hook.then.prompt.trim().length, `${file}: prompt`).toBeGreaterThan(0);
        continue;
      }
      const script = npmScript(hook.then.command);
      expect(script, `${file}: runCommand must be an "npm run <script>" command`).toBeDefined();
      expect(scripts, `${file}: npm script "${script}"`).toContain(script);
    }
  });

  it('the IDE hooks mirror the cli hooks they extend, and the golden-cue hook names the README hash', () => {
    const ide = (name: string) => JSON.parse(readFileSync(join(kiro, 'hooks', name), 'utf8')) as IdeHook;
    expect(ide('test-on-save.kiro.hook').then).toEqual({ type: 'runCommand', command: 'npm run test:unit' });
    expect(ide('determinism-guard.kiro.hook').then).toEqual({ type: 'runCommand', command: 'npm run check:determinism' });
    const golden = ide('mcp-golden-cue.kiro.hook');
    expect(golden.then.type).toBe('askAgent');
    const prompt = golden.then.type === 'askAgent' ? golden.then.prompt : '';
    const hash = /"sha256": "([0-9a-f]{64})"/.exec(readFileSync(join(root, 'README.md'), 'utf8'))?.[1];
    expect(hash).toBeDefined();
    expect(prompt).toContain(hash);
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
