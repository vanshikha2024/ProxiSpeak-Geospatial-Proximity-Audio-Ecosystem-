// ---------------------------------------------------------------
// services/scaling.js - lets several Node servers share one office.
//
// If REDIS_URL is not set, the server runs alone and nothing changes.
// If it is set, Socket.io sends events through Redis Pub/Sub, so a
// person connected to server 1 can talk to a person on server 2.
// ---------------------------------------------------------------
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createMemoryStore, createRedisStore } = require("./userStore");

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
  console.log("[Scaling] Connected to Redis: several servers can share one office.");
  return createRedisStore(pub);
}

module.exports = { setupScaling };
