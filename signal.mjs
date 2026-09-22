// POS projection: Wang et al., DOI 10.1109/TBME.2016.2609282.
// The quality gates below are engineering heuristics, not clinical validation.
export const CONFIG = Object.freeze({ minSeconds: 20, minEstimateSeconds: 3, maxSeconds: 30, minFps: 12, lowHz: 0.7, highHz: 3.0, minConcentration: 0.25, minPeakRatio: 5, minSplitConcentration: 0.25, maxStabilityBpm: 10 });
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
const median = a => { const b = [...a].sort((x, y) => x - y); return b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function detrend(values) {
  const n = values.length, center = (n - 1) / 2, m = mean(values);
  let xy = 0, xx = 0;
  for (let i = 0; i < n; i++) { xy += (i - center) * (values[i] - m); xx += (i - center) ** 2; }
  return values.map((v, i) => v - m - (xx ? xy / xx : 0) * (i - center));
}

export function resample(samples) {
  const clean = [];
  for (const s of samples) {
    if (![s.t, s.r, s.g, s.b].every(Number.isFinite)) throw new Error('Sample values must be finite.');
    if (s.r <= 0 || s.g <= 0 || s.b <= 0) throw new Error('RGB values must be positive.');
    if (clean.length && s.t < clean.at(-1).t) throw new Error('Timestamps must increase.');
    if (!clean.length || s.t > clean.at(-1).t) clean.push(s);
  }
  if (clean.length < 3) throw new Error('Not enough distinct frames.');
  const deltas = clean.slice(1).map((s, i) => s.t - clean[i].t);
  const fs = Math.min(60, 1 / median(deltas));
  const duration = clean.at(-1).t - clean[0].t;
  const count = Math.floor(duration * fs) + 1, rgb = [], times = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const t = clean[0].t + i / fs;
    while (j < clean.length - 2 && clean[j + 1].t < t) j++;
    const a = clean[j], b = clean[j + 1], f = clamp((t - a.t) / (b.t - a.t), 0, 1);
    rgb.push(['r', 'g', 'b'].map(k => a[k] + f * (b[k] - a[k])));
    times.push(t - clean[0].t);
  }
  return { rgb, times, fs, duration, maxGap: Math.max(...deltas), effectiveFps: (clean.length - 1) / duration };
}

export function pos(rgb, fs) {
  const n = rgb.length, length = Math.round(1.6 * fs);
  const output = new Array(n).fill(0), weights = new Array(n).fill(0);
  for (let end = length; end <= n; end++) {
    const start = end - length, block = rgb.slice(start, end);
    const averages = [0, 1, 2].map(k => mean(block.map(v => v[k])));
    const normalized = block.map(v => v.map((x, k) => x / averages[k] - 1));
    const x = normalized.map(v => v[1] - v[2]);
    const y = normalized.map(v => v[1] + v[2] - 2 * v[0]);
    const alpha = std(x) / Math.max(std(y), 1e-12);
    const h = x.map((v, i) => v + alpha * y[i]), center = mean(h);
    for (let i = 0; i < length; i++) { output[start + i] += h[i] - center; weights[start + i]++; }
  }
  return detrend(output.map((v, i) => weights[i] ? v / weights[i] : 0));
}

// In-place radix-2 FFT; power-of-two arrays only.
export function fft(real, imag, inverse = false) {
  const n = real.length;
  if (n < 2 || (n & (n - 1)) || imag.length !== n) throw new Error('FFT requires equal power-of-two arrays.');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / length;
    const wr = Math.cos(angle), wi = Math.sin(angle);
    for (let offset = 0; offset < n; offset += length) {
      let ur = 1, ui = 0;
      for (let j = 0; j < length / 2; j++) {
        const a = offset + j, b = a + length / 2;
        const vr = real[b] * ur - imag[b] * ui, vi = real[b] * ui + imag[b] * ur;
        real[b] = real[a] - vr; imag[b] = imag[a] - vi;
        real[a] += vr; imag[a] += vi;
        [ur, ui] = [ur * wr - ui * wi, ur * wi + ui * wr];
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { real[i] /= n; imag[i] /= n; }
}

export function spectrum(signal, fs) {
  let nfft = 1;
  while (nfft < signal.length * 4) nfft *= 2;
  const real = new Array(nfft).fill(0), imag = new Array(nfft).fill(0);
  const values = detrend(signal);
  for (let i = 0; i < values.length; i++) real[i] = values[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (values.length - 1)));
  fft(real, imag);
  const bins = [];
  for (let k = Math.ceil(CONFIG.lowHz * nfft / fs); k <= Math.floor(CONFIG.highHz * nfft / fs); k++) {
    bins.push({ hz: k * fs / nfft, bpm: k * fs / nfft * 60, power: real[k] ** 2 + imag[k] ** 2 });
  }
  let peak = 0;
  bins.forEach((v, i) => { if (v.power > bins[peak].power) peak = i; });
  const total = bins.reduce((s, b) => s + b.power, 0);
  const near = bins.filter(b => Math.abs(b.hz - bins[peak].hz) <= 0.12).reduce((s, b) => s + b.power, 0);
  let delta = 0;
  if (peak > 0 && peak < bins.length - 1) {
    const [a, b, c] = [bins[peak - 1], bins[peak], bins[peak + 1]].map(v => Math.log(v.power + 1e-30));
    if (Math.abs(a - 2 * b + c) > 1e-12) delta = clamp(0.5 * (a - c) / (a - 2 * b + c), -0.5, 0.5);
  }
  const hz = bins[peak].hz + delta * fs / nfft;
  return { bins, bpm: hz * 60, concentration: total > 1e-20 ? near / total : 0,
    peakRatio: bins[peak].power / Math.max(median(bins.map(b => b.power)), 1e-20),
    edge: hz < CONFIG.lowHz + 0.04 || hz > CONFIG.highHz - 0.04 };
}

// Frequency-domain band limitation for the displayed waveform only.
// The estimator uses a Hann spectrum of the detrended POS output.
export function displayBandpass(signal, fs) {
  let n = 1; while (n < signal.length) n *= 2;
  const re = [...signal, ...new Array(n - signal.length).fill(0)], im = new Array(n).fill(0);
  fft(re, im);
  for (let k = 0; k < n; k++) {
    const f = Math.min(k, n - k) * fs / n;
    if (f < CONFIG.lowHz || f > CONFIG.highHz) { re[k] = 0; im[k] = 0; }
  }
  fft(re, im, true);
  const values = re.slice(0, signal.length), scale = Math.max(std(values), 1e-10);
  return values.map(v => v / scale);
}

export function analyze(samples) {
  if (samples.length < 3) return { valid: false, provisional: false, reasons: ['Collect at least 3 seconds of video.'], duration: 0 };
  let input;
  try { input = resample(samples); } catch (e) { return { valid: false, reasons: [e.message], duration: 0 }; }
  const { rgb, times, fs, duration, maxGap, effectiveFps } = input;
  const reasons = [];
  const estimateReady = duration >= CONFIG.minEstimateSeconds - 0.05;
  const finalReady = duration >= CONFIG.minSeconds - 0.05;
  if (!estimateReady) reasons.push('Collect at least 3 seconds of video.');
  if (fs < CONFIG.minFps || effectiveFps < CONFIG.minFps) reasons.push('Frame rate is too low; use at least 12 frames per second.');
  if (maxGap > 0.25) reasons.push('Video has a frame gap longer than 250 ms.');
  if (duration < CONFIG.minEstimateSeconds || rgb.length < Math.ceil(CONFIG.minEstimateSeconds * CONFIG.minFps) || fs < CONFIG.minFps || effectiveFps < CONFIG.minFps) return { valid: false, bpm: null, provisional: false, reasons, duration, fps: effectiveFps };
  const pulse = pos(rgb, fs), spec = spectrum(pulse, fs);
  const amplitude = std(pulse);
  const brightness = mean(rgb.map(v => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]));
  const clipped = mean(samples.map(s => s.clipped || 0));
  const steps = rgb.slice(1).map((v, i) => Math.max(...v.map((c, k) => Math.abs(c - rgb[i][k]) / Math.max(rgb[i][k], 10))));
  const jumps = steps.filter(v => v > 0.035).length / steps.length;
  if (brightness < 15 || clipped > 0.05) reasons.push('Exposure is too dark or clipped; adjust the lighting.');
  if (jumps > 0.03) reasons.push('Abrupt colour changes suggest motion or unstable lighting.');
  if (amplitude < 1e-6 || spec.concentration < CONFIG.minConcentration || spec.peakRatio < CONFIG.minPeakRatio) reasons.push('No sufficiently concentrated periodic signal.');
  if (spec.edge) reasons.push('Peak is too close to the 42–180 BPM search boundary.');
  let stability = null;
  if (finalReady) {
    const length = Math.floor(rgb.length * 0.6);
    const first = spectrum(pos(rgb.slice(0, length), fs), fs);
    const last = spectrum(pos(rgb.slice(-length), fs), fs);
    stability = Math.abs(first.bpm - last.bpm);
    if (stability > CONFIG.maxStabilityBpm || Math.min(first.concentration, last.concentration) < CONFIG.minSplitConcentration) reasons.push('Pulse frequency is inconsistent across the recording.');
  }
  const signalPasses = !reasons.some(reason => reason !== 'Collect at least 20 seconds of video.');
  const provisional = !finalReady && signalPasses;
  if (!finalReady && !reasons.includes('Collect at least 20 seconds of video.')) reasons.push('Collect at least 20 seconds of video.');
  return { valid: finalReady && !reasons.length, provisional, bpm: signalPasses ? spec.bpm : null, candidateBpm: spec.bpm,
    reasons, duration, fps: effectiveFps, fs, maxGap, brightness, clipped, motionJumpFraction: jumps,
    concentration: spec.concentration, peakRatio: spec.peakRatio, stability,
    times, waveform: displayBandpass(pulse, fs), spectrum: spec.bins,
    frequencyResolutionBpm: 60 / duration };
}

// A deterministic RGB fixture. It tests math, not physiological accuracy.
export function syntheticSamples({ bpm = 72, seconds = 30, fps = 30, noise = 0.04, pulse = true, seed = 17 } = {}) {
  let state = seed >>> 0;
  const rand = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296 - 0.5; };
  return Array.from({ length: Math.round(seconds * fps) + 1 }, (_, i) => {
    const t = i / fps;
    const p = pulse ? Math.sin(2 * Math.PI * bpm / 60 * t) + 0.16 * Math.sin(4 * Math.PI * bpm / 60 * t) : 0;
    const light = 1 + 0.003 * Math.sin(2 * Math.PI * 0.18 * t);
    return { t, r: 152 * light + 0.10 * p + noise * rand(), g: 108 * light + 0.55 * p + noise * rand(), b: 82 * light + 0.06 * p + noise * rand(), clipped: 0 };
  });
}
