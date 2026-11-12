import { Router } from "express";
import mongoose from "mongoose";
import Room from "../models/Room.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const router = Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const {
      name,
      description = "",
      width = 1200,
      height = 800,
      isDefault = false,
    } = req.body || {};
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 80
    )
      return res
        .status(400)
        .json({
          success: false,
          message: "Room name must be between 2 and 80 characters",
        });
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 100 ||
      height < 100 ||
      width > 10000 ||
      height > 10000
    )
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Room width and height must be integers between 100 and 10000",
        });
    if (
      typeof description !== "string" ||
      description.length > 500 ||
      typeof isDefault !== "boolean"
    )
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid description or isDefault value.",
        });
    if (req.body.createdBy && !mongoose.isValidObjectId(req.body.createdBy))
      return res
        .status(400)
        .json({ success: false, message: "Invalid createdBy user ID." });
    if (isDefault)
      await Room.updateMany(
        { isDefault: true },
        { $set: { isDefault: false } },
      );
    const room = await Room.create({
      name: name.trim(),
      description: description.trim(),
      width,
      height,
      isDefault,
      createdBy: req.body.createdBy || null,
    });
    return res.status(201).json({ success: true, data: room });
  }),
);
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rooms = await Room.find().sort({ isDefault: -1, name: 1 }).lean();
    return res.json({ success: true, count: rooms.length, data: rooms });
  }),
);
router.get(
  "/:roomId",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.roomId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid roomId." });
    const room = await Room.findById(req.params.roomId).lean();
    if (!room)
      return res
        .status(404)
        .json({ success: false, message: "Room not found." });
    return res.json({ success: true, data: room });
  }),
);
export default router;
