// Run with:  npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { countWallsBetween, segmentCrossesRect, wallFactor } from "./blocking.js";

const desk = { x: 100, y: 100, width: 50, height: 20 };

test("a line straight through the desk is blocked", () => {
  assert.equal(segmentCrossesRect({ x: 50, y: 110 }, { x: 200, y: 110 }, desk), true);
});

test("a line passing above the desk is not blocked", () => {
  assert.equal(segmentCrossesRect({ x: 50, y: 50 }, { x: 200, y: 50 }, desk), false);
});

test("a line that starts inside the desk is blocked", () => {
  assert.equal(segmentCrossesRect({ x: 120, y: 110 }, { x: 300, y: 300 }, desk), true);
});

test("a line that stops short of the desk is not blocked", () => {
  assert.equal(segmentCrossesRect({ x: 0, y: 110 }, { x: 90, y: 110 }, desk), false);
});

test("two obstacles in the way are counted", () => {
  const wall = { x: 150, y: 90, width: 10, height: 40 };
  assert.equal(countWallsBetween({ x: 0, y: 110 }, { x: 300, y: 110 }, [desk, wall]), 2);
});

test("no walls means full volume, one wall makes it quieter, two make it much quieter", () => {
  assert.equal(wallFactor(0), 1);
  assert.ok(Math.abs(wallFactor(1) - 0.35) < 1e-9);
  assert.ok(Math.abs(wallFactor(2) - 0.1225) < 1e-9);
});
