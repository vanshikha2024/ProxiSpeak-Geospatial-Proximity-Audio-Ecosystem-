import { useEffect, useRef } from "react";
import { drawOffice } from "../canvas/drawOffice";

const MAP_WIDTH = 1920;
const MAP_HEIGHT = 1080;
const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 420;
const SCALE_X = CANVAS_WIDTH / MAP_WIDTH;
const SCALE_Y = CANVAS_HEIGHT / MAP_HEIGHT;

function OfficeCanvas({
  users = [],
  currentUserId,
  localPosition,
  audioRadius = 0,
  obstacles = [],
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const canvasUsers = [
      ...(currentUserId
        ? [{
            id: currentUserId,
            name: "You",
            x: localPosition?.x ?? 500,
            y: localPosition?.y ?? 250,
          }]
        : []),
      ...users,
    ].map((user) => ({
      ...user,
      x: user.x * SCALE_X,
      y: user.y * SCALE_Y,
    }));

    const nearbyIds = new Set(
      users.filter((user) => user.isNearby).map((user) => user.id)
    );
    const canvasObstacles = obstacles.map((item) => ({
      ...item,
      x: item.x * SCALE_X,
      y: item.y * SCALE_Y,
      width: item.width * SCALE_X,
      height: item.height * SCALE_Y,
    }));

    drawOffice(ctx, canvasUsers, currentUserId, {
      audioRadius: audioRadius * SCALE_X,
      nearbyIds,
      obstacles: canvasObstacles,
    });
  }, [users, currentUserId, localPosition, audioRadius, obstacles]);

  return (
    <canvas
      ref={canvasRef}
      className="office-canvas"
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      style={{ display: "block", width: "100%", height: "auto" }}
      role="img"
      aria-label="Virtual office showing your avatar and teammates"
    />
  );
}

export default OfficeCanvas;