#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createDirector } from '../director';
import { renderScore } from '../engine/render';
import { scoreFromRequest } from '../score/pipeline';
import { readScene, parseTimePhrase } from '../score/scene';
import { MOODS, type Mood } from '../score/schema';
import { MODE_LABELS, formatTime } from '../score/theory';
import { scoreToVgm } from '../export/vgm';
import { encodeWav } from '../wav/wav';

const HELP = `Fright Score: render an original, royalty-free horror cue to a WAV file.

Usage:
  npm run score -- [options]

Options:
  --mood <name>       ${MOODS.join(' | ')} (default: read from --scene, else dread)
  --scene <text>      Scene description, e.g. "creeping dread, builds to a sting at 1:10"
  --seconds <n>       Length in seconds, 5-300 (also accepts 1:30)
  --sting <times>     Sting time(s), comma separated, e.g. 70 or 1:10,1:25
  --seed <n>          Seed; the same seed always gives the same file (default: 13)
  --out <file.wav>    Output WAV path (default: fright-cue.wav)
  --loop              Seamless loop for games: whole bars, no fades, loop points in the WAV
  --json <file.json>  Also write the realized score as JSON
  --vgm <file.vgm>    Also write a Sega Genesis (YM2612) version as a VGM file
  --director <kind>   local | bedrock (default: FRIGHT_DIRECTOR or local)
  --quiet             Only print the output path
  --help              Show this help

Output: 44.1 kHz, 16-bit, stereo PCM WAV, true-peak ceiling -3 dBFS, a loudness
ceiling per mood (-14 to -18 LUFS), with a 0.3 s fade-in and a fade-out.`;

export interface CliResult {
  outPath: string;
  bytes: number;
}

function parseTimes(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const times = value
    .split(',')
    .map((v) => parseTimePhrase(v))
    .filter((v): v is number => v !== undefined && v > 0);
  return times.length > 0 ? times : undefined;
}

export async function runCli(argv: string[], env: Record<string, string | undefined>, log: (line: string) => void): Promise<CliResult | undefined> {
  const { values } = parseArgs({
    args: argv,
    options: {
      mood: { type: 'string' },
      scene: { type: 'string' },
      seconds: { type: 'string' },
      sting: { type: 'string' },
      seed: { type: 'string', default: '13' },
      out: { type: 'string', default: 'fright-cue.wav' },
      json: { type: 'string' },
      vgm: { type: 'string' },
      loop: { type: 'boolean', default: false },
      director: { type: 'string' },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    log(HELP);
    return undefined;
  }

  if (values.mood && !(MOODS as readonly string[]).includes(values.mood)) {
    throw new Error(`Unknown mood "${values.mood}". Use one of: ${MOODS.join(', ')}`);
  }
  const seed = Number.parseInt(values.seed ?? '13', 10);
  if (!Number.isFinite(seed) || seed < 0) throw new Error(`--seed must be a non-negative integer`);
  const durationSec = values.seconds ? parseTimePhrase(values.seconds) : undefined;
  if (values.seconds && (durationSec === undefined || durationSec < 5 || durationSec > 300)) {
    throw new Error('--seconds must be between 5 and 300');
  }

  const request = {
    seed,
    ...(values.scene ? { scene: values.scene } : {}),
    ...(values.mood ? { mood: values.mood as Mood } : {}),
    ...(durationSec ? { durationSec } : {}),
    ...(parseTimes(values.sting) ? { stingAtSec: parseTimes(values.sting) } : {}),
    ...(values.loop ? { loop: true } : {}),
  };
  if (values.scene && !request.stingAtSec) {
    const reading = readScene(values.scene);
    if (reading.stingAtSec.length > 0) Object.assign(request, { stingAtSec: reading.stingAtSec });
  }

  const director = createDirector(values.director ?? env.FRIGHT_DIRECTOR, env);
  const score = await scoreFromRequest(director, request);
  const result = renderScore(score);
  const wav = encodeWav(result, { ditherSeed: seed ^ 0x5eed, loop: score.plan.loop === true });
  const outPath = resolve(values.out ?? 'fright-cue.wav');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, wav);
  if (values.json) {
    const jsonPath = resolve(values.json);
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify(score, null, 2));
  }
  let vgmLine: string | undefined;
  if (values.vgm) {
    const vgmPath = resolve(values.vgm);
    const vgm = scoreToVgm(score);
    mkdirSync(dirname(vgmPath), { recursive: true });
    writeFileSync(vgmPath, vgm.bytes);
    const s = vgm.stats;
    vgmLine = `Wrote ${vgmPath} for the Sega Genesis: ${s.registerWrites} YM2612 register writes, ${s.notes - s.dropped} of ${s.notes} notes on six FM channels.`;
  }

  if (values.quiet) {
    log(outPath);
  } else {
    const plan = score.plan;
    log(`"${plan.title}"  (${director.label})`);
    log(`  ${plan.mood} | ${plan.key.root} ${MODE_LABELS[plan.key.mode]} | ${plan.tempoBpm} BPM | ${formatTime(plan.durationSec)} | seed ${seed}`);
    for (const s of plan.sections) {
      log(`  ${formatTime(s.startSec).padStart(6)}  ${s.name.padEnd(22)} intensity ${s.intensity.toFixed(2)}  [${s.layers.join(', ')}]`);
    }
    for (const c of plan.cues) {
      const detail =
        c.kind === 'riser' ? ` (builds from ${formatTime(c.atSec - (c.lengthSec ?? 4))})` : c.kind === 'silence' ? ` (${c.lengthSec ?? 0.6}s gap)` : '';
      log(`  ${formatTime(c.atSec).padStart(6)}  cue: ${c.kind}${detail}`);
    }
    log(`  ${result.stats.noteCount} notes, up to ${result.stats.maxVoices} voices, true peak ${result.stats.truePeakDb.toFixed(1)} dBTP, ${result.stats.loudnessLufs.toFixed(1)} LUFS, rendered in ${result.stats.renderMs} ms`);
    if (plan.loop) log('  Seamless loop: no fades, loop points written to the WAV smpl chunk.');
    log(`Wrote ${outPath} (${(wav.byteLength / 1024 / 1024).toFixed(1)} MB, 44.1 kHz 16-bit stereo). Royalty-free: it is yours.`);
    if (vgmLine) log(vgmLine);
  }
  return { outPath, bytes: wav.byteLength };
}

const isMain = (() => {
  const entry = process.argv[1] ?? '';
  return /src[\\/]cli[\\/]score\.ts$/.test(entry);
})();

if (isMain) {
  runCli(process.argv.slice(2), process.env, (line) => console.log(line)).catch((error: unknown) => {
    console.error(`fright-score: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
