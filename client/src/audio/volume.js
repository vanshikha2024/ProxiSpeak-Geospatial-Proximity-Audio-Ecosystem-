// ---------------------------------------------------------------
// audio/volume.js - how loud someone is, based on distance.
//
// 1.0 (full volume) when standing right next to you,
// 0 (silent) at the audio radius (100 px), and a straight line in between.
// This is the "volume drop-off based on pixel distance" from the project plan.
// ---------------------------------------------------------------
export function volumeForDistance(distance, radius) {
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, 1 - distance / radius));
}
