import { useCallback, useEffect, useState } from "react";

const INITIAL_POSITION = { x: 500, y: 250 };
const STEP = 15;
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 1200;

export function useLocalAvatar() {
  const [position, setPosition] = useState(INITIAL_POSITION);

  const move = useCallback((dx, dy) => {
    setPosition((current) => ({
      x: Math.max(0, Math.min(MAP_WIDTH, current.x + dx)),
      y: Math.max(0, Math.min(MAP_HEIGHT, current.y + dy)),
    }));
  }, []);

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
      console.log("Movement key pressed:", key);
      move(direction[0], direction[1]);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [move]);

  return { position, setPosition };
}