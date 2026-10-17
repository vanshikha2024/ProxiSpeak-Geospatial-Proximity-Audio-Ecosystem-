// ---------------------------------------------------------------
// network/events.js - EVERY socket event name lives here.
//
// Why: when the team agrees on common event names, you only change
// THIS file. No hunting through the code for typos.
// ---------------------------------------------------------------
export const EVENTS = {
  // Client -> Server
  JOIN: "user:join", // { username, roomId }
  POSITION_UPDATE: "position:update", // { x, y }

  // WebRTC signaling. The server only forwards these to user "to".
  SIGNAL_OFFER: "signal:offer", // { to, offer }
  SIGNAL_ANSWER: "signal:answer", // { to, answer }
  SIGNAL_ICE: "signal:ice", // { to, candidate }

  // Server -> Client
  USERS_UPDATE: "users:update", // [ { id, x, y, ... } ]
  // The server sends the three SIGNAL_* events back with { from, ...data }
};
