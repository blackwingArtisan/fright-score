import { describe, expect, it } from 'vitest';
import { parseTimePhrase, readScene } from '../../src/score/scene';

describe('time phrases', () => {
  it.each([
    ['1:30', 90],
    ['0:70', 70],
    ['70s', 70],
    ['70 sec', 70],
    ['70 seconds', 70],
    ['1.5 min', 90],
    ['2 minutes', 120],
    ['1m10s', 70],
    ['45', 45],
  ])('parses %s as %d seconds', (text, sec) => {
    expect(parseTimePhrase(text)).toBe(sec);
  });

  it('rejects nonsense', () => {
    expect(parseTimePhrase('soon')).toBeUndefined();
  });
});

describe('scene reader', () => {
  it('reads the canonical brief', () => {
    const r = readScene('creeping dread, 90 seconds, builds to a sting at 0:70');
    expect(r.mood).toBe('dread');
    expect(r.durationSec).toBe(90);
    expect(r.stingAtSec).toEqual([70]);
    expect(r.shape).toBe('build');
  });

  it('does not mistake a cue time for the length', () => {
    const r = readScene('jump scare at 40s in a 45s lullaby for a doll');
    expect(r.durationSec).toBe(45);
    expect(r.stingAtSec).toEqual([40]);
    expect(r.mood).toBe('lullaby');
    expect(r.nouns).toContain('doll');
  });

  it('finds several cues and hits', () => {
    const r = readScene('someone is following her down the hallway, 1:30 long, hit at 30s and a scream at 1:20');
    expect(r.mood).toBe('stalker');
    expect(r.durationSec).toBe(90);
    expect(r.hitAtSec).toEqual([30]);
    expect(r.stingAtSec).toEqual([80]);
  });

  it.each([
    ['Zombies chase us through the mall', 'chase'],
    ['cult chanting around the altar', 'ritual'],
    ['a broken music box in the nursery', 'lullaby'],
    ['fog rolls over the abandoned cemetery', 'dread'],
  ])('maps "%s" to %s', (scene, mood) => {
    expect(readScene(scene).mood).toBe(mood);
  });

  it('flags a jump scare without a time', () => {
    const r = readScene('slow walk to the cellar door, then a jump scare');
    expect(r.wantsJumpScare).toBe(true);
    expect(r.stingAtSec).toEqual([]);
  });

  it('returns no mood for an unrelated text', () => {
    expect(readScene('quarterly budget review').mood).toBeUndefined();
  });
});
