import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  width: { type: Number, required: true, min: 100, default: 1200 },
  height: { type: Number, required: true, min: 100, default: 800 },
  isDefault: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false });

roomSchema.index({ name: 1 }, { unique: true });
export default mongoose.model('Room', roomSchema);
