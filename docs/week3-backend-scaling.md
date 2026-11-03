# Week 3 — Backend Scaling & Multi-Instance Architecture

**Branch:** `TeamLeader`  
**Date:** 30 October 2026 (Day 7 Completion)  
**Milestone:** Week 3 — Horizontal Socket Scaling with Redis

---

## 1. Overview & Architectural Goals

The Week 3 milestone addresses the horizontal scaling constraints of ProxiSpeak's real-time WebRTC and Socket.IO layer. In previous milestones, avatar coordinates, room occupancy, and WebRTC signaling verification relied on process-local memory (`activeAvatars` Map, `roomAudioRadii` Map, and default in-process Socket.IO adapter). When scaling across multiple Node.js processes or server instances, clients connected to different nodes were isolated from each other.

To enable multi-instance scaling without modifying existing client contracts or API shapes, Week 3 introduced:
1. **Redis Pub/Sub Socket.IO Adapter (`@socket.io/redis-adapter`)**: Distributes real-time socket events (`avatar:joined`, `avatar:moved`, `avatar:left`, `signal:*`) across all connected Node.js instances.
2. **Distributed Avatar State Cache (`src/redis/avatarState.js`)**: Backs avatar room memberships, positions, and coordinates in Redis Hashes (`avatar:<socketId>`) and Sets (`room:<roomId>:avatars`), allowing any node to resolve the position and room of any connected client.
3. **Cross-Instance WebRTC Signaling Authorization (`src/sockets/signaling.js`)**: Validates sender registration, target peer existence, room boundary matching, and Euclidean proximity ($d \le r_{\text{audio}}$) across process boundaries using shared Redis state.
4. **Graceful Single-Instance Fallback**: Maintains full backward compatibility; if `REDIS_URL` is omitted or if the Redis broker is temporarily unreachable, nodes fall back gracefully to local in-memory storage without crashing.
5. **Throttled MongoDB Persistence & Lifecycle**: Coordinates user presence and final positions to MongoDB (`isOnline: false`, final coordinates) upon client disconnect.

---

## 2. Multi-Instance Architecture Diagram

```mermaid
flowchart TD
    subgraph Clients["Connected Clients"]
        ClientA["Client A (Room Alpha)<br/>x: 100, y: 100"]
        ClientB["Client B (Room Alpha)<br/>x: 120, y: 120"]
        ClientD["Client D (Room Beta)<br/>x: 500, y: 500"]
    end

    subgraph Instances["Horizontal Backend Instances"]
        subgraph Node1["Node.js Instance 1 (Port 5081)"]
            SocketServer1["Socket.IO Server"]
            LocalMap1["activeAvatars (Local Cache)"]
            Throttler1["persistenceState (Throttling)"]
        end

        subgraph Node2["Node.js Instance 2 (Port 5082)"]
            SocketServer2["Socket.IO Server"]
            LocalMap2["activeAvatars (Local Cache)"]
            Throttler2["persistenceState (Throttling)"]
        end
    end

    subgraph StateTier["Distributed State & Database Tier"]
        subgraph RedisService["Redis Service (Port 6379)"]
            PubSub["Pub/Sub Broker (@socket.io/redis-adapter)"]
            AvatarKeys["Hashes: avatar:socketId<br/>Sets: room:roomId:avatars"]
        end

        subgraph MongoService["MongoDB (Port 27017)"]
            UsersCol["Users Collection (2D geospatial index)"]
            RoomsCol["Rooms Collection (audioRadius & dimensions)"]
        end
    end

    ClientA -->|WebSocket| SocketServer1
    ClientD -->|WebSocket| SocketServer1
    ClientB -->|WebSocket| SocketServer2

    SocketServer1 <-->|Pub/Sub Channel| PubSub
    SocketServer2 <-->|Pub/Sub Channel| PubSub

    SocketServer1 <-->|getAvatarData / setAvatarData| AvatarKeys
    SocketServer2 <-->|getAvatarData / setAvatarData| AvatarKeys

    Throttler1 -.->|Throttled Write (1/s)| UsersCol
    Throttler2 -.->|Throttled Write (1/s)| UsersCol
    SocketServer1 -->|Room query on join| RoomsCol
    SocketServer2 -->|Room query on join| RoomsCol
```

---

## 3. Environment Variables Specification

| Variable | Required | Default Value | Description |
|---|---|---|---|
| `PORT` | Optional | `5000` | HTTP and WebSocket server listening port. |
| `MONGODB_URI` | Optional | `mongodb://localhost:27017/proxispeak` | Primary MongoDB database connection string. |
| `MONGODB_TEST_URI` | Optional | `mongodb://localhost:27017/proxispeak_test` | Isolated test database URI (must contain `"test"`). |
| `REDIS_URL` | Optional | `redis://localhost:6379` | Redis connection URL for multi-instance scaling. If empty, runs in standalone in-memory mode. |
| `CORS_ORIGIN` | Optional | `*` | Allowed CORS origins for REST and Socket.IO. |
| `NODE_ENV` | Optional | `development` | Runtime environment (`development`, `test`, `production`). |

---

## 4. How to Start Redis & Two Backend Instances

### 4.1. Starting Redis
- **Windows (Binary / Service):**
  ```powershell
  # Start local Redis server
  & "$env:LOCALAPPDATA\Programs\Redis\redis-server.exe"
  # Verify connectivity
  & "$env:LOCALAPPDATA\Programs\Redis\redis-cli.exe" ping
  # Expected: PONG
  ```
- **Linux / macOS:**
  ```bash
  redis-server
  redis-cli ping
  ```
- **Docker:**
  ```bash
  docker run -d --name proxispeak-redis -p 6379:6379 redis:7-alpine
  ```

### 4.2. Starting Two Backend Instances Locally

Open two separate terminal windows with `REDIS_URL` pointed to your Redis instance:

**Terminal 1 (Instance 1 on Port 5081):**
```bash
PORT=5081 REDIS_URL=redis://localhost:6379 npm start
```

**Terminal 2 (Instance 2 on Port 5082):**
```bash
PORT=5082 REDIS_URL=redis://localhost:6379 npm start
```

Both instances will output:
```text
[MongoDB] Database connected successfully: localhost
[Redis] Connected (client) to redis://localhost:6379
[Redis] Pub/Sub clients ready
[AvatarRedis] Connected
[Redis] Socket.IO adapter attached
🚀 ProxiSpeak Server running on port 5081
```

---

## 5. Verification & Test Execution

### 5.1. Running the Automated Test Suites

ProxiSpeak includes comprehensive regression and multi-instance test suites:

```bash
# 1. Run Baseline Unit & Socket Tests (Single Instance)
npm test

# 2. Run REST Route & Spatial Proximity Tests
npm run test:routes

# 3. Run Week 2 Geospatial & Audio Radius Suite (requires MONGODB_TEST_URI)
MONGODB_TEST_URI="mongodb://localhost:27017/proxispeak_test" npm run test:week2

# 4. Run Minimal Cross-Instance Movement Test (2 Instances)
REDIS_URL="redis://localhost:6379" npm run test:cross-instance

# 5. Run Full Multi-Instance Integration Suite (33 Comprehensive Checks)
REDIS_URL="redis://localhost:6379" MONGODB_TEST_URI="mongodb://localhost:27017/proxispeak_test" npm run test:multi-instance
```

### 5.2. Actual Measured Multi-Instance Test Results

The comprehensive test suite (`scripts/test-multi-instance.js`) executes 33 verification checks across two running processes, testing:
- **Process Orchestration:** Health probes, dual-instance startup, clean process SIGTERM shutdown.
- **Room-Scoped Events:** Cross-instance join propagation (`avatar:joined`), initial avatar list synchronization (`avatars:initial`).
- **Movement & Echo Suppression:** Movement packets (`avatar:moved`) distributed across nodes without local sender echo.
- **Multi-Room Isolation:** Occupants in Room Beta receive zero movements or joins from Room Alpha.
- **WebRTC Signaling Relay:** Private `signal:offer`, `signal:answer`, and `signal:ice` packets routed across instances with server-verified sender identity.
- **Signaling Security Rejections:** Cross-room signaling rejection, out-of-audio-range rejection, self-signaling rejection, and stale socket rejection.
- **Disconnect & Reconnection:** State cleanup from Redis, MongoDB final position persistence (`isOnline: false`), and reconnection rejoin.
- **Resilience & Fallback:** Standalone execution when `REDIS_URL` is omitted, and graceful error handling when Redis host is unreachable.
- **Performance & Latency:** Multi-client cross-instance broadcast simulation.

```text
  [Performance Results Across 2 Node.js Instances]
  --------------------------------------------------
  • Simulated Clients:    10 (5 on Inst 1, 5 on Inst 2)
  • Total Cross Moves:    50
  • Successful Deliveries: 50 (100% Delivery Rate)
  • Failures / Drops:     0
  • Total Duration:       198 ms
  • Min Observed Latency: 2.15 ms
  • Avg Observed Latency: 3.92 ms
  • P95 Observed Latency: 6.15 ms
  • Max Observed Latency: 16.18 ms
  --------------------------------------------------
  Passed: 33 | Failed: 0
```

---

## 6. Implementation Status & Feature Matrix

### 6.1. Fully Implemented & Verified
- [x] `@socket.io/redis-adapter` integration with separate pub/sub Redis connections.
- [x] Redis-backed avatar registry (`setAvatarData`, `getAvatarData`, `deleteAvatarData`, `getRoomAvatars`).
- [x] Cross-instance avatar lifecycle (`avatar:join`, `avatar:move`, `avatar:left`, `avatars:initial`).
- [x] Proximity-based WebRTC signaling validation across instances ($d \le r_{\text{audio}}$).
- [x] Strict cross-room signaling rejection across instances.
- [x] Disconnect cleanup in Redis and persistence to MongoDB (`isOnline: false`, `socketId: null`, final coordinates).
- [x] Standalone fallback mode (runs without Redis when `REDIS_URL` is unset).
- [x] Resilient connection timeouts and fast-fail strategies when Redis is unreachable.

### 6.2. Partially Tested / Environmental Constraints
- **Multi-Host Network Latency:** Tests were performed on separate OS processes on localhost; inter-node physical network latency (e.g. across AWS EC2 instances / VPC) will depend on cloud infrastructure latency.
- **Redis High Availability (Sentinel / Cluster):** Currently uses standalone Redis connection parameters via `ioredis`. Cluster/Sentinel failover configurations have not been integrated.

### 6.3. Known Limitations & Edge Cases
1. **In-Flight Disconnect Race Condition:** If an instance crashes abruptly (`SIGKILL`) rather than shutting down gracefully (`SIGTERM`), its local avatars remain in the Redis set until a TTL expires or manual cleanup occurs.
2. **Persistence Throttle Coordination:** The 1-second write throttling (`persistenceState`) is currently managed per-node. Since a client socket remains bound to one node during a session, this is safe; however, rapid reconnection across instances within < 1 second may permit two immediate writes.
3. **WHATWG Forbidden Ports:** Ports 5060 and 5061 are reserved for SIP and blocked by `fetch` (undici). Test instances must use ports outside the WHATWG restricted list (e.g. 5055, 5056, 5081, 5082).

---

## 7. Frontend Team Handoff Summary

The backend API and WebSocket interface remain **100% backwards compatible** with Week 2 contracts. No client-side changes are required to support multi-instance backend clusters:

### Key WebSocket Contract Reminders:
1. **Join Room:**
   ```javascript
   socket.emit('avatar:join', {
     username: 'Alice',
     x: 100,
     y: 100,
     roomId: '6acc840f5b105c5599f9c56f'
   });
   ```
2. **Move Avatar:**
   ```javascript
   socket.emit('avatar:move', { x: 120, y: 130 });
   ```
3. **WebRTC Signaling:**
   ```javascript
   // Offer
   socket.emit('signal:offer', {
     toSocketId: targetSocketId,
     offer: rtcSessionDescription
   });
   // Answer
   socket.emit('signal:answer', {
     toSocketId: targetSocketId,
     answer: rtcSessionDescription
   });
   // ICE Candidate
   socket.emit('signal:ice', {
     toSocketId: targetSocketId,
     candidate: rtcIceCandidate
   });
   ```
4. **Error Handling:**
   Listen for the `error` event:
   ```javascript
   socket.on('error', (err) => console.warn('Socket error:', err.message));
   ```
   Typical messages: `"Target peer is out of proximity audio range"`, `"Target peer not found in this room"`, `"Invalid coordinates: x and y must be finite numbers"`.

---

## 8. Week 4 Readiness Assessment (Room Layout & Persistence)

The backend is **ready for Week 4 room persistence development**:
- The `Room` model (`src/models/Room.js`) already persists `dimensions` (`width`, `height`), `audioRadius`, and room metadata.
- Distributed avatar state and cross-instance signaling are fully validated and decoupled from room-specific layout data.
- **Upcoming Week 4 Scope Preview:**
  - Persisting custom room layouts, obstacles, walls, and static office furniture objects in MongoDB.
  - Validating collision detection against wall boundaries on `avatar:move` prior to broadcasting.
  - Propagating layout metadata in `GET /api/rooms/:id` and socket room joins.
