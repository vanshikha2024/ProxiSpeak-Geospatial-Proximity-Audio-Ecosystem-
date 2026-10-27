import IORedis from 'ioredis';

let client = null;
// In‑memory fallback when Redis is unavailable
const fallbackMap = new Map(); // socketId -> avatar data
const fallbackRoomSets = new Map(); // roomId -> Set of socketIds

export const initAvatarRedis = async () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[AvatarRedis] REDIS_URL not set – avatar state will be local only');
    client = null;
    return;
  }
  try {
    client = new IORedis(redisUrl);
    client.on('error', (err) => console.error('[AvatarRedis] connection error:', err.message));
    await client.ping();
    console.log('[AvatarRedis] Connected');
  } catch (err) {
    console.error('[AvatarRedis] Failed to connect:', err.message);
    client = null;
  }
};

export const setAvatarData = async (socketId, data) => {
  if (!client) {
    fallbackMap.set(socketId, data);
    if (data.roomId) {
      const set = fallbackRoomSets.get(data.roomId) ?? new Set();
      set.add(socketId);
      fallbackRoomSets.set(data.roomId, set);
    }
    return;
  }
  const key = `avatar:${socketId}`;
  await client.hmset(key, data);
  if (data.roomId) {
    await client.sadd(`room:${data.roomId}:avatars`, socketId);
  }
};

export const getAvatarData = async (socketId) => {
  if (!client) return fallbackMap.get(socketId) ?? null;
  const key = `avatar:${socketId}`;
  const data = await client.hgetall(key);
  return Object.keys(data).length ? data : null;
};

export const deleteAvatarData = async (socketId, roomId) => {
  if (!client) {
    fallbackMap.delete(socketId);
    if (roomId) {
      const set = fallbackRoomSets.get(roomId);
      if (set) set.delete(socketId);
    }
    return;
  }
  const key = `avatar:${socketId}`;
  await client.del(key);
  if (roomId) {
    await client.srem(`room:${roomId}:avatars`, socketId);
  }
};

export const getRoomAvatars = async (roomId) => {
  if (!client) {
    const set = fallbackRoomSets.get(roomId) ?? new Set();
    const result = [];
    for (const sid of set) {
      const data = fallbackMap.get(sid);
      if (data) result.push(data);
    }
    return result;
  }
  const setKey = `room:${roomId}:avatars`;
  const socketIds = await client.smembers(setKey);
  const pipeline = client.pipeline();
  socketIds.forEach((sid) => pipeline.hgetall(`avatar:${sid}`));
  const results = await pipeline.exec();
  return results.map(([err, data]) => (err ? null : data)).filter(Boolean);
};

export const closeAvatarRedis = async () => {
  if (client) {
    await client.quit();
    client = null;
  }
};
