// Run with:  npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { volumeForDistance } from "./volume.js";

test("full volume when standing right next to someone", () => {
  assert.equal(volumeForDistance(0, 100), 1);
});

test("half volume at 50 px", () => {
  assert.equal(volumeForDistance(50, 100), 0.5);
});

test("silent at and beyond the radius", () => {
  assert.equal(volumeForDistance(100, 100), 0);
  assert.equal(volumeForDistance(120, 100), 0);
});

test("bad input is silent, never negative or above 1", () => {
  assert.equal(volumeForDistance(NaN, 100), 0);
  assert.equal(volumeForDistance(-10, 100), 1);
});
