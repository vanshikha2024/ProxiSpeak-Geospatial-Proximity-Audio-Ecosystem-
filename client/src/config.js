// ---------------------------------------------------------------
// config.js - all the numbers and settings in ONE place.
// Change a value here and the whole app uses it.
// ---------------------------------------------------------------

// Size of the virtual office (canvas) in pixels
export const WIDTH = 720;
export const HEIGHT = 420;

// Avatar size and how close to the wall an avatar may go
export const RADIUS = 16;
export const EDGE = 18; // same limit as the server (18 px)

// Walking speed in pixels per second
export const SPEED = 180;

// Send my position at most every 50 ms (= 20 times per second)
export const SEND_EVERY_MS = 50;

// How close (in pixels) another avatar must be for us to hear each other.
// The project document says 100 pixels.
export const AUDIO_RADIUS = 100;

// Where the backend server lives.
// Set VITE_SERVER_URL in client/.env (see .env.example).
// If it is not set, we use the local server on port 5000.
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:5000";
