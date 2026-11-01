// ---------------------------------------------------------------
// services/scaling.js - lets several Node servers share one office.
//
// If REDIS_URL is not set, the server runs alone and nothing changes.
// If it is set, Socket.io sends events through Redis Pub/Sub, so a
// person connected to server 1 can talk to a person on server 2.
//
// Each server sends a heartbeat to Redis every 5 seconds. If a server
// stops, its heartbeat expires after 15 seconds and its people are
// removed from the office lists.
// ---------------------------------------------------------------
const crypto = require("node:crypto");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createMemoryStore, createRedisStore } = require("./userStore");

const HEARTBEAT_EVERY_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 15000;

function sendHeartbeat(client, serverId) {
  return client.set(`proxispeak:server:${serverId}`, "1", { PX: HEARTBEAT_TIMEOUT_MS });
}

async function setupScaling(io) {
  const url = process.env.REDIS_URL;

  if (!url) {
    console.log("[Scaling] REDIS_URL not set: one server, users kept in memory.");
    return createMemoryStore();
  }

  // Redis Pub/Sub needs two connections: one to publish, one to listen.
  const pub = createClient({ url });
  const sub = pub.duplicate();
  for (const client of [pub, sub]) {
    client.on("error", (error) => console.error("[Redis]", error.message));
  }
  await pub.connect();
  await sub.connect();

  io.adapter(createAdapter(pub, sub));

  // A unique name for this server, and a heartbeat that says it is alive
  const serverId = crypto.randomUUID();
  await sendHeartbeat(pub, serverId);
  const timer = setInterval(() => {
    sendHeartbeat(pub, serverId).catch((error) =>
      console.error("[Redis] heartbeat failed:", error.message)
    );
  }, HEARTBEAT_EVERY_MS);
  timer.unref();

  console.log("[Scaling] Connected to Redis: several servers can share one office.");
  return createRedisStore(pub, serverId);
}

module.exports = { setupScaling, HEARTBEAT_TIMEOUT_MS };
