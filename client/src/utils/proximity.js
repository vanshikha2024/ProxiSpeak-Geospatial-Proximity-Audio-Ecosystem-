// ---------------------------------------------------------------
// utils/proximity.js - "who is close enough to hear me?"
// Pure functions (no React, no browser) so they are easy to test.
// ---------------------------------------------------------------

// Straight-line distance between two points { x, y } in pixels.
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// From a list of OTHER users, return the ones close enough to hear me,
// closest first.  Each result: { id, name, distance }.
//
// "Hysteresis" (a fancy word for a simple trick):
//   - A NEW person must come within `radius` (e.g. 100 px) to join.
//   - A person who is ALREADY nearby may go out to `leaveRadius`
//     (e.g. 120 px) before they are dropped.
// Without this, someone standing exactly at 100 px would connect and
// disconnect again and again. Pass the ids that were nearby last time
// in `previousIds`. If you skip the last two arguments, it is a plain radius.
export function getNearbyUsers(
  me,
  others,
  radius,
  previousIds = new Set(),
  leaveRadius = radius
) {
  return others
    .map((user) => ({
      id: user.id,
      name: user.name || "Guest",
      distance: distance(me, user),
    }))
    .filter((user) => {
      if (user.distance <= radius) return true;
      return previousIds.has(user.id) && user.distance <= leaveRadius;
    })
    .sort((a, b) => a.distance - b.distance);
}
