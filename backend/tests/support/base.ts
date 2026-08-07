/**
 * Shared test scaffolding — the equivalent of SmartCollect's `BaseIntegrationTest`:
 * one place for bootstrapping, teardown and the fluent builders every test reuses.
 */
import { beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { connectDB } from '../../src/config/db.js';
import { createApp } from '../../src/app.js';

export let app: Express;

beforeAll(async () => {
  await connectDB();
  app = createApp();
});

// API-driven state between tests is fine, but documents are not: wipe collections so
// each test starts from a known-empty database.
afterEach(async () => {
  const collections = await mongoose.connection.db?.collections();
  for (const c of collections ?? []) await c.deleteMany({});
});

export interface AuthedUser {
  token: string;
  _id: string;
  email: string;
}

let counter = 0;
/** Unique per call, so tests never collide on the unique email index. */
export function uniqueEmail(prefix = 'user'): string {
  counter += 1;
  return `${prefix}${counter}-${Date.now()}@example.com`;
}

export async function registerUser(email = uniqueEmail()): Promise<AuthedUser> {
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password: 'password123', name: 'Test User' })
    .expect(201);

  return { token: res.body.token, _id: res.body.user._id, email: res.body.user.email };
}

/** Registers a user then promotes them directly in the database. */
export async function registerAdmin(): Promise<AuthedUser> {
  const user = await registerUser(uniqueEmail('admin'));
  await mongoose.connection
    .collection('users')
    .updateOne({ _id: new mongoose.Types.ObjectId(user._id) }, { $set: { role: 'admin' } });
  return user;
}

export const TEL_AVIV = { latitude: 32.0853, longitude: 34.7818 };

/** Offsets a coordinate by roughly `meters` northward. */
export function metersNorth(from: { latitude: number; longitude: number }, meters: number) {
  return { latitude: from.latitude + meters / 111_320, longitude: from.longitude };
}

export function createHazardBody(overrides: Record<string, unknown> = {}) {
  return { type: 'pothole', ...TEL_AVIV, description: 'A test hazard', ...overrides };
}

/** A real, decodable PNG — sharp must be able to process it. */
export async function samplePhotoDataUrl(width = 2400, height = 1600): Promise<string> {
  const png = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 60, b: 60 } },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}
