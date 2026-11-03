// ---------------------------------------------------------------
// audio/panning.js - which side a voice comes from (stereo separation).
//
// If someone stands to your right, their voice plays more in your right
// ear. If they stand to your left, it plays more in your left ear.
// Fully to one side at the audio radius (100 px) gives the full left or
// right. Pan goes from -1 (left) to 1 (right), 0 is the middle.
// ---------------------------------------------------------------
export function panForOffset(dx, radius) {
  if (!Number.isFinite(dx) || !Number.isFinite(radius) || radius <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(-1, dx / radius));
}
