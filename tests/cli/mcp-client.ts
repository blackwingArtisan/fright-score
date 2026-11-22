import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const root = join(__dirname, '../..');
const script = join(root, 'scripts/mcp/fright-score-mcp.ts');
// `--import tsx`, written as the loader's absolute URL because the server runs from a temporary folder.
const tsxLoader = pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href;

/** A new temporary folder with its symbolic links resolved (the server compares real paths). */
export function makeTempDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

export interface Reply {
  jsonrpc: string;
  id: number | null;
  result?: Record<string, any>;
  error?: { code: number; message: string };
}

/** A minimal MCP client: one JSON line per message, replies matched by id. */
export class Client {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stdoutLines: string[] = [];
  stderr = '';
  readonly exited: Promise<number | null>;
  private buffer = '';
  private nextId = 1;
  private waiting = new Map<number | null, (reply: Reply) => void>();
  private nullIdReplies: Reply[] = [];

  constructor(cwd: string) {
    // No AWS_* variables, and a Bedrock request that the server must ignore.
    const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', FRIGHT_DIRECTOR: 'bedrock' };
    this.child = spawn(process.execPath, ['--import', tsxLoader, script], { cwd, env });
    this.child.stderr.on('data', (d: Buffer) => (this.stderr += d.toString()));
    this.child.stdout.on('data', (d: Buffer) => {
      this.buffer += d.toString();
      let at: number;
      while ((at = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, at);
        this.buffer = this.buffer.slice(at + 1);
        this.stdoutLines.push(line);
        const reply = JSON.parse(line) as Reply;
        const waiter = this.waiting.get(reply.id);
        if (waiter) {
          this.waiting.delete(reply.id);
          waiter(reply);
        } else if (reply.id === null) this.nullIdReplies.push(reply);
      }
    });
    this.exited = new Promise((resolve) => this.child.on('close', (code) => resolve(code)));
  }

  raw(line: string): void {
    this.child.stdin.write(`${line}\n`);
  }

  private wait(id: number | null): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const queued = id === null ? this.nullIdReplies.shift() : undefined;
      if (queued) return resolve(queued);
      const timer = setTimeout(() => reject(new Error(`no reply for id ${id}; stderr: ${this.stderr}`)), 50_000);
      this.waiting.set(id, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
    });
  }

  request(method: string, params?: unknown): Promise<Reply> {
    const id = this.nextId++;
    const reply = this.wait(id);
    this.raw(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }));
    return reply;
  }

  notify(method: string): void {
    this.raw(JSON.stringify({ jsonrpc: '2.0', method }));
  }

  /** The reply to a line that is not valid JSON carries `id: null`. */
  garbage(line: string): Promise<Reply> {
    const reply = this.wait(null);
    this.raw(line);
    return reply;
  }

  async call(name: string, args?: unknown): Promise<Reply> {
    return this.request('tools/call', { name, ...(args === undefined ? {} : { arguments: args }) });
  }

  async close(): Promise<number | null> {
    this.child.stdin.end();
    return this.exited;
  }
}
