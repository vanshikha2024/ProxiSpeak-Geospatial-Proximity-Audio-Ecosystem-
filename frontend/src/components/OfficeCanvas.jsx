import { useEffect, useRef } from "react";
import { drawOffice } from "../canvas/drawOffice";

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 420;

function OfficeCanvas({
  users = [],
  currentUserId,
  localPosition,
  audioRadius = 0,
  obstacles = [],
  roomWidth = 1920,
  roomHeight = 1080,
}) {
  const canvasRef = useRef(null);
  const SCALE_X = CANVAS_WIDTH / roomWidth;
  const SCALE_Y = CANVAS_HEIGHT / roomHeight;

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
    }, [
      users,
      currentUserId,
      localPosition,
      audioRadius,
      obstacles,
      roomWidth,
      roomHeight,
    ]);
    
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