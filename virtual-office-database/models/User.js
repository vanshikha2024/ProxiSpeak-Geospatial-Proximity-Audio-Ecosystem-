import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    trim: true,
    minlength: 2,
    maxlength: 30
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
    maxlength: 254
  },
  avatar: {
    type: String,
    default: 'default-avatar'
  },
  status: {
    type: String,
    enum: ['online', 'away', 'offline'],
    default: 'offline'
  },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true, versionKey: false });

userSchema.index({ username: 1 });
export default mongoose.model('User', userSchema);
