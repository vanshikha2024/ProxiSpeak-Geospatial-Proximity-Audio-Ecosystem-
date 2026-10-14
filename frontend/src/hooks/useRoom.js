import { useCallback, useEffect, useState } from "react";
import { socket } from "../network/socket";

function normalizeAvatar(avatar) {
  if (!avatar || typeof avatar !== "object") {
    return null;
  }

  const avatarId = avatar.avatarId ?? avatar.socketId;

  if (!avatarId || !avatar.socketId) {
    return null;
  }

  return {
    ...avatar,
    id: avatarId,
    avatarId,
    socketId: avatar.socketId,
    name: avatar.username ?? avatar.name ?? "Guest",
  };
}

export function useRoom() {
  const [userId, setUserId] = useState(null);
  const [users, setUsers] = useState([]);
  const [roomError, setRoomError] = useState("");

  useEffect(() => {
    function handleInitialAvatars(avatars) {
      const initialUsers = Array.isArray(avatars)
        ? avatars.map(normalizeAvatar).filter(Boolean)
        : [];

      setUsers(initialUsers);
      setUserId(socket.id ?? null);
      setRoomError("");
    }

    function handleAvatarJoined(avatar) {
      const normalized = normalizeAvatar(avatar);

      if (!normalized) return;

      setUsers((currentUsers) => {
        const alreadyExists = currentUsers.some(
          (user) => user.socketId === normalized.socketId
        );

        if (alreadyExists) {
          return currentUsers.map((user) =>
            user.socketId === normalized.socketId
              ? { ...user, ...normalized }
              : user
          );
        }

        return [...currentUsers, normalized];
      });
    }

    function handleAvatarMoved(avatar) {
      const normalized = normalizeAvatar(avatar);

      if (!normalized) return;

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.socketId === normalized.socketId
            ? { ...user, ...normalized }
            : user
        )
      );
    }

    function handleAvatarLeft(avatar) {
      if (!avatar) return;

      setUsers((currentUsers) =>
        currentUsers.filter(
          (user) =>
            user.socketId !== avatar.socketId &&
            user.avatarId !== avatar.avatarId
        )
      );
    }

    function handleRoomError(data) {
      setRoomError(data?.message || "Unable to join the office.");
    }

    function handleDisconnect() {
      setUserId(null);
      setUsers([]);
    }

    socket.on("avatars:initial", handleInitialAvatars);
    socket.on("avatar:joined", handleAvatarJoined);
    socket.on("avatar:moved", handleAvatarMoved);
    socket.on("avatar:left", handleAvatarLeft);
    socket.on("error", handleRoomError);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("avatars:initial", handleInitialAvatars);
      socket.off("avatar:joined", handleAvatarJoined);
      socket.off("avatar:moved", handleAvatarMoved);
      socket.off("avatar:left", handleAvatarLeft);
      socket.off("error", handleRoomError);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  const joinRoom = useCallback(
    (username, roomId, position = { x: 0, y: 0 }) => {
      if (!socket.connected) {
        setRoomError("Not connected to the server yet.");
        return;
      }

      const cleanUsername =
        typeof username === "string" ? username.trim() : "";

      const cleanRoomId =
        typeof roomId === "string" ? roomId.trim() : "";

      const safePosition =
        position && typeof position === "object" ? position : {};

      const x = safePosition.x ?? 0;
      const y = safePosition.y ?? 0;

      if (
        !cleanUsername ||
        !cleanRoomId ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        setRoomError("Enter a valid username, room ID, and position.");
        return;
      }

      setRoomError("");

      socket.emit("avatar:join", {
        username: cleanUsername,
        x,
        y,
        roomId: cleanRoomId,
      });
    },
    []
  );

  return { userId, users, roomError, joinRoom };
}
