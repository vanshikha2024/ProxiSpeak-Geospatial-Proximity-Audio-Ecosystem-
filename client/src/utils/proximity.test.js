// Run with:  npm test      (uses Node's built-in test runner)
import assert from "node:assert/strict";
import { test } from "node:test";
import { distance, getNearbyUsers } from "./proximity.js";

test("distance uses Pythagoras (3-4-5 triangle)", () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("only users inside the radius are returned", () => {
  const me = { x: 100, y: 100 };
  const others = [
    { id: "near", name: "Near", x: 150, y: 100 }, // 50 px away
    { id: "far", name: "Far", x: 400, y: 100 }, // 300 px away
  ];
  const result = getNearbyUsers(me, others, 100);
  assert.deepEqual(result.map((u) => u.id), ["near"]);
});

test("a user exactly on the edge counts as nearby", () => {
  const result = getNearbyUsers(
    { x: 0, y: 0 },
    [{ id: "edge", x: 100, y: 0 }],
    100
  );
  assert.equal(result.length, 1);
});

test("results are sorted closest first", () => {
  const others = [
    { id: "b", x: 80, y: 0 },
    { id: "a", x: 20, y: 0 },
  ];
  const result = getNearbyUsers({ x: 0, y: 0 }, others, 100);
  assert.deepEqual(result.map((u) => u.id), ["a", "b"]);
});

test("a missing name becomes Guest", () => {
  const result = getNearbyUsers({ x: 0, y: 0 }, [{ id: "x", x: 1, y: 1 }], 100);
  assert.equal(result[0].name, "Guest");
});
