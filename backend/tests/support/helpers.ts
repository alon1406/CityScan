/**
 * App-agnostic test helpers.
 *
 * Separate from `base.ts` because `base.ts` registers global hooks and builds a shared
 * app at import time. `demoReset.test.ts` needs its own app instance — built after the
 * feature flag is set — so it takes these helpers without the shared bootstrap.
 */
import request from 'supertest';
import type { Express } from 'express';
import mongoose from 'mongoose';
import sharp from 'sharp';

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

export async function registerUser(app: Express, email = uniqueEmail()): Promise<AuthedUser> {
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password: 'password123', name: 'Test User' })
    .expect(201);

  return { token: res.body.token, _id: res.body.user._id, email: res.body.user.email };
}

/** Registers a user then promotes them directly in the database. */
export async function registerAdmin(app: Express): Promise<AuthedUser> {
  const user = await registerUser(app, uniqueEmail('admin'));
  await mongoose.connection
    .collection('users')
    .updateOne({ _id: new mongoose.Types.ObjectId(user._id) }, { $set: { role: 'admin' } });
  return user;
}

/** A real, decodable PNG — sharp must be able to process it. */
export async function samplePhotoDataUrl(width = 600, height = 400): Promise<string> {
  const png = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 60, b: 60 } },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}
