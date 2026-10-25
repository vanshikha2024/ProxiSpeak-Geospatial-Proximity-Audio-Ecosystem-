import IORedis from 'ioredis';

let client = null;

/**
 * Initialize Redis connection based on REDIS_URL environment variable.
 * If REDIS_URL is not set, operates in single‑instance mode (no error).
 */
export const initRedis = async () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[Redis] REDIS_URL not set – running without Redis (single‑instance mode).');
    return;
  }
  try {
    client = new IORedis(redisUrl);
    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });
    // Simple ping to verify connectivity
    await client.ping();
    console.log('[Redis] Connected to', redisUrl);
  } catch (err) {
    console.error('[Redis] Failed to connect to', redisUrl, ':', err.message);
    client = null;
  }
};

/** Retrieve the active Redis client (may be null). */
export const getRedisClient = () => client;

/** Gracefully close the Redis connection if it exists. */
export const closeRedis = async () => {
  if (client) {
    try {
      await client.quit();
      console.log('[Redis] Connection closed');
    } catch (err) {
      console.error('[Redis] Error during quit:', err.message);
    } finally {
      client = null;
    }
  }
};
