
import { randomUUID } from 'node:crypto';
import { getRedisClient } from '../config/redis.js';

const LOCK_TTL_MS = 30000;
const LOCK_WAIT_MS = 60000;
const RETRY_DELAY_MS = 50;

const localLocks = new Map();

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a callback exclusively for a room.
 * Uses Redis for coordination across backend instances.
 * Falls back to a local lock when Redis is disabled.
 */
export const withRoomCapacityLock = async (roomId, callback) => {
  if (!roomId || typeof callback !== 'function') {
    throw new Error('Room ID and callback are required');
  }

  const redis = getRedisClient();

  // Single-instance fallback when Redis is not configured.
  if (!redis) {
    return runLocalLock(String(roomId), callback);
  }

  const lockKey = `room-capacity-lock:${roomId}`;
  const lockToken = randomUUID();
  const startedAt = Date.now();

  let acquired = false;

  while (Date.now() - startedAt < LOCK_WAIT_MS) {
    try {
      const result = await redis.set(
        lockKey,
        lockToken,
        'PX',
        LOCK_TTL_MS,
        'NX'
      );

      if (result === 'OK') {
        acquired = true;
        break;
      }
    } catch (error) {
      throw new Error(
        `Redis room-capacity lock failed: ${error.message}`
      );
    }

    await delay(RETRY_DELAY_MS);
  }

  if (!acquired) {
    throw new Error(
      `Timed out waiting for room capacity lock: ${roomId}`
    );
  }

  try {
    return await callback();
  } finally {
    // Release only if this process still owns the lock.
    const releaseScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `;

    try {
      await redis.eval(releaseScript, 1, lockKey, lockToken);
    } catch (error) {
      console.error(
        '[Room Capacity] Failed to release Redis lock:',
        error.message
      );
    }
  }
};

/**
 * Local exclusive lock for single-instance mode.
 */
const runLocalLock = async (roomId, callback) => {
  const previous = localLocks.get(roomId) || Promise.resolve();

  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  localLocks.set(roomId, current);

  await previous;

  try {
    return await callback();
  } finally {
    release();

    if (localLocks.get(roomId) === current) {
      localLocks.delete(roomId);
    }
  }
};
