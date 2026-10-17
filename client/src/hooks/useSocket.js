// ---------------------------------------------------------------
// hooks/useSocket.js - connects to the server and keeps the list
// of users up to date.
//
// Returns:
//   socket    - the socket (use socket.emit to send things)
//   connected - true when we are connected to the server
//   connectError - text like "xhr poll error" if we cannot reach the server
//   users     - list of users (for text on the page, e.g. "3 online")
//   usersRef  - the same list in a ref (for the 60-FPS game loop)
//   myId      - my own socket id
//   spawn     - { x, y } where the server placed me (set once per connection)
// ---------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import socket from "../network/socket";
import { EVENTS } from "../network/events";

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [users, setUsers] = useState([]);
  const [myId, setMyId] = useState("");
  const [spawn, setSpawn] = useState(null);

  const usersRef = useRef([]);
  const spawnedRef = useRef(false); // did I already receive my start position?

  useEffect(() => {
    function onConnect() {
      setMyId(socket.id);
      setConnected(true);
      setConnectError("");
    }

    // Called when the server cannot be reached (server off, wrong URL...)
    function onConnectError(error) {
      setConnectError(error.message || "Cannot reach the server");
    }

    function onDisconnect() {
      // After a reconnect we get a NEW id and a new spawn point.
      spawnedRef.current = false;
      setConnected(false);
      // Warn the person if the server goes away while they are in the office.
      setConnectError("Lost connection to the server");
    }

    function onUsersUpdate(nextUsers) {
      usersRef.current = nextUsers;
      setUsers(nextUsers);

      // Take my start position from the server ONLY ONCE.
      // After that my local position is the truth (see OfficeCanvas).
      const me = nextUsers.find((user) => user.id === socket.id);
      if (me && !spawnedRef.current) {
        spawnedRef.current = true;
        setSpawn({ x: me.x, y: me.y });
      }
    }

    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);
    socket.on(EVENTS.USERS_UPDATE, onUsersUpdate);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
      socket.off(EVENTS.USERS_UPDATE, onUsersUpdate);
      socket.disconnect();
    };
  }, []);

  return { socket, connected, connectError, users, usersRef, myId, spawn };
}
