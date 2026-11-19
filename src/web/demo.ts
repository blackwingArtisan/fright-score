/**
 * The demo cue shown on first load. The page plays a pre-rendered preview of it at once, renders it live in
 * the background, and checks the live WAV against this hash. `tests/cli/samples.test.ts` checks that the CLI
 * renders the same request to exactly these bytes, so the browser, the CLI and the published hash agree.
 */
export const DEMO_SCENE = 'Creeping dread in the cellar, 90 seconds, builds to a sting at 1:10';
export const DEMO_SEED = 13;
/** sha256 of the demo cue's WAV, as the CLI renders it: `npm run score -- --scene "<DEMO_SCENE>" --seed 13`. */
export const DEMO_WAV_SHA256 = '04352a45a32f7981b0647aefd434970bbe2d28b40e218bdcc935b8ec213c5c23';

/** Hex sha256 of some bytes, using the browser's (or Node's) Web Crypto. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A hash shortened for display: the first and last eight hex digits. */
export function shortHash(hex: string): string {
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}
