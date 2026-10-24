
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
    if (!userId) return undefined;

    let timer;
    let active = true;

    function scheduleUpdate() {
      if (!active || !socket.connected) return;

      const elapsed = Date.now() - lastSentAt.current;
      const delay = Math.max(0, UPDATE_INTERVAL - elapsed);

      timer = setTimeout(() => {
        if (!active || !socket.connected) return;

        const { x, y } = latestPosition.current ?? {};

        if (Number.isFinite(x) && Number.isFinite(y)) {
          socket.emit("avatar:move", { x, y });
          lastSentAt.current = Date.now();
        }

        scheduleUpdate();
      }, delay);
    }

    function handleConnect() {
      scheduleUpdate();
    }

    socket.on("connect", handleConnect);

    if (socket.connected) {
      scheduleUpdate();
    }

    return () => {
      active = false;
      clearTimeout(timer);
      socket.off("connect", handleConnect);
    };
  }, [userId]);

  return undefined;
}
