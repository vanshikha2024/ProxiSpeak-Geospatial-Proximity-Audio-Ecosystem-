// ---------------------------------------------------------------
// scripts/test-proximity.js - offline checks for Day 2 (no database).
// Run with:  npm run test:proximity
// ---------------------------------------------------------------
const assert = require("node:assert/strict");
const { nextSaveDelay, parseNearbyParams } = require("../services/proximity");
const User = require("../models/User");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check("a first save is allowed right away", () => {
  assert.equal(nextSaveDelay(0, 5000), 0);
});

check("a save 400 ms ago must wait 600 ms more", () => {
  assert.equal(nextSaveDelay(4600, 5000), 600);
});

check("a save more than 1 second ago needs no wait", () => {
  assert.equal(nextSaveDelay(3000, 5000), 0);
});

check("valid query parameters are accepted", () => {
  const result = parseNearbyParams({ roomId: "main-office", x: "200", y: "150", radius: "80" });
  assert.deepEqual(result, { roomId: "main-office", point: { x: 200, y: 150 }, radius: 80 });
});

check("the radius defaults to 100 px", () => {
  const result = parseNearbyParams({ roomId: "main-office", x: "1", y: "2" });
  assert.equal(result.radius, 100);
});

check("a missing roomId is rejected", () => {
  assert.ok(parseNearbyParams({ x: "1", y: "2" }).error);
});

check("an empty x is rejected (not treated as 0)", () => {
  assert.ok(parseNearbyParams({ roomId: "a", x: "", y: "2" }).error);
});

check("a text x is rejected", () => {
  assert.ok(parseNearbyParams({ roomId: "a", x: "abc", y: "2" }).error);
});

check("a radius of 0 or above 500 is rejected", () => {
  assert.ok(parseNearbyParams({ roomId: "a", x: "1", y: "2", radius: "0" }).error);
  assert.ok(parseNearbyParams({ roomId: "a", x: "1", y: "2", radius: "501" }).error);
});

check("the nearby query filters by room, online users and a $near radius", () => {
  const query = User.nearbyQuery("main-office", { x: 10, y: 20 }, 100);
  assert.equal(query.roomId, "main-office");
  assert.equal(query.isOnline, true);
  assert.deepEqual(query["location.coordinates"], { $near: [10, 20], $maxDistance: 100 });
});

console.log(`\n${passed} checks passed`);
