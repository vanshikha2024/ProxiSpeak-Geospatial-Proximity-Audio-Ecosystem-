import { useMemo } from "react";
import { socket } from "../network/socket";
const DEFAULT_AUDIO_RADIUS = 100;

export function useNearbyUsers(localPosition, users, currentUserId, audioRadius = DEFAULT_AUDIO_RADIUS) {
  return useMemo(() => {
    if (!localPosition || !Number.isFinite(localPosition.x) || !Number.isFinite(localPosition.y)){
        return[];
    }
    const radius = Number.isFinite(audioRadius) && audioRadius >= 0 ? audioRadius : DEFAULT_AUDIO_RADIUS;
    return users
      .filter((user) => {
        const mySocketId = socket.id || currentUserId;

        return user.socketId !== mySocketId;
      })
      .map((user) => {
        const dx = (user.x ?? 0) - localPosition.x;
        const dy = (user.y ?? 0) - localPosition.y;
        const distance = Math.hypot(dx, dy);

        return {
          ...user,
          distance: Math.round(distance),
          isNearby: distance <= radius,
        };
      });
  }, [localPosition, users, currentUserId, audioRadius]);
}
