// ---------------------------------------------------------------
// scripts/test-scaling.js - runs TWO server instances that share Redis.
// Run with:  REDIS_URL=redis://localhost:6379 npm run test:scaling
// (Without REDIS_URL, this test is skipped.)
// ---------------------------------------------------------------
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { io } = require("socket.io-client");

if (!process.env.REDIS_URL) {
  console.log("Skipped: set REDIS_URL (for example redis://localhost:6379) to run this test.");
  process.exit(0);
}

const PORT_A = 5081;
const PORT_B = 5082;
const ROOM = `scale-test-${Date.now()}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer(port) {
  return spawn("node", ["index.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

async function waitFor(check, label, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (check()) return;
    await wait(50);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

async function main() {
  const servers = [startServer(PORT_A), startServer(PORT_B)];
  await wait(2000);

  const sockets = [];
  let passed = 0;
  const check = (name) => {
    passed += 1;
    console.log(`  ok  ${name}`);
  };

  try {
    // Person A connects to server 1, person B connects to server 2
    const a = io(`http://localhost:${PORT_A}`, { transports: ["websocket"] });
    const b = io(`http://localhost:${PORT_B}`, { transports: ["websocket"] });
    sockets.push(a, b);
    a.latest = [];
    b.latest = [];
    a.offers = [];
    b.offers = [];
    a.on("users:update", (list) => (a.latest = list));
    b.on("users:update", (list) => (b.latest = list));
    a.on("signal:offer", (data) => a.offers.push(data));
    b.on("signal:offer", (data) => b.offers.push(data));
    await Promise.all([once(a, "connect"), once(b, "connect")]);

    a.emit("user:join", { username: "A", roomId: ROOM });
    await waitFor(() => a.latest.length === 1, "A alone in the room");

    b.emit("user:join", { username: "B", roomId: ROOM });
    await waitFor(
      () => a.latest.length === 2 && b.latest.length === 2,
      "both servers list both people"
    );
    check("people on different servers see each other in the list");

    // Signaling across servers (B spawned about 60 px from A)
    a.emit("signal:offer", { to: b.id, offer: { sdp: "close" } });
    await waitFor(() => b.offers.length === 1, "B receives the offer from server 1");
    assert.equal(b.offers[0].from, a.id);
    check("a voice offer crosses from server 1 to server 2");

    // Move B far away: the signal must now be blocked
    b.emit("position:update", { x: 500, y: 100 });
    await waitFor(
      () => a.latest.some((u) => u.id === b.id && u.x === 500),
      "A sees B move far away"
    );
    a.emit("signal:offer", { to: b.id, offer: { sdp: "far" } });
    await wait(600);
    assert.equal(b.offers.length, 1, "far offer should be blocked");
    check("a voice offer is still blocked beyond 120 px across servers");

    console.log(`\n${passed} checks passed`);
  } finally {
    sockets.forEach((socket) => socket.close());
    servers.forEach((server) => server.kill());
  }
}

main().catch((error) => {
  console.error("TEST FAILED:", error.message);
  process.exit(1);
});
