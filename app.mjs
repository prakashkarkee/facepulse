import { analyze, syntheticSamples, CONFIG } from './signal.mjs';
const $ = id => document.getElementById(id);
const video = $('video'), stage = $('stage');
const buffer = document.createElement('canvas'); buffer.width = 96; buffer.height = 64;
const ctx = buffer.getContext('2d', { willReadFrequently: true });
const state = { source: null, stream: null, url: null, ready: false, confirmed: false, recording: false, busy: false,
  samples: [], result: null, roi: { x: 0.4, y: 0.24, w: 0.2, h: 0.12 }, frameId: null, startTime: null, lastTime: -1, lastAnalysis: -1, generation: 0 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sliders = ['roi-x', 'roi-y', 'roi-w', 'roi-h'];

function status(message) { $('status').textContent = message; }
function syncControls() {
  $('camera').disabled = state.recording || state.busy;
  $('choose-video').disabled = state.recording || state.busy;
  $('demo').disabled = state.busy;
  $('close-source').disabled = !state.source || state.recording;
  $('measure').disabled = !state.ready || !state.confirmed || state.recording || state.busy;
  $('measure').hidden = state.recording;
  $('stop').hidden = !state.recording;
  $('confirm-roi').disabled = !state.ready || state.recording || state.busy;
  sliders.forEach(id => { $(id).disabled = !state.ready || state.recording || state.busy; });
  $('export').disabled = $('export-json').disabled = !state.samples.length || state.recording;
  document.body.classList.toggle('recording', state.recording);
  $('live-dot').classList.toggle('active', state.recording);
}
function clearResults() {
  state.samples = []; state.result = null; state.lastAnalysis = -1; state.startTime = null; state.lastTime = -1;
  $('bpm').textContent = '—'; $('elapsed').textContent = '0'; $('progress').value = 0;
  $('fps').innerHTML = '— <small>fps</small>'; $('concentration').innerHTML = '— <small>%</small>'; $('stability').innerHTML = '— <small>BPM</small>';
  $('quality').textContent = 'Awaiting a recording'; $('quality').className = 'quality';
  $('sample-count').textContent = 'No samples yet'; $('estimate-label').textContent = 'ESTIMATED HEART RATE';
  $('progress-label').textContent = 'CAPTURE WINDOW'; drawCharts(); syncControls();
}
function cancelFrame() {
  if (state.frameId !== null) {
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(state.frameId);
    else cancelAnimationFrame(state.frameId);
    state.frameId = null;
  }
}
function releaseSource() {
  state.generation++; cancelFrame(); state.recording = false;
  state.stream?.getTracks().forEach(track => track.stop()); state.stream = null;
  video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
  if (state.url) URL.revokeObjectURL(state.url);
  state.url = null; state.source = null; state.ready = false; state.confirmed = false;
  video.hidden = true; $('roi').hidden = true; $('demo-overlay').hidden = true; $('empty-state').hidden = false;
  $('confirm-roi').textContent = 'Use selected area';
  $('source-badge').textContent = 'READY WHEN YOU ARE'; $('stage-label').textContent = 'LOCAL VIDEO · NO UPLOADS'; $('dimensions').textContent = 'CAMERA OFF';
  syncControls();
}
function mediaReady() {
  state.ready = true; state.confirmed = false; video.hidden = false; $('empty-state').hidden = true; $('roi').hidden = false;
  $('dimensions').textContent = `${video.videoWidth} × ${video.videoHeight}`;
  $('source-badge').textContent = state.source === 'camera' ? 'CAMERA PREVIEW' : 'VIDEO LOADED';
  $('stage-label').textContent = state.source === 'camera' ? 'LIVE PREVIEW · MANUAL REGION' : 'LOCAL FILE · MANUAL REGION';
  status('Select a clear patch of forehead or cheek, then choose “Use selected area”.');
  $('roi-help').textContent = 'Drag a rectangle over the forehead or a cheek. Avoid hair, eyes and glare.';
  drawRoi(); syncControls();
}
function waitForMedia() {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const error = () => { cleanup(); reject(new Error('This video could not be decoded. Try an MP4 (H.264) or WebM file.')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Video did not become ready. Try another file or camera.')); }, 15000);
    function cleanup() { clearTimeout(timer); video.removeEventListener('loadeddata', done); video.removeEventListener('error', error); }
    if (video.readyState >= 2) { cleanup(); resolve(); return; }
    video.addEventListener('loadeddata', done); video.addEventListener('error', error);
  });
}
$('camera').addEventListener('click', async () => {
  releaseSource(); clearResults(); state.busy = true; syncControls(); status('Waiting for camera permission…');
  const generation = state.generation;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open this app on localhost or HTTPS to use a camera.');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false });
    if (generation !== state.generation) { stream.getTracks().forEach(t => t.stop()); return; }
    state.stream = stream; state.source = 'camera'; video.srcObject = stream;
    await waitForMedia(); await video.play(); mediaReady();
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (state.source !== 'camera') return;
      if (state.recording) finish('Camera disconnected.');
      state.ready = false; syncControls(); status('Camera disconnected. Open it again to continue.');
    });
  } catch (e) {
    releaseSource();
    status(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in Chrome or choose a local video.' : e.name === 'NotFoundError' ? 'No camera was found. Choose a face video instead.' : e.message);
  } finally { state.busy = false; syncControls(); }
});
$('choose-video').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  releaseSource(); clearResults(); state.busy = true; syncControls();
  try {
    state.source = 'video'; state.url = URL.createObjectURL(file); video.src = state.url; video.load();
    await waitForMedia();
    if (Number.isFinite(video.duration) && video.duration < CONFIG.minEstimateSeconds) throw new Error('Choose a video at least 3 seconds long. A 20-30 second recording gives a more reliable result.');
    mediaReady();
    if (!Number.isFinite(video.duration)) status('Video duration is not indexed. Select skin; capture will validate that at least 20 seconds were collected.');
  } catch (e) { releaseSource(); status(e.message); }
  finally { state.busy = false; event.target.value = ''; syncControls(); }
});
$('close-source').addEventListener('click', () => { releaseSource(); clearResults(); status('Source closed. Choose a camera, video or synthetic demo.'); });

function imageRect() {
  const width = stage.clientWidth, height = stage.clientHeight;
  const scale = Math.min(width / (video.videoWidth || width), height / (video.videoHeight || height));
  const w = (video.videoWidth || width) * scale, h = (video.videoHeight || height) * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}
function drawRoi() {
  if (!state.ready) return;
  const r = imageRect(), p = state.roi;
  Object.assign($('roi').style, { left: `${r.x + p.x * r.w}px`, top: `${r.y + p.y * r.h}px`, width: `${p.w * r.w}px`, height: `${p.h * r.h}px` });
}
function regionChanged() {
  state.confirmed = false; $('confirm-roi').textContent = 'Use selected area';
  clearResults(); status('Region changed. Confirm this patch of skin before capturing.'); drawRoi(); syncControls();
}
function pointerPoint(event) {
  const bounds = stage.getBoundingClientRect(), r = imageRect();
  return { x: clamp((event.clientX - bounds.left - r.x) / r.w, 0, 1), y: clamp((event.clientY - bounds.top - r.y) / r.h, 0, 1) };
}
let dragStart = null;
stage.addEventListener('pointerdown', event => {
  if (!state.ready || state.recording || state.busy) return;
  dragStart = pointerPoint(event); stage.setPointerCapture(event.pointerId);
});
stage.addEventListener('pointermove', event => {
  if (!dragStart) return;
  const end = pointerPoint(event);
  state.roi = { x: Math.min(dragStart.x, end.x), y: Math.min(dragStart.y, end.y), w: Math.abs(end.x - dragStart.x), h: Math.abs(end.y - dragStart.y) };
  drawRoi();
});
stage.addEventListener('pointerup', event => {
  if (!dragStart) return;
  const end = pointerPoint(event);
  if (Math.abs(end.x - dragStart.x) < 0.025 || Math.abs(end.y - dragStart.y) < 0.025) {
    state.roi = { x: clamp(end.x - 0.1, 0, 0.8), y: clamp(end.y - 0.06, 0, 0.88), w: 0.2, h: 0.12 };
  }
  state.roi.w = clamp(state.roi.w, 0.05, 0.95); state.roi.h = clamp(state.roi.h, 0.05, 0.95);
  state.roi.x = Math.min(state.roi.x, 1 - state.roi.w); state.roi.y = Math.min(state.roi.y, 1 - state.roi.h);
  dragStart = null;
  sliders.forEach((id, i) => { $(id).value = Math.round(state.roi[['x', 'y', 'w', 'h'][i]] * 100); });
  regionChanged();
});
stage.addEventListener('pointercancel', () => {
  if (!dragStart) return;
  dragStart = null; state.roi = { x: 0.4, y: 0.24, w: 0.2, h: 0.12 };
  sliders.forEach((id, i) => { $(id).value = state.roi[['x', 'y', 'w', 'h'][i]] * 100; }); regionChanged();
});
sliders.forEach(id => $(id).addEventListener('input', () => {
  const p = { x: +$('roi-x').value / 100, y: +$('roi-y').value / 100, w: +$('roi-w').value / 100, h: +$('roi-h').value / 100 };
  p.x = Math.min(p.x, 1 - p.w); p.y = Math.min(p.y, 1 - p.h); state.roi = p;
  $('roi-x').value = Math.round(p.x * 100); $('roi-y').value = Math.round(p.y * 100); regionChanged();
}));
$('confirm-roi').addEventListener('click', () => {
  state.confirmed = true; $('confirm-roi').textContent = 'Area selected ✓';
  $('roi-help').textContent = 'Region stays fixed during capture. Keep this patch of skin inside the rectangle.';
  status('Ready. Keep still in steady light for the 30-second capture.'); syncControls();
});

function readFrame(t) {
  const r = state.roi;
  ctx.drawImage(video, r.x * video.videoWidth, r.y * video.videoHeight, r.w * video.videoWidth, r.h * video.videoHeight, 0, 0, buffer.width, buffer.height);
  const pixels = ctx.getImageData(0, 0, buffer.width, buffer.height).data;
  let red = 0, green = 0, blue = 0, clipped = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    red += pixels[i]; green += pixels[i + 1]; blue += pixels[i + 2];
    if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) >= 250 || Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) <= 5) clipped++;
  }
  const n = pixels.length / 4;
  return { t, r: red / n, g: green / n, b: blue / n, clipped: clipped / n };
}
function scheduleFrame() {
  if (!state.recording) return;
  state.frameId = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(onFrame) : requestAnimationFrame(now => onFrame(now, { mediaTime: video.currentTime }));
}
function onFrame(now, metadata) {
  state.frameId = null;
  if (!state.recording) return;
  const time = metadata.mediaTime;
  if (time > state.lastTime + 0.0001) {
    if (state.startTime === null) state.startTime = time;
    state.lastTime = time; const elapsed = time - state.startTime;
    try { state.samples.push(readFrame(elapsed)); }
    catch { finish('Video frames could not be read. Try a different local video.'); return; }
    $('elapsed').textContent = Math.min(30, elapsed).toFixed(1); $('progress').value = elapsed;
    $('sample-count').textContent = `${state.samples.length} RGB samples`;
    if (elapsed - state.lastAnalysis >= 1) {
      state.lastAnalysis = elapsed;
      if (elapsed >= CONFIG.minEstimateSeconds) { state.result = analyze(state.samples); renderResult(false); }
      if (elapsed < CONFIG.minEstimateSeconds) status(`Collecting the signal… ${Math.max(0, Math.ceil(CONFIG.minEstimateSeconds - elapsed))} s until the first estimate.`);
      else if (elapsed < CONFIG.minSeconds) status('Provisional estimate shown. Keep recording for a more reliable 20-second result.');
    }
    if (elapsed >= CONFIG.maxSeconds) { finish(); return; }
  }
  scheduleFrame();
}
async function startCapture() {
  if (!state.ready || !state.confirmed || state.recording) return;
  if (document.hidden) { status('Select this browser tab before starting capture so video frames are not throttled.'); return; }
  clearResults(); state.recording = true;
  $('quality').textContent = 'Collecting signal'; $('source-badge').textContent = 'CAPTURING';
  status('Keep still. A provisional estimate appears after 3 seconds; continue to 20 seconds for the reliable result.'); syncControls();
  try {
    if (state.source === 'video' && video.currentTime > 0.001) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { video.removeEventListener('seeked', done); reject(new Error('Could not rewind this video.')); }, 5000);
        const done = () => { clearTimeout(timeout); resolve(); };
        video.addEventListener('seeked', done, { once: true }); video.currentTime = 0;
      });
    }
    if (!state.recording) return;
    await video.play(); scheduleFrame();
  } catch (e) { finish(e.message); }
}
function finish(message = '') {
  if (!state.recording) return;
  state.recording = false; cancelFrame(); if (state.source === 'video') video.pause();
  state.result = analyze(state.samples); renderResult(true);
  $('source-badge').textContent = 'CAPTURE COMPLETE';
  if (message) status(`${message} ${state.result.valid ? 'The completed window is shown.' : state.result.reasons.join(' ')}`);
  syncControls();
}
$('measure').addEventListener('click', startCapture);
$('stop').addEventListener('click', () => finish('Capture stopped.'));
video.addEventListener('ended', () => finish('Video ended.'));
video.addEventListener('error', () => { if (state.recording) finish('Video playback failed.'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.recording) finish('Capture stopped because this tab became hidden.'); });
window.addEventListener('pagehide', () => state.stream?.getTracks().forEach(t => t.stop()));

function renderResult(final) {
  const r = state.result; if (!r) return;
  $('bpm').textContent = r.bpm !== null && r.bpm !== undefined ? Math.round(r.bpm) : '—';
  $('fps').innerHTML = `${r.fps?.toFixed(1) ?? '—'} <small>fps</small>`;
  $('concentration').innerHTML = `${r.concentration !== undefined ? Math.round(r.concentration * 100) : '—'} <small>%</small>`;
  $('stability').innerHTML = `${r.stability !== null && r.stability !== undefined ? r.stability.toFixed(1) : '—'} <small>BPM</small>`;
  const demo = state.source === 'demo';
  $('quality').textContent = demo ? 'Synthetic demo · not a measurement' : r.valid ? 'Signal checks passed' : r.provisional ? 'Provisional estimate' : r.duration < CONFIG.minEstimateSeconds && !final ? 'Collecting signal' : 'No reliable estimate';
  $('quality').className = `quality ${r.valid ? 'good' : r.provisional ? 'warn' : final ? 'warn' : ''}`;
  if (demo) status('Generated input: 72 BPM. The estimate above comes from processing simulated RGB values.');
  else if (r.valid) status(final ? 'Capture complete. This is an experimental estimate; compare it with a simultaneous reference.' : 'A periodic signal is emerging. Continue holding still for the full capture.');
  else if (r.provisional) status('Provisional estimate. Continue recording to check whether the frequency stays stable.');
  else status(r.reasons.join(' '));
  drawCharts();
}
function demo() {
  releaseSource(); clearResults(); state.source = 'demo';
  $('empty-state').hidden = true; $('demo-overlay').hidden = false;
  state.samples = syntheticSamples(); state.result = analyze(state.samples);
  $('estimate-label').textContent = 'SYNTHETIC SIGNAL ESTIMATE'; $('source-badge').textContent = 'SYNTHETIC DEMO';
  $('stage-label').textContent = 'GENERATED DATA · NOT A PERSON'; $('dimensions').textContent = '72 BPM INPUT';
  $('elapsed').textContent = '30'; $('progress').value = 30; $('progress-label').textContent = 'SIMULATED WINDOW';
  $('sample-count').textContent = `${state.samples.length} synthetic RGB samples`;
  renderResult(true); syncControls();
}
$('demo').addEventListener('click', demo); $('demo-again').addEventListener('click', demo);

function chartBase(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
  const c = canvas.getContext('2d'); c.scale(ratio, ratio);
  c.strokeStyle = '#edf1e6'; c.lineWidth = 1;
  for (let y = 20; y < h; y += 30) { c.beginPath(); c.moveTo(24, y); c.lineTo(w - 24, y); c.stroke(); }
  for (let x = 24; x < w - 20; x += (w - 48) / 8) { c.beginPath(); c.moveTo(x, 10); c.lineTo(x, h - 10); c.stroke(); }
  return { c, w, h };
}
function placeholder(c, w, h, text) { c.fillStyle = '#a2af97'; c.font = '10px Consolas, monospace'; c.textAlign = 'center'; c.fillText(text, w / 2, h / 2 + 4); }
function drawCharts() {
  const wave = chartBase($('wave-chart')), spec = chartBase($('spectrum-chart'));
  const result = state.result;
  if (!result?.waveform?.length) { placeholder(wave.c, wave.w, wave.h, 'Your pulse signal will appear here'); placeholder(spec.c, spec.w, spec.h, 'Waiting for a recording'); return; }
  const { c, w, h } = wave, signal = result.waveform.slice(-Math.round(10 * result.fs));
  c.strokeStyle = '#719b50'; c.lineWidth = 1.6; c.beginPath();
  const max = Math.max(3, ...signal.map(Math.abs));
  signal.forEach((v, i) => { const x = 24 + i / Math.max(1, signal.length - 1) * (w - 48), y = h / 2 - v / max * (h / 2 - 14); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
  const bins = result.spectrum, peak = Math.max(...bins.map(b => b.power), 1e-20), sc = spec.c;
  const x = bpm => 24 + (bpm - 42) / 138 * (spec.w - 48);
  const y = power => spec.h - 13 - power / peak * (spec.h - 34);
  sc.beginPath(); sc.moveTo(x(bins[0].bpm), spec.h - 13);
  bins.forEach(b => sc.lineTo(x(b.bpm), y(b.power))); sc.lineTo(x(bins.at(-1).bpm), spec.h - 13); sc.closePath(); sc.fillStyle = '#d5e9b54d'; sc.fill();
  sc.beginPath(); bins.forEach((b, i) => i ? sc.lineTo(x(b.bpm), y(b.power)) : sc.moveTo(x(b.bpm), y(b.power))); sc.strokeStyle = '#96b56a'; sc.lineWidth = 1.7; sc.stroke();
  if (result.valid) {
    const px = x(result.bpm); sc.setLineDash([3, 4]); sc.strokeStyle = '#628147'; sc.beginPath(); sc.moveTo(px, 10); sc.lineTo(px, spec.h - 10); sc.stroke(); sc.setLineDash([]);
    sc.fillStyle = '#486d3b'; sc.font = '10px Consolas, monospace'; sc.textAlign = px > spec.w - 90 ? 'right' : 'left'; sc.fillText(`${result.bpm.toFixed(1)} BPM`, px > spec.w - 90 ? px - 7 : px + 7, 14);
  }
}
new ResizeObserver(() => { drawRoi(); drawCharts(); }).observe(stage);
window.addEventListener('resize', drawCharts);
function saveDownload(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('export').addEventListener('click', () => {
  const header = 'source,time_s,red_mean,green_mean,blue_mean,clipped_fraction';
  const lines = state.samples.map(s => [state.source, s.t.toFixed(6), s.r.toFixed(6), s.g.toFixed(6), s.b.toFixed(6), s.clipped.toFixed(6)].join(','));
  saveDownload(`facepulse-${state.source}-rgb.csv`, [header, ...lines].join('\r\n'), 'text/csv');
});
$('export-json').addEventListener('click', () => {
  const result = state.result || analyze(state.samples);
  saveDownload(`facepulse-${state.source}-session.json`, JSON.stringify({ app: 'FacePulse 1.0', exportedAt: new Date().toISOString(), source: state.source,
    synthetic: state.source === 'demo', method: 'POS, 1.6-second windows; Hann FFT peak, 0.7–3.0 Hz', clinicallyValidated: false,
    region: state.source === 'demo' ? null : state.roi, result, samples: state.samples }, null, 2), 'application/json');
});
clearResults();
