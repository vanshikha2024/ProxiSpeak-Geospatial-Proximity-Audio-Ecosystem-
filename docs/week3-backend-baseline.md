# Week 3 – Backend Baseline Audit

**Branch**: `TeamLeader`

---

## 1. Scope of this audit
- Verify current server entry point, socket signaling logic, model definitions, and test suites.
- Identify any reliance on **process‑local in‑memory state** that would break when scaling to multiple Node.js instances.
- Record the **actual test results** from the existing socket and route test suites (no modifications were made).
- Propose an architecture that supports **horizontal scaling** while keeping the existing API contracts.
- Draft a **7‑day implementation plan** for the next sprint.

---

## 2. What already works (baseline)
| Area | Current Behaviour | Test Coverage |
|------|-------------------|---------------|
| Server start | `src/server.js` creates an HTTP server, connects to MongoDB, and initialises Socket.io via `src/sockets/socket.js`. | `npm run test` – **pass** |
| Avatar lifecycle | `avatar:join`, `avatar:move`, `disconnect` manage an **in‑memory `activeAvatars` map** and a **`persistenceState` throttling map**. | Socket tests 1‑13 – **pass** |
| Room handling | `Room` model contains dimensions, `audioRadius`, capacity, etc. | Route tests 4‑6 – **pass** |
| WebRTC signalling | `signal:offer/answer/ice` validated by `validateSignalingRequest` (room membership, proximity, self‑signalling checks). | Socket tests 11a‑11j – **pass** |
| Throttled DB persistence | `persistPositionThrottled` guarantees ≤ 1 write/sec per avatar. | Socket test 8 – **pass** |
| MongoDB persistence | Avatar documents updated on move, disconnect and on throttled timer. | Socket tests 8, 12d, 13 – **pass** |
| REST routes | Health, room CRUD, user queries, geospatial `nearby` endpoint. | Route tests 1‑11 – **pass** |

**Result:** All 34 socket checks and 11 route checks passed (`Passed: 34 | Failed: 0` and `Results: 11 Passed, 0 Failed`). No regressions were introduced.

---

## 3. In‑memory state that blocks multi‑instance scaling
| State | Location | Current usage | Scaling implication |
|------|----------|---------------|---------------------|
| `activeAvatars` (`Map<socketId, AvatarData>`) | `src/sockets/signaling.js` | Holds every connected avatar, their coordinates, room, and online flag. Used for movement broadcast, signalling validation, and disconnect cleanup. | Each Node.js process would have a *different* view → avatars in other instances would be invisible, signaling would fail, room isolation would break. |
| `roomAudioRadii` (`Map<roomId, number>`) | `src/sockets/signaling.js` | Caches per‑room audio radius for fast proximity checks. | Cache would diverge across instances; a change to a room’s radius would not propagate. |
| `persistenceState` (`Map<socketId, ThrottleInfo>`) | `src/sockets/signaling.js` | Stores last write timestamp, pending coordinates, timer handles. | Timers are local; a disconnect in another instance would never clear the timer, leading to stray DB writes. |
| Socket.io room membership (`socket.join(roomId)`) | Native Socket.io | Relies on the in‑process adapter; events are only emitted to sockets in the *same* process. | Cross‑process broadcasts (e.g., avatar movement to a client connected to a different instance) would never be delivered. |
| MongoDB queries for room validation & avatar persistence | Throughout signalling & join handlers | Queries are fine, but they *assume* the in‑memory maps are authoritative. | If a client joins via instance A, instance B cannot see that avatar until it queries MongoDB (which only happens on join). Real‑time consistency would suffer. |

**Conclusion:** The three maps and the default Socket.io adapter constitute the core blocking factors for a multi‑instance deployment.

---

## 4. Minimal architectural changes required for scaling
1. **Replace the default Socket.io adapter with the Redis adapter** (`socket.io-redis`). This enables:
   - Pub/Sub of all events (`avatar:joined`, `avatar:moved`, `avatar:left`, `signal:*`) across every instance.
   - Shared room membership semantics.
2. **Externalise the in‑memory maps to Redis**:
   - `ACTIVE_AVATARS` hash: `socketId -> JSON.stringify(AvatarData)`.
   - `ROOM_AUDIO_RADII` hash: `roomId -> radius` (fallback to DB if missing).
   - `PERSISTENCE_STATE` hash with fields `lastSavedAt`, `pendingX`, `pendingY`, `timeoutId` (store timeout timestamp; the timer itself remains local but coordination is via the stored timestamp).
3. **Add thin wrapper utilities** (`src/utils/redisCache.js`) that expose `get/set` operations and hide the async nature.
4. **Update `validateSignalingRequest` and movement handlers** to read from Redis instead of the local `Map`.
5. **Graceful shutdown**: on `process.on('SIGTERM')` flush any pending persistence timers and clear Redis entries for the instance’s sockets.
6. **Keep MongoDB as the source‑of‑truth for persistent avatar state** – no changes needed.

These changes keep the public API unchanged; only the internal state store is swapped.

---

## 5. Seven‑day implementation plan (Week 3 → Week 4)
| Day | Goal | Tasks |
|-----|------|-------|
| **Day 1** (today) | Baseline & documentation | • Create this audit doc (done).<br>• Record test results (done).<br>• Verify branch is `TeamLeader`. |
| **Day 2** | Add Redis dependency & adapter | • `npm i socket.io-redis ioredis`.<br>• Create `src/utils/redisCache.js` with connect logic (handle `process.env.REDIS_URL`).<br>• Write unit tests for cache helpers. |
| **Day 3** | Refactor in‑memory maps to Redis | • Replace `activeAvatars`, `roomAudioRadii`, `persistenceState` with Redis wrappers.<br>• Update all imports in `signaling.js`. |
| **Day 4** | Update Socket.io initialization | • In `src/sockets/socket.js` initialise RedisAdapter (`io.adapter(redisAdapter({ host, port }))`).<br>• Verify cross‑process events with a second Node instance (run two servers on different ports). |
| **Day 5** | Persist throttling state coordination | • Store `lastSavedAt` & pending coordinates in Redis.
   • On each `avatar:move`, compute if a remote instance already saved recently (read timestamp).<br>• Adjust timer logic to use a *distributed* lock (e.g., `SETNX` with expiry) to avoid duplicate saves. |
| **Day 6** | End‑to‑end testing & CI integration | • Extend `scripts/test-sockets.js` to spin up two server processes (different ports) and ensure events cross‑instance.
   • Add new CI step that runs the multi‑instance test.
   • Run `npm run test` and verify **all** existing tests still pass. |
| **Day 7** | Documentation & deployment prep | • Update README with scaling instructions.
   • Add environment variable list (`REDIS_URL`).
   • Commit final changes, push to `origin/TeamLeader`.
   • Prepare a short hand‑off note for the DevOps team (Docker compose with redis service). |

---

## 6. Tomorrow’s immediate objective
- **Begin Day 2**: Install Redis packages, create a Redis cache helper, and write its unit tests.
- No code is merged yet; this will be the first concrete change after today’s baseline commit.

---

*Prepared by the backend team lead on 24 Oct 2026.*
