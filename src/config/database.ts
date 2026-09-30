import mongoose from 'mongoose';
import { env } from './env';

export async function connectDatabase(): Promise<void> {
  const uri = env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to your .env file.');
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  console.log('✅ MongoDB connected');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.log('MongoDB disconnected');
}

mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('MongoDB disconnected');
  }
});
