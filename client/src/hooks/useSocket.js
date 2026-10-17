// ---------------------------------------------------------------
// hooks/useSocket.js - connects to the server and keeps the list
// of users up to date.
//
// Returns:
//   socket    - the socket (use socket.emit to send things)
//   connected - true when we are connected to the server
//   users     - list of users (for text on the page, e.g. "3 online")
//   usersRef  - the same list in a ref (for the 60-FPS game loop)
//   myId      - my own socket id
//   spawn     - { x, y } where the server placed me (set once per connection)
// ---------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import socket from "../network/socket";

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState([]);
  const [myId, setMyId] = useState("");
  const [spawn, setSpawn] = useState(null);

  const usersRef = useRef([]);
  const spawnedRef = useRef(false); // did I already receive my start position?

  useEffect(() => {
    function onConnect() {
      setMyId(socket.id);
      setConnected(true);
    }

    function onDisconnect() {
      // After a reconnect we get a NEW id and a new spawn point.
      spawnedRef.current = false;
      setConnected(false);
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
    socket.on("disconnect", onDisconnect);
    socket.on("users:update", onUsersUpdate);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("users:update", onUsersUpdate);
      socket.disconnect();
    };
  }, []);

  return { socket, connected, users, usersRef, myId, spawn };
}