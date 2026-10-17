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

const users = new Map();

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  users.set(socket.id, { id: socket.id, x: 100, y: 100 });
  io.emit("users:update", Array.from(users.values()));

  socket.on("position:update", (position) => {
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) return;

    const user = users.get(socket.id);
    if (!user) return;

    user.x = Math.max(18, Math.min(702, position.x));
    user.y = Math.max(18, Math.min(422, position.y));
    io.emit("users:update", Array.from(users.values()));
  });

  socket.on("disconnect", () => {
    users.delete(socket.id);
    io.emit("users:update", Array.from(users.values()));
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
