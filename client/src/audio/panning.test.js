// Run with:  npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { panForOffset } from "./panning.js";

test("someone straight ahead is in the middle", () => {
  assert.equal(panForOffset(0, 100), 0);
});

test("someone to the right is panned right, to the left is panned left", () => {
  assert.equal(panForOffset(50, 100), 0.5);
  assert.equal(panForOffset(-50, 100), -0.5);
});

test("the pan never goes past full left or full right", () => {
  assert.equal(panForOffset(300, 100), 1);
  assert.equal(panForOffset(-300, 100), -1);
});

test("bad input stays in the middle", () => {
  assert.equal(panForOffset(NaN, 100), 0);
});
