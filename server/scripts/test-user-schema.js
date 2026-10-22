// ---------------------------------------------------------------
// scripts/test-user-schema.js - checks the User schema WITHOUT a database.
// Run with:  npm run test:schema
// ---------------------------------------------------------------
const assert = require("node:assert/strict");
const User = require("../models/User");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check("a user with a valid [x, y] position passes", () => {
  const user = new User({ username: "Asha", location: { coordinates: [120, 80] } });
  assert.equal(user.validateSync(), undefined);
});

check("a position with three numbers is rejected", () => {
  const user = new User({ username: "Asha", location: { coordinates: [1, 2, 3] } });
  const error = user.validateSync();
  assert.ok(error && error.errors["location.coordinates"]);
});

check("a position with NaN is rejected", () => {
  const user = new User({ username: "Asha", location: { coordinates: [NaN, 5] } });
  const error = user.validateSync();
  // Mongoose reports this under "location.coordinates.0" instead
  assert.ok(error && Object.keys(error.errors).some((key) => key.startsWith("location.coordinates")));
});

check("a username is required", () => {
  const error = new User({ location: { coordinates: [1, 1] } }).validateSync();
  assert.ok(error && error.errors.username);
});

check("new users start offline at [0, 0]", () => {
  const user = new User({ username: "Ben" });
  assert.equal(user.isOnline, false);
  assert.deepEqual(user.location.coordinates, [0, 0]);
});

check("the 2d index is defined on location.coordinates with bounds", () => {
  const index = User.schema.indexes().find(([fields]) => fields["location.coordinates"] === "2d");
  assert.ok(index, "2d index is missing");
  assert.equal(index[1].min, -2000);
  assert.equal(index[1].max, 10000);
});

console.log(`\n${passed} checks passed`);
