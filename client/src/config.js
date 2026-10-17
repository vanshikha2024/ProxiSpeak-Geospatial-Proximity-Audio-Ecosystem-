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

// Where the backend server lives
export const SERVER_URL = "http://localhost:5000";