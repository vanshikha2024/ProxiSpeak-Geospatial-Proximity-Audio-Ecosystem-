import IORedis from 'ioredis';

let client = null;
// In‑memory fallback when Redis is unavailable
const fallbackMap = new Map(); // socketId -> avatar data
const fallbackRoomSets = new Map(); // roomId -> Set of socketIds

const parseAvatarFields = (data) => {
  if (!data || typeof data !== 'object') return null;
  const parsed = { ...data };
  if (parsed.x !== undefined) parsed.x = Number(parsed.x);
  if (parsed.y !== undefined) parsed.y = Number(parsed.y);
  if (parsed.isOnline !== undefined) {
    parsed.isOnline = parsed.isOnline === 'true' || parsed.isOnline === true;
  }
  return parsed;
};

export const initAvatarRedis = async () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[AvatarRedis] REDIS_URL not set – avatar state will be local only');
    client = null;
    return;
  }
  try {
    client = new IORedis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      retryStrategy: (times) => (times > 2 ? null : Math.min(times * 100, 500)),
    });
    client.on('error', (err) => console.error('[AvatarRedis] connection error:', err.message));
    await client.connect();
    await client.ping();
    console.log('[AvatarRedis] Connected');
  } catch (err) {
    console.error('[AvatarRedis] Failed to connect:', err.message);
    if (client) {
      try { client.disconnect(); } catch (_) {}
    }
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
  if (!data || !Object.keys(data).length) return null;
  return parseAvatarFields(data);
};

export const deleteAvatarData = async (socketId, roomId) => {
  if (!client) {
    const data = fallbackMap.get(socketId);
    const rId = roomId || data?.roomId;

    fallbackMap.delete(socketId);

    if (rId) {
      const set = fallbackRoomSets.get(rId);
      if (set) set.delete(socketId);
    }

    return;
  }

  const key = `avatar:${socketId}`;

  try {
    const rId = roomId || await client.hget(key, "roomId");

    if (!rId) {
      await client.del(key);
      return;
    }

    const transaction = client.multi();

    transaction.del(key);
    transaction.srem(`room:${rId}:avatars`, socketId);

    await transaction.exec();

    console.log(
      `[AvatarRedis] Cleaned socket ${socketId} from room ${rId}`
    );
  } catch (error) {
    console.error(
      `[AvatarRedis] Cleanup failed for socket ${socketId}:`,
      error.message
    );
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
  if (!socketIds || socketIds.length === 0) return [];
  const pipeline = client.pipeline();
  socketIds.forEach((sid) => pipeline.hgetall(`avatar:${sid}`));
  const results = await pipeline.exec();
  return results
    .map(([err, data]) => {
      if (err || !data || !Object.keys(data).length) return null;
      return parseAvatarFields(data);
    })
    .filter(Boolean);
};

export const pruneRoomAvatars = async (roomId, activeSocketIds) => {
  const activeIds = new Set(activeSocketIds);

  if (!client) {
    const roomSet = fallbackRoomSets.get(roomId);

    if (!roomSet) return;

    for (const socketId of roomSet) {
      if (!activeIds.has(socketId)) {
        roomSet.delete(socketId);
        fallbackMap.delete(socketId);
      }
    }

    return;
  }

  const roomKey = `room:${roomId}:avatars`;
  const storedIds = await client.smembers(roomKey);

  const staleIds = storedIds.filter(
    (socketId) => !activeIds.has(socketId)
  );

  if (staleIds.length === 0) {
    console.log(`[AvatarRedis] No stale members in room ${roomId}`);
    return;
  }

  const transaction = client.multi();

  for (const socketId of staleIds) {
    transaction.del(`avatar:${socketId}`);
    transaction.srem(roomKey, socketId);
  }

  await transaction.exec();

  console.log(
    `[AvatarRedis] Removed ${staleIds.length} stale members from room ${roomId}`
  );
};

export const closeAvatarRedis = async () => {
  if (client) {
    try {
      await client.quit();
    } catch (_) {}
    client = null;
  }
};
