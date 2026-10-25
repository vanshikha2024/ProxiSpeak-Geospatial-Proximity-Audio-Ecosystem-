// ---------------------------------------------------------------
// scripts/test-signaling.js - checks the server's signaling rules.
// Run with:  npm run test:signaling
// It starts its own server on port 5055, so nothing else is needed.
// ---------------------------------------------------------------
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { io } = require("socket.io-client");

const PORT = 5055;
const URL = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Connect a fake user, join a room and (optionally) stand at x, y.
async function makeUser(name, room, x, y) {
  const socket = io(URL, { transports: ["websocket"] });
  await new Promise((resolve) => socket.on("connect", resolve));

  socket.received = [];
  socket.on("signal:offer", (data) => socket.received.push(data));

  socket.emit("user:join", { username: name, roomId: room });
  await wait(100);
  if (x !== undefined) socket.emit("position:update", { x, y });
  await wait(100);
  return socket;
}

async function main() {
  const server = spawn("node", ["index.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
  await wait(1000);

  const sockets = [];
  let passed = 0;
  const check = (name, fn) => {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  };

  try {
    const a = await makeUser("A", "r1", 100, 100);
    const near = await makeUser("Near", "r1", 150, 100); // 50 px away
    const far = await makeUser("Far", "r1", 500, 100); // 400 px away
    const other = await makeUser("Other", "r2", 110, 100); // different room
    const edge = await makeUser("Edge", "r1", 230, 100); // 130 px: beyond 120
    sockets.push(a, near, far, other, edge);

    // Same room and close  -> the offer must arrive.
    a.emit("signal:offer", { to: near.id, offer: { sdp: "x" } });
    // Same room but far    -> must be blocked.
    a.emit("signal:offer", { to: far.id, offer: { sdp: "x" } });
    // Different room       -> must be blocked.
    a.emit("signal:offer", { to: other.id, offer: { sdp: "x" } });
    a.emit("signal:offer", { to: edge.id, offer: { sdp: "x" } });
    await wait(300);

    check("a nearby user in the same room receives the offer", () => {
      assert.equal(near.received.length, 1);
      assert.equal(near.received[0].from, a.id);
      assert.deepEqual(near.received[0].offer, { sdp: "x" });
    });
    check("a user far away does NOT receive the offer", () => {
      assert.equal(far.received.length, 0);
    });
    check("a user in another room does NOT receive the offer", () => {
      assert.equal(other.received.length, 0);
    });
    check("a user 130 px away (beyond 120 px) does NOT receive the offer", () => {
      assert.equal(edge.received.length, 0);
    });

    // Someone who never joined cannot signal.
    const ghost = io(URL, { transports: ["websocket"] });
    await new Promise((resolve) => ghost.on("connect", resolve));
    sockets.push(ghost);
    ghost.emit("signal:offer", { to: near.id, offer: { sdp: "y" } });
    await wait(300);

    check("a user who has not joined cannot send signals", () => {
      assert.equal(near.received.length, 1); // still only the first offer
    });

    console.log(`\n${passed} checks passed`);
  } finally {
    sockets.forEach((socket) => socket.close());
    server.kill();
  }
}

main().catch((error) => {
  console.error("TEST FAILED:", error.message);
  process.exit(1);
});
