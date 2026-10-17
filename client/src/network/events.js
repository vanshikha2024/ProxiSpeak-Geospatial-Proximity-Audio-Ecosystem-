// ---------------------------------------------------------------
// network/events.js - EVERY socket event name lives here.
//
// Why: when the team agrees on common event names, you only change
// THIS file. No hunting through the code for typos.
// ---------------------------------------------------------------
export const EVENTS = {
  // Client -> Server
  POSITION_UPDATE: "position:update", // { x, y }

  // Server -> Client
  USERS_UPDATE: "users:update", // [ { id, x, y, ... } ]
};
