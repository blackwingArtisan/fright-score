import { describe, expect, it } from 'vitest';
import { crc32, readZip, writeZip } from '../../src/export/zip';

const text = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
  it('matches the standard check values', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(text('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });
});

describe('store-only zip writer', () => {
  const entries = [
    { name: 'addons/fright_score/plugin.cfg', data: '[plugin]\nname="Fright Score"\n' },
    { name: 'fright_score/loop.wav', data: Uint8Array.from({ length: 5000 }, (_, i) => (i * 31) & 0xff) },
    { name: 'empty.txt', data: new Uint8Array(0) },
    { name: 'README.txt', data: 'Café: naïve ✓' },
  ];

  it('writes entries a reader parses back with matching CRC-32s', () => {
    const files = readZip(writeZip(entries));
    expect(files.map((f) => f.name)).toEqual(entries.map((e) => e.name));
    for (const [i, file] of files.entries()) {
      const expected = typeof entries[i].data === 'string' ? text(entries[i].data as string) : (entries[i].data as Uint8Array);
      expect(Array.from(file.data)).toEqual(Array.from(expected));
      expect(file.crc32).toBe(crc32(expected));
    }
  });

  it('stores the data uncompressed: the archive is the files plus fixed headers', () => {
    const zip = writeZip(entries);
    const names = entries.reduce((n, e) => n + text(e.name).length, 0);
    const data = entries.reduce((n, e) => n + (typeof e.data === 'string' ? text(e.data).length : e.data.length), 0);
    expect(zip.length).toBe(data + names * 2 + entries.length * (30 + 46) + 22);
    expect(new DataView(zip.buffer).getUint32(0, true)).toBe(0x04034b50);
  });

  it('gives the same bytes for the same files', () => {
    expect(Array.from(writeZip(entries))).toEqual(Array.from(writeZip(entries)));
  });

  it('detects a corrupted byte through the CRC-32', () => {
    const zip = writeZip([{ name: 'a.bin', data: text('hello world') }]);
    zip[30 + 5 + 2] ^= 0xff;
    expect(() => readZip(zip)).toThrow(/CRC-32 mismatch/);
  });

  it('rejects duplicate and unsafe paths and non-zip input', () => {
    expect(() => writeZip([{ name: 'a', data: '' }, { name: 'a', data: '' }])).toThrow(/Duplicate/);
    expect(() => writeZip([{ name: '/abs', data: '' }])).toThrow(/Bad zip path/);
    expect(() => writeZip([{ name: 'a\\b', data: '' }])).toThrow(/Bad zip path/);
    expect(() => readZip(text('not a zip archive at all, just text.'))).toThrow(/Not a zip/);
  });
});
