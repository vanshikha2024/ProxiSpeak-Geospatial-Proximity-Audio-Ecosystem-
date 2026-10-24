
import { useEffect, useRef, useState } from "react";

const SMOOTHING = 12;

export function useInterpolatedAvatars(users) {
  const [displayUsers, setDisplayUsers] = useState(users);
  const usersRef = useRef(users);
  const targetsRef = useRef(new Map());
  const currentRef = useRef(new Map());

  useEffect(() => {
    usersRef.current = users;

    const activeIds = new Set();

    for (const user of users) {
      const id = user.id ?? user.socketId;
      if (!id) continue;

      activeIds.add(id);

      const target = {
        x: Number.isFinite(user.x) ? user.x : 100,
        y: Number.isFinite(user.y) ? user.y : 100,
      };

      targetsRef.current.set(id, target);

      if (!currentRef.current.has(id)) {
        currentRef.current.set(id, { ...target });
      }
    }

    for (const id of currentRef.current.keys()) {
      if (!activeIds.has(id)) {
        currentRef.current.delete(id);
        targetsRef.current.delete(id);
      }
    }
  }, [users]);

  useEffect(() => {
    let frameId;
    let previousTime = 0;

    function animate(time) {
      const delta = previousTime
        ? Math.min((time - previousTime) / 1000, 0.1)
        : 0;

      previousTime = time;

      const factor = 1 - Math.exp(-SMOOTHING * delta);

      for (const [id, target] of targetsRef.current) {
        const current = currentRef.current.get(id);
        if (!current) continue;

        current.x += (target.x - current.x) * factor;
        current.y += (target.y - current.y) * factor;
      }

      setDisplayUsers(
        usersRef.current.map((user) => {
          const id = user.id ?? user.socketId;
          const current = currentRef.current.get(id);

          return current
            ? { ...user, x: current.x, y: current.y }
            : user;
        })
      );

      frameId = requestAnimationFrame(animate);
    }

    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
  }, []);

  return displayUsers;
}
