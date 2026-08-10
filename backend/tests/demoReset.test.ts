/**
 * The reset is what keeps the public demo presentable: visitors can file, edit and
 * delete anything, and a nightly n8n schedule returns it to the seeded state.
 *
 * It is also the most destructive endpoint in the application, so the guards are
 * tested as carefully as the behaviour.
 *
 * Note the structure: `config` is validated and frozen the first time `config/env.ts`
 * is evaluated, so the feature flag has to be set *before* anything imports it. That
 * rules out static imports here — everything below is imported dynamically after the
 * environment is in place. Vitest isolates each test file's module registry, so this
 * file runs with the flag on while every other file runs with it off.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import mongoose from 'mongoose';

const TOKEN = 'test-demo-reset-token-long-enough';

process.env.DEMO_RESET_ENABLED = 'true';
process.env.DEMO_RESET_TOKEN = TOKEN;

let demoApp: Express;
let fixtureCount: number;
let seedReporterEmail: string;
let helpers: typeof import('./support/helpers.js');

beforeAll(async () => {
  const { connectDB } = await import('../src/config/db.js');
  const { createApp } = await import('../src/app.js');
  const fixtures = await import('../src/data/demoFixtures.js');
  helpers = await import('./support/helpers.js');

  await connectDB();
  demoApp = createApp();
  fixtureCount = fixtures.DEMO_HAZARDS.length;
  seedReporterEmail = fixtures.DEMO_REPORTER_EMAIL;
});

afterEach(async () => {
  const collections = await mongoose.connection.db?.collections();
  for (const c of collections ?? []) await c.deleteMany({});
});

const reset = (token = TOKEN) =>
  request(demoApp).post('/demo/reset').set('X-Demo-Reset-Token', token);

describe('demo reset — guards', () => {
  it('401 without a token', async () => {
    await request(demoApp).post('/demo/reset').expect(401);
  });

  it('401 with a wrong token', async () => {
    await reset('not-the-right-token-at-all').expect(401);
  });

  it('401 with a token of the same length but different content', async () => {
    // Guards against a comparison that only checks length.
    await reset('x'.repeat(TOKEN.length)).expect(401);
  });
});

describe('demo reset — behaviour', () => {
  it('restores exactly the seeded state, discarding everything a visitor did', async () => {
    await reset().expect(200);

    const visitor = await helpers.registerUser(demoApp);
    await request(demoApp)
      .post('/hazards')
      .set('Authorization', `Bearer ${visitor.token}`)
      .send({
        type: 'flooding',
        latitude: 31.9,
        longitude: 34.8,
        description: 'visitor noise',
        hazardPhotos: [await helpers.samplePhotoDataUrl()],
      })
      .expect(201);

    expect((await request(demoApp).get('/hazards').expect(200)).body).toHaveLength(fixtureCount + 1);

    const res = await reset().expect(200);
    expect(res.body.hazardsSeeded).toBe(fixtureCount);
    expect(res.body.usersRemoved).toBeGreaterThanOrEqual(1);
    expect(res.body.photosRemoved).toBeGreaterThanOrEqual(1);

    const after = await request(demoApp).get('/hazards').expect(200);
    expect(after.body).toHaveLength(fixtureCount);
    expect(
      after.body.every((h: { description?: string }) => h.description?.includes('[demo]'))
    ).toBe(true);

    // The visitor's account is gone; the seed author survives so re-seeding works.
    const users = mongoose.connection.collection('users');
    expect(await users.countDocuments({ email: visitor.email })).toBe(0);
    expect(await users.countDocuments({ email: seedReporterEmail })).toBe(1);
  });

  it('restores hazards a visitor deleted', async () => {
    await reset().expect(200);

    const admin = await helpers.registerAdmin(demoApp);
    const target = (await request(demoApp).get('/hazards').expect(200)).body[0];

    await request(demoApp)
      .delete(`/hazards/${target._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(204);
    expect((await request(demoApp).get('/hazards').expect(200)).body).toHaveLength(fixtureCount - 1);

    await reset().expect(200);
    expect((await request(demoApp).get('/hazards').expect(200)).body).toHaveLength(fixtureCount);
  });

  it('is idempotent — repeated resets do not accumulate', async () => {
    await reset().expect(200);
    await reset().expect(200);
    await reset().expect(200);

    expect((await request(demoApp).get('/hazards').expect(200)).body).toHaveLength(fixtureCount);
  });

  it('keeps the duplicate-detection pair intact, so the 409 demo always works', async () => {
    await reset().expect(200);

    const visitor = await helpers.registerUser(demoApp);
    const res = await request(demoApp)
      .post('/hazards')
      .set('Authorization', `Bearer ${visitor.token}`)
      .send({ type: 'pothole', latitude: 32.0797, longitude: 34.7739, description: 'a third one' })
      .expect(409);

    expect(res.body.code).toBe('DUPLICATE_HAZARD');
  });

  it('backdates the seeded reports rather than stamping them all now', async () => {
    await reset().expect(200);

    const rows = await mongoose.connection
      .collection('hazards')
      .find({}, { projection: { createdAt: 1 } })
      .toArray();
    const days = new Set(rows.map((r) => (r.createdAt as Date).toISOString().slice(0, 10)));

    // Mongoose reasserts its automatic timestamps over writes through the model, which
    // silently collapsed every seeded row onto today until the native driver was used.
    expect(days.size).toBeGreaterThan(5);
  });
});
