// ---------------------------------------------------------------
// canvas/drawOffice.js - everything that PAINTS the office.
// It only draws; it does not move anything or talk to the server.
//
// options (all optional):
//   audioRadius - draw a circle of this size around ME
//   nearbyIds   - a Set of user ids to highlight with a green ring
// ---------------------------------------------------------------
import { WIDTH, HEIGHT, RADIUS } from "../config";

// ---------------------------------------------------------------
// drawOffice: paints ONE frame on the canvas.
// It is called ~60 times per second.
// ---------------------------------------------------------------
export function drawOffice(ctx, users, myId, options = {}) {
  const { audioRadius = 0, nearbyIds = new Set(), obstacles = [] } = options;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // Office floor
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Grid lines
  ctx.strokeStyle = "#edf1f7";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  // Team area
  ctx.fillStyle = "#eef2fa";
  ctx.strokeStyle = "#d6deef";
  ctx.beginPath();
  ctx.roundRect(390, 38, 240, 100, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#64748b";
  ctx.font = "bold 12px Arial";
  ctx.fillText("TEAM AREA", 408, 60);

  // Three desks inside the team area
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = "#dbe5f5";
    ctx.fillRect(408 + i * 70, 74, 62, 22);
  }

  // Meeting area
  ctx.fillStyle = "#f5f0ff";
  ctx.strokeStyle = "#e7dafa";
  ctx.beginPath();
  ctx.roundRect(390, 175, 240, 90, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#64748b";
  ctx.fillText("MEETING SPACE", 408, 198);

  // Meeting table
  ctx.fillStyle = "#e6def8";
  ctx.beginPath();
  ctx.roundRect(430, 215, 160, 24, 12);
  ctx.fill();

  // Furniture and walls (they block sound between people)
  obstacles.forEach((item) => {
    ctx.fillStyle = "#e2e8f0";
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.fillRect(item.x, item.y, item.width, item.height);
    ctx.strokeRect(item.x, item.y, item.width, item.height);
    if (item.label) {
      ctx.fillStyle = "#475569";
      ctx.font = "10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.label, item.x + item.width / 2, item.y + item.height / 2);
    }
  });
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  // The audio radius: a soft circle around ME showing who can hear me.
  const me = users.find((user) => user.id === myId);
  if (me && audioRadius > 0) {
    ctx.beginPath();
    ctx.arc(me.x, me.y, audioRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(99, 91, 219, 0.07)";
    ctx.fill();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(99, 91, 219, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Avatars: a light outer circle + a darker inner circle,
  // the first letter of the name inside, and the full name above.
  users.forEach((user) => {
    const isMe = user.id === myId;
    const name = user.name || "Guest";

    ctx.beginPath();
    ctx.arc(user.x, user.y, RADIUS + 4, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? "#c7d2fe" : "#cbd5e1";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(user.x, user.y, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? "#635bdb" : "#64748b";
    ctx.fill();

    // Green ring = this person is inside my audio radius
    if (nearbyIds.has(user.id)) {
      ctx.beginPath();
      ctx.arc(user.x, user.y, RADIUS + 6, 0, Math.PI * 2);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // First letter inside the circle
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.charAt(0).toUpperCase(), user.x, user.y);

    // Name above the circle
    ctx.fillStyle = "#334155";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    const label = isMe ? `${name} (you)` : name;
    const labelY = user.y - RADIUS - 12;
    const labelWidth = ctx.measureText(label).width;
    const labelX = Math.max(
      labelWidth / 2 + 4,
      Math.min(WIDTH - labelWidth / 2 - 4, user.x)
    );

    const sameSpot = users.some(
      (other) => other.id !== user.id &&
        Math.abs(other.x - user.x) < RADIUS * 2 &&
        Math.abs(other.y - user.y) < RADIUS * 2
    );
    ctx.fillText(label, labelX, labelY - (sameSpot && !isMe ? 14 : 0));
  });

  // Reset text settings so the next frame starts clean
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}