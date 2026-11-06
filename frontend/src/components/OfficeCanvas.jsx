import { useEffect, useRef } from "react";
import { drawOffice } from "../canvas/drawOffice";

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 1200;
const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 420;
const SCALE_X = CANVAS_WIDTH / MAP_WIDTH;
const SCALE_Y = CANVAS_HEIGHT / MAP_HEIGHT;

function OfficeCanvas({
  users = [],
  currentUserId,
  localPosition,
  audioRadius = 0,
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

    drawOffice(ctx, canvasUsers, currentUserId, {
      audioRadius: audioRadius * SCALE_X,
      nearbyIds,
    });
  }, [users, currentUserId, localPosition, audioRadius]);

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