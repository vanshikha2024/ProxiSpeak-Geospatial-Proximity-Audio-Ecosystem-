import mongoose from 'mongoose';

/**
 * Establishes a connection to MongoDB database using Mongoose.
 * Uses process.env.MONGODB_URI with a local fallback.
 */
const connectDB = async () => {
  try {
    const connStr = process.env.MONGODB_URI || 'mongodb://localhost:27017/proxispeak';
    const conn = await mongoose.connect(connStr);
    console.log(`[MongoDB] Database connected successfully: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[MongoDB] Error connecting to database: ${error.message}`);
    // Non-fatal during early setup, but log failure
  }
};

export default connectDB;
