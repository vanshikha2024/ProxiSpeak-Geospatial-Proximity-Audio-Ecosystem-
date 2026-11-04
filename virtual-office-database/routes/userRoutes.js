import { Router } from "express";
import User from "../models/User.js";
import Position from "../models/Position.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
const router = Router();
const editableFields = ["username", "email", "avatar", "status"];
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { username, email, avatar } = req.body || {};
    if (
      typeof username !== "string" ||
      username.trim().length < 2 ||
      username.trim().length > 30
    )
      return res
        .status(400)
        .json({
          success: false,
          message: "username must be between 2 and 30 characters.",
        });
    if (
      email !== undefined &&
      email !== "" &&
      (typeof email !== "string" || !validEmail(email))
    )
      return res
        .status(400)
        .json({
          success: false,
          message: "Please provide a valid email address.",
        });
    const user = await User.create({
      username: username.trim(),
      email: email || undefined,
      avatar,
    });
    const position = await Position.create({
      userId: user._id,
      x: 100,
      y: 100,
    });
    return res.status(201).json({ success: true, data: { user, position } });
  }),
);
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 50, 1),
      200,
    );
    const users = await User.find().sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ success: true, count: users.length, data: users });
  }),
);
router.get(
  "/:id",
  validateObjectId("id"),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).lean();
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    const position = await Position.findOne({ userId: user._id }).lean();
    return res.json({ success: true, data: { user, position } });
  }),
);
router.patch(
  "/:id",
  validateObjectId("id"),
  asyncHandler(async (req, res) => {
    const updates = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) =>
        editableFields.includes(key),
      ),
    );
    if (!Object.keys(updates).length)
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Provide at least one supported field: username, email, avatar, status.",
        });
    if (
      updates.username !== undefined &&
      (typeof updates.username !== "string" ||
        updates.username.trim().length < 2 ||
        updates.username.trim().length > 30)
    )
      return res
        .status(400)
        .json({
          success: false,
          message: "username must be between 2 and 30 characters.",
        });
    if (
      updates.email !== undefined &&
      updates.email !== "" &&
      (typeof updates.email !== "string" || !validEmail(updates.email))
    )
      return res
        .status(400)
        .json({
          success: false,
          message: "Please provide a valid email address.",
        });
    if (
      updates.status !== undefined &&
      !["online", "away", "offline"].includes(updates.status)
    )
      return res
        .status(400)
        .json({
          success: false,
          message: "status must be online, away, or offline.",
        });
    if (updates.username !== undefined)
      updates.username = updates.username.trim();
    if (updates.email !== undefined)
      updates.email = updates.email.trim().toLowerCase() || undefined;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true },
    );
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    return res.json({ success: true, data: user });
  }),
);
export default router;
