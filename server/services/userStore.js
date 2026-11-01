// ---------------------------------------------------------------
// services/userStore.js - where the list of people in each office lives.
//
// Two versions with the same functions:
//   - memory store: one server, users kept in a Map (the default)
//   - Redis store:  several servers share the same list (REDIS_URL set)
// Every function is async, so both versions can be used the same way.
// In the Redis store, people whose server has stopped are left out
// and removed from the list.
// ---------------------------------------------------------------

const REDIS_KEY = "proxispeak:users";

function createMemoryStore() {
  const users = new Map();
  return {
    async set(socketId, user) {
      users.set(socketId, { ...user });
    },
    async get(socketId) {
      const user = users.get(socketId);
      return user ? { ...user } : null;
    },
    async delete(socketId) {
      users.delete(socketId);
    },
    async listInRoom(room) {
      return Array.from(users.values())
        .filter((user) => user.room === room)
        .map((user) => ({ ...user }));
    },
  };
}

// The ids of all servers that sent a heartbeat recently
async function aliveServerIds(client) {
  const keys = await client.keys("proxispeak:server:*");
  return new Set(keys.map((key) => key.split(":").pop()));
}

// Remove the internal serverId before handing a user to the rest of the app
function withoutServer(record) {
  const { serverId, ...user } = record;
  return user;
}

function createRedisStore(client, serverId) {
  return {
    async set(socketId, user) {
      await client.hSet(REDIS_KEY, socketId, JSON.stringify({ ...user, serverId }));
    },
    async get(socketId) {
      const raw = await client.hGet(REDIS_KEY, socketId);
      return raw ? withoutServer(JSON.parse(raw)) : null;
    },
    async delete(socketId) {
      await client.hDel(REDIS_KEY, socketId);
    },
    async listInRoom(room) {
      const all = await client.hGetAll(REDIS_KEY);
      const alive = await aliveServerIds(client);

      const people = [];
      const stale = [];
      for (const [socketId, raw] of Object.entries(all)) {
        const record = JSON.parse(raw);
        if (!alive.has(record.serverId)) {
          stale.push(socketId); // its server stopped: forget this person
        } else if (record.room === room) {
          people.push(withoutServer(record));
        }
      }
      if (stale.length > 0) await client.hDel(REDIS_KEY, stale);
      return people;
    },
  };
}

module.exports = { createMemoryStore, createRedisStore };
