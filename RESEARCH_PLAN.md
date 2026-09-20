# Turn the prototype into a research project

## Working title

**FacePulse: Contactless heart-rate estimation with quality-aware rPPG**

## Research question

How do lighting and head motion affect the accuracy and availability of a simple POS-based heart-rate estimate from consumer face video?

## What is already implemented

Local camera and recorded-video input, manual skin ROI, timestamp resampling, POS extraction, FFT peak estimation, heuristic rejection, visualizations and data export. No machine learning training or face tracking has been implemented.

## Evaluation protocol

1. Use recordings from consenting participants and a synchronized reference sensor. Follow applicable university procedures for participant research. Keep identifying video local with appropriate access controls.
2. Collect repeated 30-second windows while seated, starting with stable diffuse illumination. Record camera, frame rate, resolution, exposure setting and reference sensor details. Match the reference heart rate to exactly the same time window; a wearable's displayed value may be smoothed or delayed.
3. Change one factor at a time: steady versus small head movements; diffuse daylight versus indoor lighting; near versus far camera position; lightly versus heavily compressed video. Include a representative range of participants and skin reflectance conditions; do not infer demographics automatically from video.
4. Compare green-channel and POS baselines using the same ROI, frames, timestamps and analysis window. Add tracked forehead/cheek ROIs as a separate experiment. Record every attempted window, including failed or rejected results.
5. Report MAE, RMSE, mean bias, limits of agreement and **coverage** (accepted windows / all attempted windows). Report errors both before and after rejection to expose the accuracy/coverage tradeoff. Do not replace rejected results with zero or quietly discard them.
6. Split tuning and evaluation by participant. Fix all thresholds before testing held-out participants. If enough participants are available, estimate uncertainty with participant-level bootstrap resampling, not individual frames.

## Suggested data table

`participant_code, session_code, condition, camera_fps, duration_s, reference_bpm, candidate_bpm, accepted_bpm, accepted, rejection_reason, lighting_note, roi_method`

Maintain a separate protected mapping for identities if needed. Session exports contain raw RGB and timestamps for offline re-analysis; they are still physiological signal data even without video.

## Extensions in order

1. Track face landmarks and combine forehead and cheek ROIs; compare tracking noise against the manual baseline.
2. Improve quality checks with region agreement and explicit motion estimates. Test lighting flicker and harmonics as adversarial confounds.
3. Compare POS, CHROM and green-channel methods against the same synchronized reference data.
4. Only then evaluate a learned rPPG model with participant-independent testing and documented training data.

## Portfolio deliverables

A runnable demo, a reproducible evaluation script, a held-out results table including rejected windows, error/coverage plots, and a short report explaining failure cases. Any claimed accuracy must come from real paired data; synthetic tests are software checks only.
