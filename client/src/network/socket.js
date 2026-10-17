// ---------------------------------------------------------------
// network/socket.js - the ONE socket connection used by the app.
// autoConnect:false means we connect manually (see hooks/useSocket.js).
// ---------------------------------------------------------------
import { io } from "socket.io-client";
import { SERVER_URL } from "../config";

const socket = io(SERVER_URL, {
  autoConnect: false,
});

export default socket;