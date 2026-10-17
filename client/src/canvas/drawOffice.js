// ---------------------------------------------------------------
// canvas/drawOffice.js - everything that PAINTS the office.
// It only draws; it does not move anything or talk to the server.
// ---------------------------------------------------------------
import { WIDTH, HEIGHT, RADIUS } from "../config";
export function drawoffice(ctx, users, myId) {
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

  // Avatars: a light outer circle + a darker inner circle + a label
  users.forEach((user, index) => {
    const isMe = user.id === myId;

    ctx.beginPath();
    ctx.arc(user.x, user.y, RADIUS + 4, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? "#c7d2fe" : "#cbd5e1";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(user.x, user.y, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? "#635bdb" : "#64748b";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(isMe ? "YOU" : `P${index + 1}`, user.x, user.y);
  });

  // Reset text settings so the next frame starts clean
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}
