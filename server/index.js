const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Development mode: Vite may choose 5173, 5174, 5175, etc.
app.use(cors({ origin: true }));

app.get("/", (_req, res) => {
  res.send("ProxiSpeak server is running!");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ProxiSpeak server" });
});

const io = new Server(server, {
  cors: { origin: true },
});

// All connected users who have joined an office.
// Map of socket id -> { id, name, room, x, y }
const users = new Map();

const DEFAULT_ROOM = "main-office";

// Clean text that comes from the browser (never trust it).
function cleanName(value) {
  const name = String(value || "").trim().slice(0, 20);
  return name || "Guest";
}

function cleanRoom(value) {
  const room = String(value || "").trim().slice(0, 30);
  // Only letters, numbers, "-" and "_" are allowed in a room id.
  return /^[\w-]+$/.test(room) ? room : DEFAULT_ROOM;
}

// Everyone in ONE room.
function usersInRoom(room) {
  return Array.from(users.values()).filter((user) => user.room === room);
}

// Send the user list to everybody in a room (and nobody else).
function broadcastRoom(room) {
  io.to(room).emit("users:update", usersInRoom(room));
}

// Remove a user from their room and tell the others.
function removeUser(socket) {
  const user = users.get(socket.id);
  if (!user) return;

  users.delete(socket.id);
  socket.leave(user.room);
  broadcastRoom(user.room);
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // The browser sends this after the person typed a name and room.
  socket.on("user:join", (data) => {
    removeUser(socket); // in case they were already in another room

    const room = cleanRoom(data && data.roomId);
    const name = cleanName(data && data.username);

    // Spread new users out a little so they do not stand on each other.
    const count = usersInRoom(room).length;
    const x = 100 + (count % 8) * 60;
    const y = 100 + Math.floor(count / 8) * 60;

    users.set(socket.id, { id: socket.id, name, room, x, y });
    socket.join(room);
    broadcastRoom(room);
    console.log(`${name} joined room "${room}"`);
  });

  socket.on("position:update", (position) => {
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) return;

    const user = users.get(socket.id);
    if (!user) return; // ignore people who have not joined

    user.x = Math.max(18, Math.min(702, position.x));
    user.y = Math.max(18, Math.min(402, position.y));
    broadcastRoom(user.room);
  });

  socket.on("disconnect", () => {
    removeUser(socket);
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = Number(process.env.PORT) || 5000;

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the old server process, then run npm run dev again.`);
  } else {
    console.error("Server error:", error);
  }
  process.exitCode = 1;
});

server.listen(PORT, () => {
  console.log(`ProxiSpeak server running at http://localhost:${PORT}`);
});
