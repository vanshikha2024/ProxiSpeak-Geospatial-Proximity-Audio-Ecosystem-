// ---------------------------------------------------------------
// services/proximity.js - small helper functions (no database).
// They are easy to test on their own.
// ---------------------------------------------------------------

// Save each person's position at most once every 1000 ms.
const SAVE_EVERY_MS = 1000;

// Nearby search: default and largest allowed radius, in pixels.
const DEFAULT_RADIUS = 100;
const MAX_RADIUS = 500;

// How long to wait before the next save is allowed.
// Returns 0 when a save can happen right now.
function nextSaveDelay(lastSavedAt, now, interval = SAVE_EVERY_MS) {
  return Math.max(0, lastSavedAt + interval - now);
}

// Check the query string of GET /api/users/nearby.
// Returns { roomId, point: { x, y }, radius } or { error }.
function parseNearbyParams(query) {
  const roomId = typeof query.roomId === "string" ? query.roomId.trim() : "";
  if (!/^[\w-]{1,30}$/.test(roomId)) {
    return { error: "roomId is required (letters, numbers, - and _ only)" };
  }

  const x = toNumber(query.x);
  const y = toNumber(query.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { error: "x and y are required and must be numbers" };
  }

  const radius = query.radius === undefined ? DEFAULT_RADIUS : toNumber(query.radius);
  if (!Number.isFinite(radius) || radius <= 0 || radius > MAX_RADIUS) {
    return { error: `radius must be a number from 1 to ${MAX_RADIUS}` };
  }

  return { roomId, point: { x, y }, radius };
}

// Empty text must not count as the number 0.
function toNumber(value) {
  if (typeof value !== "string" || value.trim() === "") return NaN;
  return Number(value);
}

// Groups people into clusters. Two people are in the same cluster if they
// are within `radius` px of each other, directly or through other people.
// people: [{ x, y, ... }]  ->  array of clusters, each an array of people.
function groupIntoClusters(people, radius) {
  const parent = people.map((_, index) => index);

  function find(index) {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  }

  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const gap = Math.hypot(people[i].x - people[j].x, people[i].y - people[j].y);
      if (gap <= radius) parent[find(i)] = find(j);
    }
  }

  const clusters = new Map();
  people.forEach((person, index) => {
    const root = find(index);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(person);
  });
  return Array.from(clusters.values());
}

module.exports = {
  SAVE_EVERY_MS,
  DEFAULT_RADIUS,
  MAX_RADIUS,
  nextSaveDelay,
  parseNearbyParams,
  groupIntoClusters,
};
