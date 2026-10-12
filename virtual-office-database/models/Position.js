import mongoose from 'mongoose';

const positionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
  x: { type: Number, required: true, default: 100, min: 0 },
  y: { type: Number, required: true, default: 100, min: 0 },
  direction: { type: String, enum: ['up', 'down', 'left', 'right'], default: 'down' }
}, { timestamps: true, versionKey: false });

positionSchema.index({ roomId: 1 });
// Canvas x/y values are planar pixel coordinates. Do not use a 2dsphere index
// unless coordinates are real longitude/latitude or have been transformed appropriately.
export default mongoose.model('Position', positionSchema);
