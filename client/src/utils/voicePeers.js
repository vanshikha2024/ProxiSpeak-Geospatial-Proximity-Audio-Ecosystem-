// ---------------------------------------------------------------
// utils/voicePeers.js - choose who you talk to when many people are close.
//
// Every voice connection costs bandwidth and CPU. In a crowd, connecting
// to everyone would make the network grow very fast (a "mesh").
// So each person talks to at most `max` people:
//   1. people you are already talking to are kept (no on/off flicker),
//   2. then the closest people fill the remaining places.
// Pure function (no React, no browser), so it is easy to test.
// ---------------------------------------------------------------

// nearby: [{ id, distance }], currentIds: Set of ids already connected
export function pickVoicePeers(nearby, max, currentIds = new Set()) {
  return [...nearby]
    .sort((a, b) => {
      const aCurrent = currentIds.has(a.id) ? 0 : 1;
      const bCurrent = currentIds.has(b.id) ? 0 : 1;
      if (aCurrent !== bCurrent) return aCurrent - bCurrent;
      return a.distance - b.distance;
    })
    .slice(0, Math.max(0, max));
}
