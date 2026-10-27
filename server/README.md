# ProxiSpeak — Geospatial Proximity Audio Ecosystem

ProxiSpeak is a real-time virtual office collaboration platform built using the MERN stack, WebRTC, Socket.io, and MongoDB Geospatial queries. It enables users to interact through proximity-based spatial audio, where voice volume dynamically adjusts as avatars move closer to or farther from each other in a shared 2D virtual office workspace.

---

## Day 3 / Commit 3: Rooms/Offices Management & Geospatial Proximity REST API

This milestone introduces REST APIs for rooms, users, and 2D Euclidean spatial proximity queries:
1. **Room/Office Lifecycle**: `GET /api/rooms`, `POST /api/rooms`, `GET /api/rooms/:id`, `GET /api/rooms/:id/members`.
2. **Geospatial Proximity API**: `GET /api/users/nearby?x=...&y=...&maxDistance=100` calculates nearby active avatars with Euclidean distances and audio range flags.
3. **User Management**: `GET /api/users` (with room and status filtering) and `GET /api/users/:id`.
4. **Planar Geospatial Migration**: Migrated MongoDB coordinates indexing to planar Euclidean `2d` index with canvas boundary parameters.

---

## REST API Specification

### Rooms & Virtual Offices

#### `GET /api/rooms`
Lists all virtual office rooms with active online member counts.
- **Response `200 OK`:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "6acc840f5b105c5599f9c56f",
      "name": "Main Virtual Office",
      "description": "General open space",
      "audioRadius": 100,
      "dimensions": { "width": 1920, "height": 1080 },
      "capacity": 50,
      "activeMembersCount": 2
    }
  ]
}
```

#### `POST /api/rooms`
Creates a new virtual office room.
- **Request Body:**
```json
{
  "name": "Conference Room B",
  "description": "Executive team meeting room",
  "audioRadius": 120,
  "dimensions": { "width": 1920, "height": 1080 },
  "capacity": 25
}
```

#### `GET /api/rooms/:id`
Retrieves single room details and active member counts.

#### `GET /api/rooms/:id/members`
Returns all active/online avatars currently occupying the specified room.

---

### Geospatial Proximity & User Endpoints

#### `GET /api/users/nearby`
Calculates nearby avatars within a specified audio radius (default: 100px) in 2D Euclidean canvas space.
- **Query Parameters:**
  - `x` (number, required): Origin avatar X coordinate
  - `y` (number, required): Origin avatar Y coordinate
  - `maxDistance` or `radius` (number, optional): Maximum proximity radius (default: `100`)
  - `roomId` (string, optional): Filter by virtual room
  - `excludeId` (string, optional): Exclude requester's own avatar ID
- **Response `200 OK`:**
```json
{
  "success": true,
  "origin": { "x": 100, "y": 100 },
  "maxDistance": 100,
  "count": 1,
  "data": [
    {
      "avatarId": "6acc840f5b105c5599f9c578",
      "username": "Bob",
      "x": 150,
      "y": 100,
      "distance": 50,
      "inAudioRange": true,
      "isOnline": true
    }
  ]
}
```

#### `GET /api/users`
List users, optionally filtered by `roomId` and `isOnline`.

#### `GET /api/users/:id`
Get avatar state and profile by ID.

---

## Commit 2: Real-Time Avatar Movement & Socket.io Broadcasting

This milestone implements the real-time avatar movement synchronization layer:
1. Avatar registration and joining lifecycle (`avatar:join`, `avatar:joined`, `avatars:initial`).
2. Real-time avatar movement broadcasting (`avatar:move`, `avatar:moved`).
3. Disconnection cleanup and notification (`avatar:left`).
4. Persistence of coordinates and online status in MongoDB via Mongoose.
5. In-memory `socket.id`-to-avatar mapping to guarantee ownership without trusting client-supplied IDs.

---

## Socket.io Events Specification

### Client → Server Events

#### 1. `avatar:join`
A client connects to the virtual office and announces their display name and initial coordinates.

- **Payload:**
```json
{
  "username": "Alice",
  "x": 100,
  "y": 150,
  "avatarUrl": "https://example.com/avatar.png"
}
```
> *Note:* Also accepts `displayName` as an alias for `username`. `avatarUrl` and `avatarId` are optional.

#### 2. `avatar:move`
A connected client reports an updated (X, Y) position within the 2D virtual workspace.

- **Payload:**
```json
{
  "x": 120,
  "y": 165
}
```

---

### Server → Client Events

#### 1. `avatar:joined`
Sent to the joining client as registration confirmation, and broadcast to all existing connected clients to inform them of a newcomer.

- **Payload:**
```json
{
  "avatarId": "65b9f71c48e89f1d88a1b2c3",
  "username": "Alice",
  "x": 100,
  "y": 150,
  "isOnline": true
}
```

#### 2. `avatars:initial`
Sent exclusively to the newly joined client containing the current snapshot of all active avatars in the virtual office.

- **Payload:**
```json
[
  {
    "avatarId": "65b9f71c48e89f1d88a1b2c3",
    "username": "Alice",
    "x": 100,
    "y": 150,
    "isOnline": true
  },
  {
    "avatarId": "65b9f71c48e89f1d88a1b2c4",
    "username": "Bob",
    "x": 200,
    "y": 300,
    "isOnline": true
  }
]
```

#### 3. `avatar:moved`
Broadcast to all other connected clients when a client updates their position. The originating client does not receive this echo.

- **Payload:**
```json
{
  "avatarId": "65b9f71c48e89f1d88a1b2c3",
  "username": "Alice",
  "x": 120,
  "y": 165
}
```

#### 4. `avatar:left`
Broadcast to remaining clients when an avatar disconnects.

- **Payload:**
```json
{
  "avatarId": "65b9f71c48e89f1d88a1b2c3",
  "username": "Alice"
}
```

#### 5. `error`
Sent to a client if a sent payload fails validation (e.g., non-finite coordinate values, empty display name).

- **Payload:**
```json
{
  "message": "Invalid coordinates: x and y must be finite numbers"
}
```

---

## Architecture & Security Assumptions

1. **Socket Ownership & State Tracking:**
   - The server maintains an internal in-memory `activeAvatars` Map indexed strictly by `socket.id`.
   - On `avatar:move`, the server retrieves the avatar record bound to the caller's `socket.id`. Client-provided IDs in movement payloads are not trusted or used.
2. **MongoDB Document Lifecycle:**
   - Movement updates use atomic `findByIdAndUpdate`, updating `location.coordinates` in place rather than creating duplicate documents.
   - Disconnections mark the user record `isOnline: false` and clear `socketId` without deleting the user document.
3. **Coordinate Validation:**
   - Coordinates are validated on both the Socket event layer and Mongoose schema level using `Number.isFinite(coord)`.

---

## Geospatial Design Evaluation (2D vs 2dsphere Index)

ProxiSpeak's virtual workspace operates on a 2D Cartesian plane representing room/office pixels (e.g. 1920x1080 canvas pixels) with a planned 100-pixel proximity radius for audio attenuation:

- **Current Index (`2dsphere`):**
  MongoDB's `2dsphere` index computes distances over a spherical Earth model (WGS84 datum). It requires coordinates to fall within spherical geographic limits (longitude `[-180, 180]`, latitude `[-90, 90]`). Coordinates outside this range trigger a MongoDB error: `Longitude/latitude is out of bounds`. Furthermore, `$near` with `2dsphere` measures distances in meters/radians.
- **Recommended Index for Virtual Office (`2d`):**
  A MongoDB `2d` index (`userSchema.index({ 'location.coordinates': '2d' })` or `location: '2d'`) is purpose-built for flat, Euclidean 2D coordinate spaces:
  $$\text{distance} = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$
  This supports arbitrary pixel ranges and direct Euclidean distance calculations needed for the 100-pixel proximity radius.
- **Next Step Decision:**
  Before implementing `$near` proximity queries in Commit 3, the team should migrate the geospatial index to `2d` planar indexing to avoid latitude/longitude bounds errors on larger pixel maps.

---

## Setup & Running Locally

### 1. Environment Configuration

Copy the example environment configuration:

```bash
cp .env.example .env
```

Ensure the configuration variables in `.env` match your local environment:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/proxispeak
CORS_ORIGIN=*
NODE_ENV=development
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start MongoDB

Make sure MongoDB is running locally on port 27017:

```bash
mongod
```

### 4. Start the Backend Server

- **Development mode (with auto-reload):**
  ```bash
  npm run dev
  ```
- **Production start:**
  ```bash
  npm start
  ```

Health check is available at:
`http://localhost:5000/health`

---

## Testing & Verification

### Automated Integration Test Suite

An automated test suite (`scripts/test-sockets.js`) validates all 9 requirements (server startup, health check, dual-client concurrency, initial avatar list, position broadcasting, echo prevention, coordinate validation, MongoDB document uniqueness, and clean disconnects):

```bash
npm test
```

### Manual Multi-Client Testing Procedure

To test manually with two interactive clients:

1. Open two terminal windows or browser tabs with Socket.io test tools (e.g., [Postman WebSocket Request](https://www.postman.com/) or [Firecamp](https://firecamp.io/)).
2. Connect Client A to `ws://localhost:5000`.
3. Emit `avatar:join` with:
   ```json
   { "username": "Alice", "x": 50, "y": 50 }
   ```
4. Verify Client A receives `avatar:joined` and `avatars:initial`.
5. Connect Client B to `ws://localhost:5000`.
6. Emit `avatar:join` with:
   ```json
   { "username": "Bob", "x": 70, "y": 80 }
   ```
7. Verify Client B receives `avatars:initial` containing both Alice and Bob, and Client A receives `avatar:joined` notifying them that Bob joined.
8. From Client A, emit `avatar:move` with:
   ```json
   { "x": 60, "y": 65 }
   ```
9. Verify Client B receives `avatar:moved` with Alice's new coordinates, while Client A does not receive an echo.
10. Disconnect Client A and verify Client B receives `avatar:left` with Alice's `avatarId`.