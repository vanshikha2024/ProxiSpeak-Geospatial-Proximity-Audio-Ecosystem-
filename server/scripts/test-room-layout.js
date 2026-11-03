// ---------------------------------------------------------------
// scripts/test-room-layout.js - office layout checks, no database needed.
// Run with:  npm run test:rooms
// ---------------------------------------------------------------
const assert = require("node:assert/strict");
const { validateLayout } = require("../services/roomLayout");
const Room = require("../models/Room");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check("a valid layout with a desk is accepted", () => {
  const result = validateLayout({ width: 720, height: 420, obstacles: [{ x: 10, y: 10, width: 50, height: 20, label: "Desk" }] });
  assert.equal(result.error, undefined);
  assert.equal(result.value.obstacles[0].label, "Desk");
});

check("an empty layout uses the default size", () => {
  const result = validateLayout({});
  assert.deepEqual([result.value.width, result.value.height], [720, 420]);
  assert.deepEqual(result.value.obstacles, []);
});

check("an obstacle outside the office is rejected", () => {
  const result = validateLayout({ width: 100, height: 100, obstacles: [{ x: 80, y: 10, width: 50, height: 10 }] });
  assert.match(result.error, /fully inside/);
});

check("text instead of numbers is rejected", () => {
  const result = validateLayout({ width: "720" });
  assert.match(result.error, /width/);
});

check("a zero-size obstacle is rejected", () => {
  const result = validateLayout({ obstacles: [{ x: 1, y: 1, width: 0, height: 5 }] });
  assert.match(result.error, /at least 1 px/);
});

check("a label longer than 30 characters is shortened, not rejected", () => {
  const long = "x".repeat(50);
  const result = validateLayout({ obstacles: [{ x: 1, y: 1, width: 5, height: 5, label: long }] });
  assert.equal(result.value.obstacles[0].label.length, 30);
});

check("the database model also refuses a room id with spaces", () => {
  const error = new Room({ roomId: "bad room" }).validateSync();
  assert.ok(error && error.errors.roomId);
});

console.log(`\n${passed} checks passed`);
