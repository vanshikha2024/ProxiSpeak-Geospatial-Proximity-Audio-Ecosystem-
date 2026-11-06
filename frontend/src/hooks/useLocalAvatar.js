
import { useCallback, useEffect, useState } from "react";

const STEP = 15;
const MAP_WIDTH = 1920;
const MAP_HEIGHT = 1080;

export function useLocalAvatar(
  initialPosition = { x: 500, y: 250 },
  obstacles = []
) {
  const [position, setPosition] = useState(initialPosition);

  useEffect(() => {
    if (
      Number.isFinite(initialPosition?.x) &&
      Number.isFinite(initialPosition?.y)
    ) {
      setPosition({
        x: initialPosition.x,
        y: initialPosition.y,
      });
    }
  }, [initialPosition?.x, initialPosition?.y]);

  const move = useCallback((dx, dy) => {
    setPosition((current) => {
      const AVATAR_MARGIN_X = 54;
      const AVATAR_MARGIN_Y = 75;

      const next = {
        x: Math.max(
          AVATAR_MARGIN_X,
          Math.min(MAP_WIDTH - AVATAR_MARGIN_X, current.x + dx)
        ),
        y: Math.max(
          AVATAR_MARGIN_Y,
          Math.min(MAP_HEIGHT - AVATAR_MARGIN_Y, current.y + dy)
        ),
      };
      const collision = obstacles.some((obstacle) => {
        if (obstacle.blocksMovement === false) return false;

        return (
          next.x >= obstacle.x &&
          next.x <= obstacle.x + obstacle.width &&
          next.y >= obstacle.y &&
          next.y <= obstacle.y + obstacle.height
        );
      });

      return collision ? current : next;
    });
  }, [obstacles]);

  useEffect(() => {
    function handleKeyDown(event) {
      const key = event.key?.toLowerCase();
      if (!key) return;

      const directions = {
        arrowup: [0, -STEP],
        w: [0, -STEP],
        arrowdown: [0, STEP],
        s: [0, STEP],
        arrowleft: [-STEP, 0],
        a: [-STEP, 0],
        arrowright: [STEP, 0],
        d: [STEP, 0],
      };

      const direction = directions[key];
      if (!direction) return;

      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
      ) {
        return;
      }

      event.preventDefault();
      move(direction[0], direction[1]);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [move]);

  return { position, setPosition };
}
