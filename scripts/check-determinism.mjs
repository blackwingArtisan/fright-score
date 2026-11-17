// Fails if unseeded randomness appears in code that must be reproducible by seed.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['src/engine', 'src/score', 'src/director'];
const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.ts')) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/Math\.random\s*\(/.test(line) || /Date\.now\s*\(/.test(line)) {
            offenders.push(`${path}:${i + 1}: ${line.trim()}`);
          }
        });
    }
  }
}

for (const root of roots) walk(root);

if (offenders.length > 0) {
  console.error('Unseeded randomness or clock reads found (use the seeded rng instead):');
  for (const o of offenders) console.error('  ' + o);
  process.exit(1);
}
console.log(`Determinism check passed (${roots.join(', ')}).`);
