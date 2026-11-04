import { Router } from "express";
import mongoose from "mongoose";
import Position from "../models/Position.js";
import Room from "../models/Room.js";
import User from "../models/User.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.get(
  "/room/:roomId",
  validateObjectId("roomId"),
  asyncHandler(async (req, res) => {
    if (!(await Room.exists({ _id: req.params.roomId })))
      return res
        .status(404)
        .json({ success: false, message: "Room not found." });
    const positions = await Position.find({ roomId: req.params.roomId })
      .populate("userId", "username avatar status")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({
      success: true,
      count: positions.length,
      data: positions,
    });
  }),
);

router.put(
  "/:userId",
  validateObjectId("userId"),
  asyncHandler(async (req, res) => {
    const { x, y, roomId, direction, isMoving } = req.body || {};
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0)
      return res
        .status(400)
        .json({
          success: false,
          message: "x and y must be finite, non-negative numbers.",
        });
    if (
      roomId !== undefined &&
      roomId !== null &&
      roomId !== "" &&
      !mongoose.isValidObjectId(roomId)
    )
      return res
        .status(400)
        .json({ success: false, message: "Invalid roomId." });
    if (
      direction !== undefined &&
      !["up", "down", "left", "right"].includes(direction)
    )
      return res
        .status(400)
        .json({
          success: false,
          message: "direction must be up, down, left, or right.",
        });
    if (isMoving !== undefined && typeof isMoving !== "boolean")
      return res
        .status(400)
        .json({ success: false, message: "isMoving must be a boolean." });

    const update = { x, y, lastUpdated: new Date() };
    if (roomId !== undefined) update.roomId = roomId || null;
    if (direction !== undefined) update.direction = direction;
    if (isMoving !== undefined) update.isMoving = isMoving;
    if (update.roomId) {
      const room = await Room.findById(update.roomId)
        .select("width height")
        .lean();
      if (!room)
        return res
          .status(404)
          .json({ success: false, message: "Room not found." });
      if (x > room.width || y > room.height)
        return res
          .status(400)
          .json({
            success: false,
            message: "Position is outside room boundaries.",
            bounds: { width: room.width, height: room.height },
          });
    }
    if (!(await User.exists({ _id: req.params.userId })))
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    const position = await Position.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: update, $setOnInsert: { userId: req.params.userId } },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
    return res.json({ success: true, data: position });
  }),
);
export default router;
