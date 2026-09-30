import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import os = require('os');

let mongoServer: MongoMemoryServer;

export async function connectTestDb(): Promise<void> {
  mongoServer = await MongoMemoryServer.create({ binary: { version: '6.0.14' } });
  const uri = mongoServer.getUri();
  // Jest's CommonJS context can't resolve the dynamic import('os') that mongodb
  // driver v7.6 uses in runtime_adapters.js, causing the handshake to fail.
  // Providing the os adapter directly bypasses the dynamic import.
  await mongoose.connect(uri, { runtimeAdapters: { os } });
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongoServer.stop();
}

export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}
