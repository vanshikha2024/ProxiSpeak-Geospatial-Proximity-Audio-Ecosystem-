// Run with:  npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { pickVoicePeers } from "./voicePeers.js";

const people = [
  { id: "a", distance: 10 },
  { id: "b", distance: 40 },
  { id: "c", distance: 70 },
  { id: "d", distance: 90 },
];

test("with room for everyone, nobody is left out", () => {
  assert.equal(pickVoicePeers(people, 10).length, 4);
});

test("when full, the closest people are chosen", () => {
  const ids = pickVoicePeers(people, 2).map((p) => p.id);
  assert.deepEqual(ids, ["a", "b"]);
});

test("people already connected keep their place, even if farther", () => {
  const ids = pickVoicePeers(people, 2, new Set(["c", "d"])).map((p) => p.id);
  assert.deepEqual(ids.sort(), ["c", "d"]);
});

test("a limit of zero connects to nobody", () => {
  assert.deepEqual(pickVoicePeers(people, 0), []);
});
