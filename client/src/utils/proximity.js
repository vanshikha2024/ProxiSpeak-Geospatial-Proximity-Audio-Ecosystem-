// ---------------------------------------------------------------
// utils/proximity.js - "who is close enough to hear me?"
// Pure functions (no React, no browser) so they are easy to test.
// ---------------------------------------------------------------

// Straight-line distance between two points { x, y } in pixels.
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// From a list of OTHER users, return the ones within `radius` pixels of
// `me`, closest first.  Each result: { id, name, distance }.
export function getNearbyUsers(me, others, radius) {
  return others
    .map((user) => ({
      id: user.id,
      name: user.name || "Guest",
      distance: distance(me, user),
    }))
    .filter((user) => user.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}
