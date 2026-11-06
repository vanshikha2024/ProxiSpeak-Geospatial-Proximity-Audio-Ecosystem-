import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    // Preserve local MongoDB fallback
    const connStr =
      process.env.MONGODB_URI ||
      'mongodb://localhost:27017/proxispeak';

    // Mongoose configuration
    mongoose.set('strictQuery', true);
    mongoose.set('bufferCommands', false);

    // Database connection
    const conn = await mongoose.connect(connStr, {
      serverSelectionTimeoutMS:
        Number(process.env.DB_SERVER_SELECTION_TIMEOUT_MS) || 10000,

      maxPoolSize: Number(process.env.DB_MAX_POOL_SIZE) || 10,

      minPoolSize: Number(process.env.DB_MIN_POOL_SIZE) || 1,
    });

    console.log(
      `[MongoDB] Database connected successfully: ${conn.connection.host}`
    );

    console.log(
      `[MongoDB] Database name: ${conn.connection.name}`
    );

    // Monitor database connection status
    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Database disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] Database reconnected');
    });

    return conn;
  } catch (error) {
    console.error(
      `[MongoDB] Connection failed: ${error.message}`
    );

    // Stop startup if the database connection fails
    throw error;
  }
};

export default connectDB;