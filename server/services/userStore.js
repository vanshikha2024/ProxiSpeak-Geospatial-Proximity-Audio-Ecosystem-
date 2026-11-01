// ---------------------------------------------------------------
// services/userStore.js - where the list of people in each office lives.
//
// Two versions with the same functions:
//   - memory store: one server, users kept in a Map (the default)
//   - Redis store:  several servers share the same list (REDIS_URL set)
// Every function is async, so both versions can be used the same way.
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

function createRedisStore(client) {
  return {
    async set(socketId, user) {
      await client.hSet(REDIS_KEY, socketId, JSON.stringify(user));
    },
    async get(socketId) {
      const raw = await client.hGet(REDIS_KEY, socketId);
      return raw ? JSON.parse(raw) : null;
    },
    async delete(socketId) {
      await client.hDel(REDIS_KEY, socketId);
    },
    async listInRoom(room) {
      const all = await client.hGetAll(REDIS_KEY);
      return Object.values(all)
        .map((raw) => JSON.parse(raw))
        .filter((user) => user.room === room);
    },
  };
}

module.exports = { createMemoryStore, createRedisStore };
