// ---------------------------------------------------------------
// audio/blocking.js - furniture and walls that block sound.
//
// A voice is blocked if the straight line between two people crosses
// an obstacle (a desk, a wall, a table). Each obstacle in the way makes
// the voice much quieter.
// ---------------------------------------------------------------

// How loud a voice stays after passing through ONE obstacle (35%)
const VOLUME_THROUGH_ONE_OBSTACLE = 0.35;

// Does the line from `from` to `to` cross the rectangle `rect`?
// Uses the Liang-Barsky method: it trims the line to the part inside the box.
export function segmentCrossesRect(from, to, rect) {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const p = [-dx, dx, -dy, dy];
  const q = [from.x - left, right - from.x, from.y - top, bottom - from.y];

  let enter = 0;
  let leave = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false; // parallel and outside the box
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > leave) return false;
        if (t > enter) enter = t;
      } else {
        if (t < enter) return false;
        if (t < leave) leave = t;
      }
    }
  }
  return true;
}

// How many obstacles lie between two people
export function countWallsBetween(from, to, obstacles) {
  return obstacles.filter((obstacle) => segmentCrossesRect(from, to, obstacle)).length;
}

// Volume multiplier: 1 with no walls, 0.35 with one, 0.35 x 0.35 with two...
export function wallFactor(count) {
  return Math.pow(VOLUME_THROUGH_ONE_OBSTACLE, Math.max(0, count));
}
