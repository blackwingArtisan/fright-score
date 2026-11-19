/**
 * Render benchmark: times the demo cue (90 s of dread with a sting at 1:10) end to end, from request to
 * WAV bytes, and prints the median of several runs with the machine's load average beside it.
 *
 *   npm run bench            # 5 runs
 *   npm run bench -- 9       # 9 runs
 */
import { cpus, loadavg } from 'node:os';
import { LocalDirector } from '../src/director/local';
import { renderScore } from '../src/engine/render';
import { scoreFromRequest } from '../src/score/pipeline';
import { encodeWav } from '../src/wav/wav';

const runs = Math.max(1, Number.parseInt(process.argv[2] ?? '5', 10) || 5);
const request = { seed: 13, scene: 'Creeping dread in the cellar, 90 seconds, builds to a sting at 1:10', stingAtSec: [70] };
const director = new LocalDirector();

const times: number[] = [];
for (let i = 0; i < runs; i++) {
  const t0 = performance.now();
  const score = await scoreFromRequest(director, request);
  const result = renderScore(score);
  encodeWav(result, { ditherSeed: request.seed ^ 0x5eed });
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
const audioSec = 90;
console.log(`Demo cue: ${audioSec} s of audio, ${runs} run${runs === 1 ? '' : 's'}`);
console.log(`  median ${(median / 1000).toFixed(2)} s, fastest ${(times[0] / 1000).toFixed(2)} s, slowest ${(times[times.length - 1] / 1000).toFixed(2)} s`);
console.log(`  ${(audioSec / (median / 1000)).toFixed(1)}x faster than real time`);
console.log(`  ${cpus()[0]?.model ?? 'unknown CPU'}, ${cpus().length} cores, load average ${loadavg()[0].toFixed(1)}, Node ${process.version}`);
