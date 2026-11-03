// ---------------------------------------------------------------
// services/roomLayout.js - checks an office layout before it is saved.
// A layout is the size of the office plus the furniture and walls
// (obstacles) that block sound. No database needed to check it.
// ---------------------------------------------------------------
const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 420;
const MAX_SIZE = 2000;
const MAX_OBSTACLES = 200;
const MAX_LABEL = 30;

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

// Returns { value: { width, height, obstacles } } or { error: "message" }
function validateLayout(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "The layout must be an object" };
  }

  const width = input.width ?? DEFAULT_WIDTH;
  const height = input.height ?? DEFAULT_HEIGHT;
  if (!isNumber(width) || width < 1 || width > MAX_SIZE) {
    return { error: `width must be a number from 1 to ${MAX_SIZE}` };
  }
  if (!isNumber(height) || height < 1 || height > MAX_SIZE) {
    return { error: `height must be a number from 1 to ${MAX_SIZE}` };
  }

  const list = input.obstacles ?? [];
  if (!Array.isArray(list)) return { error: "obstacles must be a list" };
  if (list.length > MAX_OBSTACLES) {
    return { error: `at most ${MAX_OBSTACLES} obstacles are allowed` };
  }

  const obstacles = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") {
      return { error: `obstacle ${i + 1} must be an object` };
    }
    const { x, y } = item;
    const w = item.width;
    const h = item.height;
    if (![x, y, w, h].every(isNumber)) {
      return { error: `obstacle ${i + 1} needs numeric x, y, width and height` };
    }
    if (w < 1 || h < 1) {
      return { error: `obstacle ${i + 1} must be at least 1 px wide and tall` };
    }
    if (x < 0 || y < 0 || x + w > width || y + h > height) {
      return { error: `obstacle ${i + 1} must be fully inside the office` };
    }
    const label = typeof item.label === "string" ? item.label.trim().slice(0, MAX_LABEL) : "";
    obstacles.push({ x, y, width: w, height: h, label });
  }

  return { value: { width, height, obstacles } };
}

module.exports = { validateLayout, DEFAULT_WIDTH, DEFAULT_HEIGHT };
