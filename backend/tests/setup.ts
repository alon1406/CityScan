/**
 * Test bootstrap.
 *
 * Runs before any test module is imported, which matters: `config/env.ts` validates
 * the environment at import time, so every variable it needs must already be set here.
 *
 * Each run gets a disposable in-memory MongoDB. That is the same principle as
 * SmartCollect's Testcontainers setup — *"כל ריצה מרימה קונטיינר PostgreSQL נקי ומבודד"*,
 * a clean isolated database per run so tests cannot pollute each other or depend on
 * the developer's local state — without needing Docker to be installed.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll } from 'vitest';

const mongo = await MongoMemoryServer.create();

const uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cityscan-uploads-'));

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = mongo.getUri();
process.env.MONGODB_DB_NAME = 'cityscan_test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-for-the-guard';
process.env.JWT_EXPIRES_IN = '1h';
process.env.UPLOADS_DIR = uploadsDir;
process.env.PUBLIC_BASE_URL = '';
// Treat the AI service as unconfigured: duplicate detection must still work on geo
// matching alone, and that degradation is exactly what we want to assert.
//
// Assigned empty rather than deleted on purpose. dotenv only fills in keys that are
// *absent*, so `delete` would let the developer's own .env leak its real AI_SERVICE_URL
// into the test profile — which is precisely what happened the first time this ran.
// An empty string counts as present, so nothing overrides it.
process.env.AI_SERVICE_URL = '';
process.env.AI_SERVICE_API_KEY = '';

export const TEST_UPLOADS_DIR = uploadsDir;

afterAll(async () => {
  const mongoose = (await import('mongoose')).default;
  await mongoose.connection.close();
  await mongo.stop();
  await fs.rm(uploadsDir, { recursive: true, force: true });
});
