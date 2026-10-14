import { useEffect, useRef } from "react";
import { socket } from "../network/socket";

const UPDATE_INTERVAL = 50;

export function useAvatarSync(position, userId) {
  const latestPosition = useRef(position);
  const lastSentAt = useRef(0);

  useEffect(() => {
    latestPosition.current = position;
  }, [position]);

  useEffect(() => {
    if (!userId || !socket.connected) return undefined;

    let timer;

    function scheduleUpdate() {
      const elapsed = Date.now() - lastSentAt.current;
      const delay = Math.max(0, UPDATE_INTERVAL - elapsed);

      timer = setTimeout(() => {
        if (!socket.connected) return;

        const { x, y } = latestPosition.current ?? {};

        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        socket.emit("avatar:move", { x, y });
        lastSentAt.current = Date.now();
      }, delay);
    }

    scheduleUpdate();

    return () => {
      clearTimeout(timer);
    };
  }, [position, userId]);

  return undefined;
}
