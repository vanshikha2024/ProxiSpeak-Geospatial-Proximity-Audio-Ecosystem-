// ---------------------------------------------------------------
// hooks/useRoomObstacles.js - loads the furniture and walls of a room
// from the server. If there is no layout (or the database is off),
// the list is empty and nothing blocks sound.
// ---------------------------------------------------------------
import { useEffect, useState } from "react";
import { SERVER_URL } from "../config";

export function useRoomObstacles(roomId) {
  const [obstacles, setObstacles] = useState([]);

  useEffect(() => {
    if (!roomId) return undefined;
    let cancelled = false;

    fetch(`${SERVER_URL}/api/rooms/${encodeURIComponent(roomId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((room) => {
        if (!cancelled) setObstacles(room && Array.isArray(room.obstacles) ? room.obstacles : []);
      })
      .catch(() => {
        if (!cancelled) setObstacles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return obstacles;
}
