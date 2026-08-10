import mongoose from 'mongoose';
import { config } from './env.js';

/**
 * Connect to MongoDB.
 *
 * Throws on failure rather than calling `process.exit(1)` as the old version did:
 * exiting from inside a library function makes the code untestable and takes the
 * decision away from the caller. `server.ts` decides what a failed connection means.
 */
export async function connectDB(): Promise<typeof mongoose> {
  const conn = await mongoose.connect(config.db.uri, {
    dbName: config.db.name,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  });

  console.log(
    ` MongoDB connected: ${conn.connection.host} (db: ${conn.connection.name}, profile: ${config.profile})`
  );
  return conn;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close();
}

/** Used by GET /health/db. */
export function connectionState(): { ready: boolean; code: number; name: string } {
  const code = mongoose.connection.readyState;
  const names = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return { ready: code === 1, code, name: names[code] ?? 'unknown' };
}
