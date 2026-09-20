# Delivery validation

Validated on 20 September 2026 with Node.js 22.20.0 and the connected Chrome browser on Windows.

- **20 automated signal tests passed.** Includes seven synthetic heart rates from 48 to 174 BPM (all within 1 BPM), timestamp jitter, duplicate timestamps, flat video, random noise, frequency changes, frame gaps, low frame rate, clipping, abrupt colour jumps, range boundaries and FFT reconstruction.
- JavaScript syntax checks passed for the app, signal engine, server and video fixture generator.
- The app loaded in Chrome with no console errors during the initial demo check. The synthetic RGB demo displayed **72 BPM**, 30.0 fps and clearly labelled its data as simulated.
- Local WebM import, ROI confirmation, timed capture and both export buttons were exercised. CSV and JSON downloads were read back: the initial run exported 687 samples, with 688 CSV lines including its header.
- A background-tab run had a 1.167-second frame gap. The quality gate correctly withheld BPM despite a diagnostic spectral candidate of 71.98 BPM. A foreground-only start safeguard was added, complementing automatic stop on tab hiding.
- Retesting the same generated WebM in the foreground also triggered the frame-gap gate (638 collected samples, 21.2 effective fps). Therefore, background throttling was not established as the only cause. The fixture/playback timing needs further investigation; this delivery does not claim successful accepted-BPM recovery from that encoded video. The deterministic RGB demo and signal tests recover the intended frequency, and the video path exercises decoding and conservative rejection.

## Limits

The webcam path is implemented but was not exercised against the user's camera. No real participant recordings or synchronized reference heart-rate measurements were available. Synthetic results establish software behaviour only; physiological accuracy, skin-tone performance and clinical validity remain untested. The UI uses manually selected, fixed ROIs and has no automatic face tracking.
