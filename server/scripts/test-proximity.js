// ---------------------------------------------------------------
// scripts/test-proximity.js - offline checks for Day 2 (no database).
// Run with:  npm run test:proximity
// ---------------------------------------------------------------
const assert = require("node:assert/strict");
const { nextSaveDelay, parseNearbyParams, groupIntoClusters } = require("../services/proximity");
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

check("people within 100 px form one cluster, far groups form another", () => {
  const people = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 60, y: 0 },
    { id: "c", x: 500, y: 0 },
    { id: "d", x: 540, y: 0 },
  ];
  const clusters = groupIntoClusters(people, 100).map((c) => c.map((p) => p.id).sort());
  assert.deepEqual(clusters.map((c) => c.join("")).sort(), ["ab", "cd"]);
});

check("a chain links people who are not close to each other directly", () => {
  // A and C are 180 px apart, but B is within 100 px of both
  const people = [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 90, y: 0 },
    { id: "C", x: 180, y: 0 },
  ];
  assert.equal(groupIntoClusters(people, 100).length, 1);
});

check("a lone person is a cluster of one, and no people gives no clusters", () => {
  assert.equal(groupIntoClusters([{ x: 5, y: 5 }], 100)[0].length, 1);
  assert.deepEqual(groupIntoClusters([], 100), []);
});

console.log(`\n${passed} checks passed`);
