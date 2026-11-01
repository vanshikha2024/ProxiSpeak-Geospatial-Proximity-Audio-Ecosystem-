import { useMemo } from "react";
import { socket } from "../network/socket";

const DEFAULT_AUDIO_RADIUS = 100;

function isValidPosition(position) {
  return (
    position !== null &&
    typeof position === "object" &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
  );
}

function getDistance(firstPosition, secondPosition) {
  const dx = secondPosition.x - firstPosition.x;
  const dy = secondPosition.y - firstPosition.y;

  return Math.hypot(dx, dy);
}

function getAudioRadius(audioRadius) {
  if (Number.isFinite(audioRadius) && audioRadius >= 0) {
    return audioRadius;
  }

  return DEFAULT_AUDIO_RADIUS;
}

function getCurrentSocketId(currentUserId) {
  return socket.id || currentUserId;
}

function isOtherUser(user, currentSocketId) {
  return user?.socketId !== currentSocketId;
}

function normalizeUserPosition(user) {
  return {
    x: Number.isFinite(user?.x) ? user.x : 0,
    y: Number.isFinite(user?.y) ? user.y : 0,
  };
}

function createNearbyUser(user, localPosition, radius) {
  const userPosition = normalizeUserPosition(user);
  const distance = getDistance(localPosition, userPosition);

  return {
    ...user,
    distance: Math.round(distance),
    isNearby: distance <= radius,
  };
}

export function useNearbyUsers(
  localPosition,
  users,
  currentUserId,
  audioRadius = DEFAULT_AUDIO_RADIUS,
) {
  return useMemo(() => {
    if (!isValidPosition(localPosition)) {
      return [];
    }

    const validUsers = Array.isArray(users) ? users : [];
    const radius = getAudioRadius(audioRadius);
    const currentSocketId = getCurrentSocketId(currentUserId);

    return validUsers
      .filter((user) => isOtherUser(user, currentSocketId))
      .map((user) => createNearbyUser(user, localPosition, radius));
  }, [localPosition, users, currentUserId, audioRadius]);
}