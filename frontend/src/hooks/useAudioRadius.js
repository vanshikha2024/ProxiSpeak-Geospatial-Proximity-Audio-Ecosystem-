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
          `${SERVER_URL}/api/rooms/${encodeURIComponent(roomId)}/config`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch room configuration");
        }

        const data = await response.json();

        if (Number.isFinite(data.audioRadius) && data.audioRadius > 0) {
          setAudioRadius(data.audioRadius);
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
