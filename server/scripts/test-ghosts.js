// ---------------------------------------------------------------
// scripts/test-ghosts.js - people left behind by a stopped server
// must not appear in the office list.
// Run with:  REDIS_URL=redis://localhost:6379 npm run test:ghosts
// ---------------------------------------------------------------
const assert = require("node:assert/strict");
const { createClient } = require("redis");
const { createRedisStore } = require("../services/userStore");

const REDIS_KEY = "proxispeak:users";
const ROOM = "ghost-check";
const LIVE_SERVER = "live-check-server";

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("Skipped: set REDIS_URL to run this check.");
    return;
  }

  const client = createClient({ url });
  client.on("error", (error) => console.error("[Redis]", error.message));
  await client.connect();

  try {
    await client.del(REDIS_KEY);
    await client.set(`proxispeak:server:${LIVE_SERVER}`, "1", { PX: 15000 });
    await client.hSet(REDIS_KEY, "live-user", JSON.stringify({
      id: "live-user", name: "Live", room: ROOM, x: 1, y: 1, serverId: LIVE_SERVER,
    }));
    await client.hSet(REDIS_KEY, "ghost-user", JSON.stringify({
      id: "ghost-user", name: "Ghost", room: ROOM, x: 1, y: 1, serverId: "stopped-server",
    }));

    const store = createRedisStore(client, LIVE_SERVER);
    const people = await store.listInRoom(ROOM);

    assert.deepEqual(people.map((person) => person.name), ["Live"]);
    assert.equal("serverId" in people[0], false);
    assert.equal(await client.hGet(REDIS_KEY, "ghost-user"), null);
    console.log("  ok  people from a stopped server are left out and removed");
    console.log("\n1 check passed");
  } finally {
    await client.del(REDIS_KEY);
    await client.del(`proxispeak:server:${LIVE_SERVER}`);
    await client.quit();
  }
}

main().catch((error) => {
  console.error("TEST FAILED:", error.message);
  process.exitCode = 1;
});
