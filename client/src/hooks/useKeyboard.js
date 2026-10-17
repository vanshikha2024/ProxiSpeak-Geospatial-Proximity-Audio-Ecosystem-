// ---------------------------------------------------------------
// hooks/useKeyboard.js - remembers which movement keys are held down.
// Returns a ref (a Set of key names) that the game loop reads.
// ---------------------------------------------------------------
import { useEffect, useRef } from "react";

const MOVE_KEYS = [
  "w", "a", "s", "d",
  "arrowup", "arrowdown", "arrowleft", "arrowright",
];

export function useKeyboard() {
  const keysRef = useRef(new Set());

  useEffect(() => {
    const keys = keysRef.current;

    function onKeyDown(event) {
      const key = event.key.toLowerCase();
      if (!MOVE_KEYS.includes(key)) return;
      event.preventDefault(); // stop arrow keys from scrolling the page
      keys.add(key);
    }

    function onKeyUp(event) {
      keys.delete(event.key.toLowerCase());
    }

    // If the window loses focus, forget all keys (avoids a "stuck" key).
    function clearKeys() {
      keys.clear();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
    };
  }, []);

  return keysRef;
}