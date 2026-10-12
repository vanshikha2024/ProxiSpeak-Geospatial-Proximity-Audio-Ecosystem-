# Virtual Office — MongoDB/Node.js starter

This is a database-focused starter for a React Canvas + Express + Socket.IO + MongoDB virtual office.

## 1. Install and configure

```bash
npm install
```

Copy `.env.example` to `.env`, then replace the MongoDB URI placeholders with your MongoDB Atlas connection string. Keep `.env` private and do not commit it.

```bash
npm run dev
```

The API runs on port 5000 by default. Set `CLIENT_ORIGIN` to your frontend's actual origin (Vite commonly uses `http://localhost:5173`; Create React App commonly uses `http://localhost:3000`).

## 2. Models

- `User`: username, optional email, avatar, online status and last seen time.
- `Room`: room name and canvas width/height.
- `Position`: one latest saved x/y position per user, optional room and direction.
- `Message`: optional persisted room chat; documents expire after 90 days.

MongoDB collections are created automatically when documents are first inserted. Mongoose builds the declared indexes.

## 3. REST API examples

Create a user:

```http
POST /api/users
Content-Type: application/json
{"username":"Rishi","email":"rishi@example.com","avatar":"blue-avatar"}
```

List users: `GET /api/users`

Get a user and saved position: `GET /api/users/:id`

Update user: `PATCH /api/users/:id`

Create a room:

```http
POST /api/rooms
Content-Type: application/json
{"name":"Main Office","width":1200,"height":800,"isDefault":true}
```

List rooms: `GET /api/rooms`

Save a position:

```http
PUT /api/positions/:userId
Content-Type: application/json
{"x":240,"y":180,"roomId":"ROOM_OBJECT_ID","direction":"right"}
```

Get positions in a room: `GET /api/positions/room/:roomId`

Health check: `GET /api/health`

## 4. Socket.IO client contract

Connect to the same server URL, then emit:

```js
socket.emit('joinOffice', { userId, roomId });
socket.emit('move', { x: 240, y: 180, direction: 'right' });
```

Listen for `joinedOffice`, `avatarMoved`, `userJoined`, `userLeft`, and `appError`.

Movement is broadcast immediately, while the example persists at most about once per second per connected socket. For a real deployment, validate room bounds in the socket handler too, authenticate socket connections, and handle multiple tabs/devices per user before using the online/offline status logic as authoritative.

## 5. Important notes

- This starter does not implement login/authentication. Do not expose user creation or updates publicly in production without authentication and authorization.
- If your team already has `server.js`, a database connection file, or Socket.IO setup, merge the relevant model/routes/socket code into your existing backend rather than replacing your files wholesale.
- Canvas coordinates are pixels in a flat 2D world. A MongoDB `2dsphere` index is not appropriate for arbitrary pixel x/y values; use normal numeric fields/indexes for this design. Only use GeoJSON + `2dsphere` if coordinates are geographic or transformed into an appropriate spatial coordinate system.
- Coordinate bounds should match your actual Canvas/room dimensions.
