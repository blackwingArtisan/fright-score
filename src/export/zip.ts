/**
 * A small store-only zip writer (no compression) and a reader that checks what it wrote.
 * Entries carry a fixed timestamp (1980-01-01), so the same files always give the same bytes.
 */

export interface ZipEntry {
  /** Path inside the archive, forward slashes, no leading slash. */
  name: string;
  data: Uint8Array | string;
}

export interface ZipFile {
  name: string;
  data: Uint8Array;
  crc32: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
/** DOS date 1980-01-01 and time 00:00:00. */
const DOS_DATE = 0x0021;
const DOS_TIME = 0;
/** General-purpose flag bit 11: names are UTF-8. */
const FLAG_UTF8 = 0x0800;
const VERSION = 20;
const MAX_ENTRIES = 0xffff;
const MAX_SIZE = 0xffffffff;

let crcTable: Uint32Array | undefined;

function table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

/** CRC-32 (IEEE 802.3, the one zip uses) of some bytes. */
export function crc32(bytes: Uint8Array): number {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Writes a zip archive whose entries are stored as they are. */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length > MAX_ENTRIES) throw new Error('Too many files for a zip archive');
  const seen = new Set<string>();
  const prepared = entries.map((entry) => {
    if (entry.name === '' || entry.name.startsWith('/') || entry.name.includes('\\')) throw new Error(`Bad zip path: ${entry.name}`);
    if (seen.has(entry.name)) throw new Error(`Duplicate zip path: ${entry.name}`);
    seen.add(entry.name);
    const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    return { name: encoder.encode(entry.name), data, crc: crc32(data) };
  });

  let total = 22;
  for (const e of prepared) total += 30 + e.name.length + e.data.length + 46 + e.name.length;
  if (total > MAX_SIZE) throw new Error('The archive is too large for a plain zip file');

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let pos = 0;
  const offsets: number[] = [];
  for (const e of prepared) {
    offsets.push(pos);
    view.setUint32(pos, LOCAL_SIGNATURE, true);
    view.setUint16(pos + 4, VERSION, true);
    view.setUint16(pos + 6, FLAG_UTF8, true);
    view.setUint16(pos + 8, 0, true); // method 0: stored
    view.setUint16(pos + 10, DOS_TIME, true);
    view.setUint16(pos + 12, DOS_DATE, true);
    view.setUint32(pos + 14, e.crc, true);
    view.setUint32(pos + 18, e.data.length, true);
    view.setUint32(pos + 22, e.data.length, true);
    view.setUint16(pos + 26, e.name.length, true);
    view.setUint16(pos + 28, 0, true);
    out.set(e.name, pos + 30);
    out.set(e.data, pos + 30 + e.name.length);
    pos += 30 + e.name.length + e.data.length;
  }
  const centralStart = pos;
  prepared.forEach((e, i) => {
    view.setUint32(pos, CENTRAL_SIGNATURE, true);
    view.setUint16(pos + 4, VERSION, true);
    view.setUint16(pos + 6, VERSION, true);
    view.setUint16(pos + 8, FLAG_UTF8, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, DOS_TIME, true);
    view.setUint16(pos + 14, DOS_DATE, true);
    view.setUint32(pos + 16, e.crc, true);
    view.setUint32(pos + 20, e.data.length, true);
    view.setUint32(pos + 24, e.data.length, true);
    view.setUint16(pos + 28, e.name.length, true);
    // Extra field, comment, disk number and internal attributes stay 0; external attributes mark a plain file.
    view.setUint32(pos + 38, 0x81a40000, true);
    view.setUint32(pos + 42, offsets[i], true);
    out.set(e.name, pos + 46);
    pos += 46 + e.name.length;
  });
  view.setUint32(pos, END_SIGNATURE, true);
  view.setUint16(pos + 8, prepared.length, true);
  view.setUint16(pos + 10, prepared.length, true);
  view.setUint32(pos + 12, pos - centralStart, true);
  view.setUint32(pos + 16, centralStart, true);
  return out;
}

/**
 * Reads a stored zip archive through its central directory and checks every CRC-32 against the data.
 * Throws on anything it does not understand (a compressed entry, a bad signature, a CRC mismatch).
 */
export function readZip(bytes: Uint8Array): ZipFile[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== END_SIGNATURE) end--;
  if (end < 0) throw new Error('Not a zip archive: no end-of-directory record');
  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  const files: ZipFile[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== CENTRAL_SIGNATURE) throw new Error('Bad central directory entry');
    const method = view.getUint16(pos + 10, true);
    const crc = view.getUint32(pos + 16, true);
    const size = view.getUint32(pos + 24, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localAt = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    if (method !== 0) throw new Error(`${name}: only stored entries are supported`);
    if (view.getUint32(localAt, true) !== LOCAL_SIGNATURE) throw new Error(`${name}: bad local header`);
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const data = bytes.subarray(dataAt, dataAt + size);
    if (data.length !== size) throw new Error(`${name}: truncated data`);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC-32 mismatch`);
    files.push({ name, data, crc32: crc });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
