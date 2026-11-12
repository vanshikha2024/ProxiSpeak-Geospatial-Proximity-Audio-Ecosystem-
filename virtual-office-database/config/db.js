import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is missing. Add it to your .env file.');
  mongoose.set('strictQuery', true);
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.DB_SERVER_SELECTION_TIMEOUT_MS) || 10000,
    maxPoolSize: Number(process.env.DB_MAX_POOL_SIZE) || 11,
    minPoolSize: Number(process.env.DB_MIN_POOL_SIZE) || 1
  });
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
  mongoose.connection.on('disconnected', () => console.warn('[database] MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.info('[database] MongoDB reconnected'));
}
