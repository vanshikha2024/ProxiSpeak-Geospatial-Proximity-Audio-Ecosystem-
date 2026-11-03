# Week 3 — Day 6: Multi-Instance Integration Tests & Verification

**Date:** 29 October 2026
**Branch:** `TeamLeader`
**Commit Message:** `test: verify multi-instance socket communication`

---

## 1. Executive Summary

Today's objective was to prove that the ProxiSpeak Week 3 backend operates seamlessly across two distinct Node.js server instances backed by a shared Redis instance and an isolated test MongoDB database.

The implementation and verification confirm that:
1. **Cross-Instance Event Delivery:** Clients connected to different Node.js processes in the same room exchange join, movement, and departure events in real time via the Redis Socket.IO adapter (`@socket.io/redis-adapter`).
2. **Multi-Room Isolation:** Occupants in unrelated rooms do not receive events or signaling across instances.
3. **WebRTC Signaling Across Instances:** Proximity-validated `signal:offer`, `signal:answer`, and `signal:ice` packets route across instances to target peers, while self-signaling, cross-room signaling, and out-of-range signaling are strictly rejected.
4. **Disconnect & Reconnect Lifecycle:** Disconnection clears the avatar from Redis, marks the MongoDB user record offline with final coordinates persisted, and notifies the remaining peers across instances. Reconnection restores real-time room communication.
5. **Documented Redis Fallback:** Servers started without `REDIS_URL` or with an unreachable Redis server degrade gracefully to standalone single-instance in-memory operation without crashing.
6. **Zero Destructive Impact:** All tests strictly target the isolated `proxispeak_test` database and safely clean up test records, child processes, timers, and sockets.

---

## 2. Architecture & File Changes

| File | Changes Made |
|------|--------------|
| `src/sockets/socket.js` | Configured `@socket.io/redis-adapter` (`createAdapter(pub, sub)`) for horizontal scaling across Node.js processes. |
| `src/server.js` | Sequenced `initRedis()` and `initAvatarRedis()` prior to `initSocket(server)` to ensure the adapter is attached before clients connect; added graceful shutdown. |
| `src/sockets/signaling.js` | Updated `validateSignalingRequest` to resolve avatars across instances via Redis, validate proximity with numeric coordinates, sync local/Redis state on move/join, and handle disconnects. |
| `src/redis/avatarState.js` | Added connection timeout/retry caps for fast failure; added numeric coordinate parsing (`Number(x)`) and boolean conversion for Redis hash attributes; enhanced `deleteAvatarData`. |
| `src/config/redis.js` | Added lazy connect, connection timeout (2000ms), and retry limits to fail fast and degrade gracefully when Redis is down. |
| `scripts/test-multi-instance.js` | Comprehensive automated test suite with 6 sections covering process orchestration, cross-instance messaging, WebRTC signaling, disconnect lifecycle, fallback modes, and latency measurements. |
| `scripts/test-cross-instance.js` | Enhanced minimal 2-node verification script with database safety checks and graceful process teardown. |
| `package.json` | Added `@socket.io/redis-adapter` dependency and scripts `"test:multi-instance"` & `"test:cross-instance"`. |

---

## 3. Test Coverage & Verification

### Test Suites
1. **Existing Socket Test Suite** (`npm run test:sockets`):
   - **34 Passed, 0 Failed** (all 14 baseline test groups passed).
2. **Existing REST Routes Suite** (`npm run test:routes`):
   - **11 Passed, 0 Failed**.
3. **Existing Week 2 Baseline Suite** (`npm run test:week2`):
   - **50 Passed, 0 Failed** (with `MONGODB_TEST_URI`).
4. **Cross-Instance Test** (`npm run test:cross-instance`):
   - **Passed**: verified cross-instance movement delivery between Alice (Port 5055) and Bob (Port 5056).
5. **Multi-Instance Comprehensive Suite** (`npm run test:multi-instance`):
   - **Passed**: verified full cross-instance lifecycle, security rules, fallback behavior, and multi-client latency.

---

## 4. GitHub Delivery Commands

### Step 1: Inspect Status
```bash
git status
```

### Step 2: Stage Required Files
```bash
git add package.json package-lock.json src/config/redis.js src/redis/avatarState.js src/sockets/socket.js src/sockets/signaling.js src/server.js scripts/test-cross-instance.js scripts/test-multi-instance.js docs/week3-day6-multi-instance.md
```

### Step 3: Commit
```bash
git commit -m "test: verify multi-instance socket communication"
```

### Step 4: Push to origin TeamLeader
```bash
git push origin TeamLeader
```
*(Never force-push.)*
