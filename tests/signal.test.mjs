import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, syntheticSamples, fft } from '../signal.mjs';

for (const bpm of [48, 60, 72, 91, 120, 150, 174]) {
  test(`recovers a synthetic ${bpm} BPM chromatic pulse`, () => {
    const result = analyze(syntheticSamples({ bpm }));
    assert.equal(result.valid, true, result.reasons.join('; '));
    assert.ok(Math.abs(result.bpm - bpm) < 1, `${result.bpm} vs ${bpm}`);
  });
}
test('recovers nonuniformly timestamped samples after interpolation', () => {
  const s = syntheticSamples({ bpm: 83 }).map((s, i) => ({ ...s, t: s.t + 0.002 * Math.sin(i) }));
  assert.ok(Math.abs(analyze(s).bpm - 83) < 1);
});
test('rejects insufficient duration', () => assert.equal(analyze(syntheticSamples({ seconds: 10 })).valid, false));
test('returns a provisional estimate after three seconds', () => {
  const result = analyze(syntheticSamples({ seconds: 3, bpm: 72 }));
  assert.equal(result.valid, false);
  assert.equal(result.provisional, true);
  assert.ok(Math.abs(result.bpm - 72) < 2);
});
test('does not return a provisional BPM for short noise', () => {
  const result = analyze(syntheticSamples({ seconds: 3, pulse: false, noise: 2 }));
  assert.equal(result.provisional, false);
  assert.equal(result.bpm, null);
});
test('rejects constant video', () => {
  const result = analyze(syntheticSamples().map(s => ({ ...s, r: 140, g: 100, b: 80 })));
  assert.equal(result.valid, false); assert.equal(result.bpm, null);
});
test('rejects independent random RGB noise', () => {
  const result = analyze(syntheticSamples({ pulse: false, noise: 2 }));
  assert.equal(result.valid, false); assert.equal(result.bpm, null);
});
test('rejects long frame gaps', () => {
  const result = analyze(syntheticSamples().filter(s => s.t < 10 || s.t > 11));
  assert.equal(result.valid, false); assert.ok(result.reasons.some(r => r.includes('gap')));
});
test('rejects low frame rate', () => assert.equal(analyze(syntheticSamples({ fps: 8 })).valid, false));
test('rejects overexposed regions', () => assert.equal(analyze(syntheticSamples().map(s => ({ ...s, clipped: 0.3 }))).valid, false));
test('rejects large colour jumps', () => {
  const result = analyze(syntheticSamples().map((s, i) => ({ ...s, r: s.r + (i % 2) * 20 })));
  assert.equal(result.valid, false); assert.ok(result.reasons.some(r => r.includes('motion')));
});
test('invalid inputs never produce a BPM', () => {
  assert.equal(analyze([]).valid, false);
  assert.equal(analyze(syntheticSamples().map(s => ({ ...s, r: NaN }))).valid, false);
  assert.equal(analyze(syntheticSamples().reverse()).valid, false);
});
test('FFT inverse reconstructs the input', () => {
  const re = [1, 2, 3, 4, 5, 6, 7, 8], im = new Array(8).fill(0);
  fft(re, im); fft(re, im, true);
  re.forEach((v, i) => assert.ok(Math.abs(v - i - 1) < 1e-10));
});
test('duplicate frame timestamps are not counted twice', () => {
  const samples = syntheticSamples({ bpm: 87 });
  const result = analyze(samples.flatMap(s => [s, s]));
  assert.equal(result.valid, true); assert.ok(Math.abs(result.bpm - 87) < 1);
  assert.ok(Math.abs(result.fps - 30) < 0.01);
});
test('rejects a frequency change between early and late windows', () => {
  const a = syntheticSamples({ bpm: 65 }), b = syntheticSamples({ bpm: 115 });
  const result = analyze(a.map((s, i) => s.t < 15 ? s : b[i]));
  assert.equal(result.valid, false); assert.equal(result.bpm, null);
});
test('rejects boundary peaks rather than clamping them to the range', () => {
  assert.equal(analyze(syntheticSamples({ bpm: 42 })).valid, false);
  assert.equal(analyze(syntheticSamples({ bpm: 180 })).valid, false);
});
