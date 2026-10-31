import { useEffect, useState } from "react";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

export function useAudioRadius(roomId) {
  const [audioRadius, setAudioRadius] = useState(100);

  useEffect(() => {
    if (!roomId || !SERVER_URL) return;

    const controller = new AbortController();

    async function fetchAudioRadius() {
      try {
        const response = await fetch(
          `${SERVER_URL}/api/rooms/${encodeURIComponent(roomId)}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          const details = await response.text();
          throw new Error(`Room request failed (${response.status}): ${details}`);
        }

        const data = await response.json();

        if (
          Number.isFinite(data.data?.audioRadius) &&
          data.data.audioRadius > 0
        ) {
          setAudioRadius(data.data.audioRadius);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Could not fetch audio radius:", error);
        }
      }
    }

    fetchAudioRadius();

    return () => controller.abort();
  }, [roomId]);

  return audioRadius;
}
