const button = document.getElementById('generate'), status = document.getElementById('fixture-status');
const canvas = document.getElementById('fixture'), ctx = canvas.getContext('2d');
let previousUrl;
button.addEventListener('click', () => {
  button.disabled = true; document.getElementById('download').hidden = true;
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!mimeType) { status.textContent = 'WebM recording is unsupported in this browser.'; button.disabled = false; return; }
  const stream = canvas.captureStream(30), recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
  const chunks = []; let start, id;
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    cancelAnimationFrame(id); stream.getTracks().forEach(t => t.stop());
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    previousUrl = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    const link = document.getElementById('download'); link.href = previousUrl; link.download = 'facepulse-synthetic-72bpm.webm'; link.hidden = false;
    status.textContent = 'Ready: 32-second synthetic 72 BPM clip. Download it and choose it in FacePulse.'; button.disabled = false;
  };
  const frame = ctx.createImageData(320, 240);
  function paint(now) {
    start ??= now; const t = (now - start) / 1000;
    // Larger than a physiological pulse, to survive 8-bit video compression.
    const p = Math.sin(2 * Math.PI * 1.2 * t), light = 1 + 0.003 * Math.sin(2 * Math.PI * .18 * t);
    const rgb = [152 * light + .3 * p, 108 * light + 1.8 * p, 82 * light + .2 * p];
    for (let i = 0; i < frame.data.length; i += 4) {
      const dither = ((i / 4 * 37) % 101) / 101 - .5;
      for (let k = 0; k < 3; k++) frame.data[i + k] = Math.round(rgb[k] + dither);
      frame.data[i + 3] = 255;
    }
    ctx.putImageData(frame, 0, 0); status.textContent = `Generating video: ${Math.min(32, t).toFixed(1)} / 32 seconds. Keep this tab visible.`;
    if (t >= 32) recorder.stop(); else id = requestAnimationFrame(paint);
  }
  recorder.start(); id = requestAnimationFrame(paint);
});
