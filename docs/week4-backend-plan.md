# Week 4 — Backend Implementation Plan: Room Persistence & Acoustic Obstacles

**Date:** 31 October 2026  
**Branch:** `TeamLeader`  
**Milestone:** Week 4 — Office Layouts, Obstacle Persistence, and Sound Occlusion  
**Status:** Architecture Inspection & Planning Phase  

---

## 1. Executive Summary

In Weeks 1 through 3, ProxiSpeak built a robust foundation:
- **Week 1:** Real-time avatar movement, Socket.IO room joins, and initial MongoDB coordinates persistence.
- **Week 2:** 2D Euclidean spatial proximity calculations and audio radius ($r_{\text{audio}}$) boundary enforcement.
- **Week 3:** Horizontal socket scaling across multiple Node.js instances backed by Redis Pub/Sub (`@socket.io/redis-adapter`) and distributed avatar state caching.

**Week 4 Objective:**
> *"Room Persistence: Save office layouts and furniture obstacles (which block sound) into MongoDB."*

Avatars currently navigate an empty 2D canvas with open-air sound propagation. In a realistic virtual office, spaces contain physical objects: meeting room walls, soundproof glass partitions, conference tables, and individual cubicle dividers. These obstacles:
1. Define the spatial structure of an office layout.
2. Determine where new avatars spawn when entering the room (`spawnPoint`).
3. Attenuate or completely block spatial audio when an obstacle stands between two speaking colleagues.

Today's milestone focuses on **deep inspection, architectural analysis, and drafting a 7-day implementation roadmap** without modifying active runtime code.

---

## 2. Existing Backend Implementation Status

A comprehensive inspection of the existing codebase was conducted. Here is the operational state of all core components:

| Component | File Path | Existing Capabilities | Week 4 Readiness / Gaps |
|---|---|---|---|
| **Room Model** | `src/models/Room.js` | Schema defines `name`, `description`, `dimensions` (`width`, `height`), `audioRadius`, `capacity`, `isPrivate`, `passcode`. | Missing `spawnPoint` and `obstacles` array subdocument. |
| **User Model** | `src/models/User.js` | GeoJSON Point `[x, y]` coordinates, planar `2d` index, `roomId`, `isOnline`, `socketId`. | Ready. No structural changes needed. |
| **Room Controller** | `src/controllers/roomController.js` | `getRooms`, `createRoom`, `getRoomById`, `getRoomMembers`. Computes real-time online member count. | Needs `getRoomLayout`, `updateRoomLayout` (PUT), and validation for layout payloads. |
| **Room Routes** | `src/routes/roomRoutes.js` | `GET /api/rooms`, `POST /api/rooms`, `GET /api/rooms/:id`, `GET /api/rooms/:id/members`. | Needs `GET /api/rooms/:id/layout` and `PUT /api/rooms/:id/layout`. |
| **Proximity Utility** | `src/utils/proximity.js` | Calculates 2D Euclidean distance and tests whether $d \le r_{\text{audio}}$. | Currently assumes clear line-of-sight. Needs 2D obstacle intersection logic (ray/segment check). |
| **Constants** | `src/config/constants.js` | `DEFAULT_AUDIO_RADIUS = 100`, `DEFAULT_ROOM_WIDTH = 1920`, `DEFAULT_ROOM_HEIGHT = 1080`. | Needs default spawn point coordinates, obstacle types, and acoustic attenuation levels. |
| **Redis Avatar Cache** | `src/redis/avatarState.js` | Hashes `avatar:<socketId>` and Sets `room:<roomId>:avatars`. | Ready. Can cache room layout or obstacle metadata for high-frequency movement queries. |
| **Socket Layer** | `src/sockets/signaling.js` | Handlers for `avatar:join`, `avatar:move`, WebRTC signaling relays (`signal:offer/answer/ice`). | Can incorporate `spawnPoint` on join, and collision/acoustic checks on move/signaling. |

---

## 3. Analysis of Room Dimensions, Spawn Point, and Obstacles

### 3.1. Dimensions
- **Status:** **Implemented.**
- In `src/models/Room.js`, `dimensions` exists with `width` (default: 1920px, min: 100px) and `height` (default: 1080px, min: 100px).
- In `src/controllers/roomController.js`, `createRoom` accepts and persists custom dimensions.

### 3.2. Spawn Point
- **Status:** **Missing.**
- The `Room` model has no `spawnPoint` property.
- When an avatar emits `avatar:join`, the client is currently forced to supply arbitrary coordinates `[x, y]`. If the client omits coordinates or sends `[0, 0]`, the avatar spawns in the top-left corner without office context.
- **Requirement:** Rooms must specify a valid `spawnPoint: { x: Number, y: Number }`. Joining avatars can default to this coordinate pair, ensuring they appear at a designated reception desk or room entrance.

### 3.3. Obstacles
- **Status:** **Missing.**
- Neither `Room.js` nor any controllers currently store or process obstacles, walls, or furniture.
- **Requirement:** Rooms must store an array of structured obstacle objects. Each obstacle defines position, dimensions, object type, sound blocking behavior, and movement blocking behavior.

---

## 4. Proposed Room MongoDB Schema Enhancement

To preserve backward compatibility with all existing Week 1–3 tests while enabling Week 4 persistence, the `Room` schema will be updated with:
1. A nested `spawnPoint` subdocument.
2. A dedicated `obstacles` array of subdocuments.
3. An optional `layoutVersion` integer for optimistic concurrency and cache busting.

```javascript
import mongoose from 'mongoose';
import {
  DEFAULT_AUDIO_RADIUS,
  DEFAULT_ROOM_WIDTH,
  DEFAULT_ROOM_HEIGHT,
  DEFAULT_ROOM_CAPACITY,
  DEFAULT_SPAWN_X,
  DEFAULT_SPAWN_Y,
  VALID_OBSTACLE_TYPES,
} from '../config/constants.js';

/**
 * Individual obstacle / furniture sub-schema
 * Represents walls, desks, partitions, and tables inside an office.
 */
const obstacleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Obstacle name is required'],
      trim: true,
      maxlength: [100, 'Obstacle name cannot exceed 100 characters'],
    },
    type: {
      type: String,
      required: [true, 'Obstacle type is required'],
      enum: {
        values: ['wall', 'table', 'desk', 'partition', 'furniture', 'door', 'glass_wall', 'custom'],
        message: '{VALUE} is not a valid obstacle type',
      },
      default: 'furniture',
    },
    // Top-left origin coordinates within room canvas
    x: {
      type: Number,
      required: [true, 'Obstacle x coordinate is required'],
      min: [0, 'Obstacle x coordinate cannot be negative'],
    },
    y: {
      type: Number,
      required: [true, 'Obstacle y coordinate is required'],
      min: [0, 'Obstacle y coordinate cannot be negative'],
    },
    width: {
      type: Number,
      required: [true, 'Obstacle width is required'],
      min: [1, 'Obstacle width must be at least 1 pixel'],
    },
    height: {
      type: Number,
      required: [true, 'Obstacle height is required'],
      min: [1, 'Obstacle height must be at least 1 pixel'],
    },
    // Acoustic sound-blocking property
    blocksSound: {
      type: Boolean,
      default: true,
    },
    // Sound attenuation factor (0.0 = completely transparent, 1.0 = 100% sound blocking)
    soundAttenuation: {
      type: Number,
      default: 1.0,
      min: [0.0, 'Attenuation cannot be less than 0.0'],
      max: [1.0, 'Attenuation cannot exceed 1.0'],
    },
    // Physical collision property (prevents avatars from walking inside tables/walls)
    blocksMovement: {
      type: Boolean,
      default: true,
    },
    color: {
      type: String,
      default: '#334155',
      trim: true,
    },
  },
  { _id: true }
);

/**
 * Room Schema with Layout & Obstacle Persistence
 */
const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Room name is required'],
      trim: true,
      maxlength: [100, 'Room name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    dimensions: {
      width: {
        type: Number,
        default: DEFAULT_ROOM_WIDTH,
        min: [100, 'Width must be at least 100'],
      },
      height: {
        type: Number,
        default: DEFAULT_ROOM_HEIGHT,
        min: [100, 'Height must be at least 100'],
      },
    },
    // Default avatar entry coordinates
    spawnPoint: {
      x: {
        type: Number,
        default: DEFAULT_SPAWN_X, // 100
        min: [0, 'Spawn X must be non-negative'],
      },
      y: {
        type: Number,
        default: DEFAULT_SPAWN_Y, // 100
        min: [0, 'Spawn Y must be non-negative'],
      },
    },
    // Array of physical and acoustic obstacles
    obstacles: {
      type: [obstacleSchema],
      default: [],
    },
    layoutVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    audioRadius: {
      type: Number,
      default: DEFAULT_AUDIO_RADIUS,
      min: [10, 'Audio radius must be at least 10'],
      max: [1000, 'Audio radius cannot exceed 1000'],
    },
    capacity: {
      type: Number,
      default: DEFAULT_ROOM_CAPACITY,
      min: [2, 'Capacity must be at least 2'],
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    passcode: {
      type: String,
      default: null,
      select: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);
```

---

## 5. Obstacle Validation Requirements

When a client or administrator creates or updates an office layout, the backend must validate the geometric and physical integrity of the room before persisting to MongoDB:

1. **Finite Numerical Bounds:**
   - Coordinates (`x`, `y`) and dimensions (`width`, `height`) must be finite positive numbers.
   - Negative coordinates are strictly rejected (`400 Bad Request`).
2. **Room Boundary Containment:**
   - Every obstacle must reside entirely within room dimensions:
     $$0 \le x \quad \text{and} \quad x + \text{width} \le \text{room.dimensions.width}$$
     $$0 \le y \quad \text{and} \quad y + \text{height} \le \text{room.dimensions.height}$$
   - Any obstacle exceeding room boundaries is rejected.
3. **Spawn Point Safety:**
   - The room `spawnPoint` must also be inside the room dimensions:
     $$0 \le \text{spawnPoint.x} \le \text{room.dimensions.width}$$
     $$0 \le \text{spawnPoint.y} \le \text{room.dimensions.height}$$
   - **No Obstacle Entrapment:** The `spawnPoint` must not intersect any obstacle where `blocksMovement === true`. Avatars must never spawn trapped inside a brick wall or conference table.
4. **Valid Acoustic Range:**
   - `soundAttenuation` must fall between `0.0` (no muffling) and `1.0` (total silence).
5. **Sanitization:**
   - Trim obstacle names and labels; enforce maximum count per room (e.g., max 200 obstacles per room) to prevent MongoDB document bloating.

---

## 6. Seed Script Plan (`scripts/seed-rooms.js`)

To provide immediate value to frontend developers, testing teams, and demonstrations, an automated seed script will populate realistic virtual office spaces.

### Pre-configured Office Templates:
1. **"The Open Office" (1920 × 1080 px):**
   - **Spawn Point:** `[150, 150]` (Welcome lobby / reception).
   - **Obstacles:**
     - 4 individual cubicle clusters (work desks with low acoustic partitions).
     - Central glass conference room (enclosed by 4 wall segments with `blocksSound: true`, `soundAttenuation: 0.9`).
     - Break room lounge with tables and sound-dampening acoustic dividers.
2. **"Executive Boardroom" (1200 × 800 px):**
   - **Spawn Point:** `[100, 400]` (Entry hallway).
   - **Obstacles:**
     - Massive oval conference table in the center (`blocksMovement: true`, `blocksSound: false`).
     - Heavy perimeter acoustic walls isolating the room from exterior noise (`blocksSound: true`, `soundAttenuation: 1.0`).
3. **"Co-Working Floor" (2400 × 1600 px):**
   - **Spawn Point:** `[200, 200]`.
   - **Obstacles:**
     - 8 hot-desks, private phone booths (soundproof, $1.0$ attenuation), and collaborative beanbag zones.

### Seed Execution Strategy:
- Command: `npm run seed:rooms`
- Safe upsert: Uses `Room.findOneAndUpdate({ name: ... }, ..., { upsert: true })` so rerunning the seed script is non-destructive and idempotent.

---

## 7. REST API Endpoints Plan

### 7.1. `GET /api/rooms/:id/layout`
- **Purpose:** Fast retrieval of the office layout needed by the frontend canvas rendering engine.
- **Response Format `200 OK`:**
```json
{
  "success": true,
  "data": {
    "roomId": "6acc840f5b105c5599f9c56f",
    "name": "Main Open Office",
    "dimensions": { "width": 1920, "height": 1080 },
    "spawnPoint": { "x": 150, "y": 150 },
    "audioRadius": 100,
    "layoutVersion": 1,
    "obstaclesCount": 12,
    "obstacles": [
      {
        "_id": "6723ef91a5e123456789abcd",
        "name": "North Conference Wall",
        "type": "wall",
        "x": 400,
        "y": 200,
        "width": 300,
        "height": 20,
        "blocksSound": true,
        "soundAttenuation": 1.0,
        "blocksMovement": true,
        "color": "#1e293b"
      }
    ]
  }
}
```

### 7.2. `PUT /api/rooms/:id/layout`
- **Purpose:** Allows administrators and room creators to update or redesign the office layout (dimensions, spawn point, and obstacles).
- **Request Body:**
```json
{
  "dimensions": { "width": 1920, "height": 1080 },
  "spawnPoint": { "x": 200, "y": 200 },
  "obstacles": [
    {
      "name": "Executive Desk",
      "type": "desk",
      "x": 500,
      "y": 300,
      "width": 120,
      "height": 60,
      "blocksSound": false,
      "blocksMovement": true
    }
  ]
}
```
- **Validation Rules Enforced:**
  - Full geometric bounds verification via obstacle validation utility.
  - Verification that spawn point is not embedded in any obstacle.
  - Automatically increments `layoutVersion`.

### 7.3. Existing API Enhancements
- `GET /api/rooms/:id`: Returns single room details with `spawnPoint` and `obstaclesCount`.
- `POST /api/rooms`: Optionally accepts `spawnPoint` and `obstacles` during room creation.

---

## 8. Acoustic Occlusion (Sound Blocking) Strategy

Week 4 introduces obstacles that **block sound**. In addition to Euclidean distance $d \le r_{\text{audio}}$, the backend will evaluate **Line-of-Sight (LOS) sound occlusion**:

1. **2D Ray-Segment Intersection Algorithm:**
   - Let avatar A be at $(x_A, y_A)$ and avatar B be at $(x_B, y_B)$.
   - Draw a line segment $L$ between $(x_A, y_A)$ and $(x_B, y_B)$.
   - For each obstacle in the room where `blocksSound === true`:
     - Represent the obstacle rectangle by its 4 boundary segments (top, bottom, left, right).
     - Check if line segment $L$ intersects any of the 4 obstacle edges.
2. **Acoustic Attenuation Calculation:**
   - If line segment $L$ intersects an obstacle with `soundAttenuation: 1.0` (solid brick/soundproof wall), the audio is completely blocked:
     $$\text{isAudible} = \text{false}$$
   - If the obstacle is a glass partition or cubicle divider (`soundAttenuation: 0.5`), the audio signal is permitted with attenuated volume or flagged as `isMuffled: true`.
3. **Integration Point:**
   - Incorporated into `src/utils/proximity.js` and `src/sockets/signaling.js`.
   - WebRTC `signal:offer` is rejected if target peer is occluded behind a 100% soundproof wall, or permitted with an acoustic occlusion metadata flag for dynamic WebRTC audio gain control.

---

## 9. Testing Strategy

A dedicated test suite `scripts/test-week4-rooms.js` will verify all Week 4 features without regressions:

| Test Case | Scenario | Expected Outcome |
|---|---|---|
| **1. Room Creation with Layout** | Create room with valid dimensions, spawnPoint, and 3 obstacles. | HTTP 201; MongoDB document matches all coordinates and properties. |
| **2. Layout Boundary Validation** | Obstacle placed at `x: 1900, width: 100` in room of width `1920`. | HTTP 400; descriptive error indicating obstacle exceeds room bounds. |
| **3. Negative Coordinates** | Obstacle with `x: -10` or negative dimensions. | HTTP 400; rejected by Mongoose and route validator. |
| **4. Spawn Point Collision** | Spawn point placed inside a solid wall obstacle. | HTTP 400; rejected with error that spawn point cannot intersect blocking obstacles. |
| **5. Layout Retrieval (`GET`)** | Fetch `/api/rooms/:id/layout`. | HTTP 200; returns full obstacle layout array and spawn point. |
| **6. Layout Update (`PUT`)** | Update obstacles list on existing room. | HTTP 200; updates layout, increments `layoutVersion`, preserves room metadata. |
| **7. Sound Occlusion Unit Tests** | Avatars separated by a soundproof wall obstacle within audio radius. | Ray-casting utility detects collision; flags sound as occluded/blocked. |
| **8. Multi-Instance Compatibility** | Run `npm run test:multi-instance` and `npm test`. | 100% pass; no regressions in Redis adapter or WebRTC signaling. |

---

## 10. Seven-Day Development Schedule (Week 4)

| Day | Date | Primary Focus | Key Tasks |
|:---:|:---:|---|---|
| **Day 1** | 31 Oct 2026 | **Planning & Baseline Audit** *(Today)* | • Inspect existing Room & User models and controllers.<br>• Identify missing layout and obstacle properties.<br>• Draft `docs/week4-backend-plan.md`. |
| **Day 2** | 01 Nov 2026 | **Schema Updates & Constants** | • Update `src/config/constants.js` with obstacle types and default spawn point.<br>• Update `src/models/Room.js` with `spawnPoint` and `obstacles` sub-schema.<br>• Write unit tests for Room schema validation. |
| **Day 3** | 02 Nov 2026 | **Obstacle Validation Utility** | • Create `src/utils/obstacleValidation.js` (bounds checks, spawn clearance).<br>• Write unit tests for boundary collisions and invalid dimensions. |
| **Day 4** | 03 Nov 2026 | **Layout REST Endpoints** | • Implement `getRoomLayout` (`GET /api/rooms/:id/layout`).<br>• Implement `updateRoomLayout` (`PUT /api/rooms/:id/layout`).<br>• Update `createRoom` and `getRoomById` to include layout data. |
| **Day 5** | 04 Nov 2026 | **Seed Script & Realistic Offices** | • Create `scripts/seed-rooms.js` with 3 pre-built office layouts.<br>• Add `npm run seed:rooms` script to `package.json`.<br>• Verify idempotent seeding against test and development databases. |
| **Day 6** | 05 Nov 2026 | **Acoustic Occlusion Calculation** | • Implement 2D line-segment ray-casting in `src/utils/audioOcclusion.js`.<br>• Connect acoustic checks to proximity queries and WebRTC signaling.<br>• Validate sound-blocking walls in signaling tests. |
| **Day 7** | 06 Nov 2026 | **End-to-End Regression & Delivery** | • Create `scripts/test-week4-rooms.js`.<br>• Run all regression suites (`npm test`, `test:multi-instance`, `test:week4`).<br>• Update `README.md` and document Week 4 completion. |

---

## 11. Files to be Created or Modified in Week 4

```
ProxiSpeak/
├── docs/
│   └── week4-backend-plan.md                 [CREATED - Day 1]
├── src/
│   ├── config/
│   │   └── constants.js                      [TO MODIFY - Day 2]
│   ├── models/
│   │   └── Room.js                           [TO MODIFY - Day 2]
│   ├── controllers/
│   │   └── roomController.js                 [TO MODIFY - Day 4]
│   ├── routes/
│   │   └── roomRoutes.js                     [TO MODIFY - Day 4]
│   └── utils/
│       ├── obstacleValidation.js             [TO CREATE - Day 3]
│       └── audioOcclusion.js                 [TO CREATE - Day 6]
└── scripts/
    ├── seed-rooms.js                         [TO CREATE - Day 5]
    └── test-week4-rooms.js                   [TO CREATE - Day 7]
```

---

*Prepared by the Backend Team Leader on 31 October 2026.*

