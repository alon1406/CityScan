import { describe, it, expect } from 'vitest';
import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  app,
  registerUser,
  registerAdmin,
  createHazardBody,
  metersNorth,
  samplePhotoDataUrl,
  TEL_AVIV,
} from './support/base.js';
import { TEST_UPLOADS_DIR } from './setup.js';

describe('hazard contract', () => {
  it('creates a hazard and returns the shape the frontend declares', async () => {
    const user = await registerUser();

    const res = await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody())
      .expect(201);

    // Field-for-field against `interface Hazard` in frontend/src/api/client.ts.
    expect(res.body).toMatchObject({
      type: 'pothole',
      latitude: TEL_AVIV.latitude,
      longitude: TEL_AVIV.longitude,
      status: 'open',
      description: 'A test hazard',
    });
    expect(typeof res.body._id).toBe('string');
    expect(typeof res.body.createdAt).toBe('string');
    expect(typeof res.body.updatedAt).toBe('string');
    expect(res.body.reportedBy).toMatchObject({ _id: user._id, email: user.email });

    // Internals must not cross the boundary.
    expect(res.body.location).toBeUndefined();
    expect(res.body.__v).toBeUndefined();
  });

  it('lists created hazards', async () => {
    const user = await registerUser();
    await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody())
      .expect(201);

    const res = await request(app).get('/hazards?unsolved=1').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('pothole');
  });

  it('rejects a same-type duplicate within the radius with 409 DUPLICATE_HAZARD', async () => {
    const user = await registerUser();

    await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody())
      .expect(201);

    // ~10 m away, same type — deterministic tier, no AI needed.
    const res = await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody(metersNorth(TEL_AVIV, 10)))
      .expect(409);

    // ReportSidebar.tsx branches on this exact code.
    expect(res.body.code).toBe('DUPLICATE_HAZARD');
    expect(res.body.message).toContain('already reported');
  });

  it('allows the same type outside the radius', async () => {
    const user = await registerUser();

    await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody())
      .expect(201);

    // 200 m away — outside the 50 m window.
    await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody(metersNorth(TEL_AVIV, 200)))
      .expect(201);
  });

  it('allows a different type nearby when the AI service is unconfigured (fails open)', async () => {
    const user = await registerUser();

    await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody())
      .expect(201);

    // A citizen must always be able to file a report when an optional dependency is down.
    await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody({ ...metersNorth(TEL_AVIV, 10), type: 'flooding' }))
      .expect(201);
  });

  it('finds nearby hazards by radius', async () => {
    const user = await registerUser();
    await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody())
      .expect(201);

    const near = await request(app)
      .get(`/hazards/nearby?latitude=${TEL_AVIV.latitude}&longitude=${TEL_AVIV.longitude}&radiusMeters=50`)
      .expect(200);
    expect(near.body).toHaveLength(1);

    const far = metersNorth(TEL_AVIV, 400);
    const none = await request(app)
      .get(`/hazards/nearby?latitude=${far.latitude}&longitude=${far.longitude}&radiusMeters=50`)
      .expect(200);
    expect(none.body).toHaveLength(0);
  });
});

describe('photo storage', () => {
  it('compresses to WebP on disk and stores only a URL in the database', async () => {
    const user = await registerUser();
    const dataUrl = await samplePhotoDataUrl();

    const res = await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody({ hazardPhotos: [dataUrl] }))
      .expect(201);

    const photos: string[] = res.body.hazardPhotos;
    expect(photos).toHaveLength(1);

    // A URL, not megabytes of base64 inside the document.
    expect(photos[0]).toMatch(/^\/uploads\/.+\.webp$/);
    expect(photos[0]!.startsWith('data:')).toBe(false);

    const file = path.join(TEST_UPLOADS_DIR, path.basename(photos[0]!));
    const stat = await fs.stat(file);
    // WebP magic bytes.
    const header = await fs.readFile(file);
    expect(header.subarray(8, 12).toString('ascii')).toBe('WEBP');
    // Well under the original, and under a tenth of the 8 MB inbound cap.
    expect(stat.size).toBeLessThan(400_000);
  });

  it('omits photos from list responses', async () => {
    const user = await registerUser();
    await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody({ hazardPhotos: [await samplePhotoDataUrl(600, 400)] }))
      .expect(201);

    const list = await request(app).get('/hazards').expect(200);
    expect(list.body[0].hazardPhotos).toBeUndefined();
  });

  it('deletes the files from disk when the hazard is deleted', async () => {
    const user = await registerUser();
    const created = await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody({ hazardPhotos: [await samplePhotoDataUrl(600, 400)] }))
      .expect(201);

    const file = path.join(TEST_UPLOADS_DIR, path.basename(created.body.hazardPhotos[0]));
    await expect(fs.stat(file)).resolves.toBeDefined();

    await request(app)
      .delete(`/hazards/${created.body._id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(204);

    await expect(fs.stat(file)).rejects.toThrow();
  });
});

describe('authorization', () => {
  it('401 without a token', async () => {
    const res = await request(app).post('/hazards').send(createHazardBody()).expect(401);
    expect(res.body.message).toBeTruthy();
  });

  it('401 with a garbage token', async () => {
    await request(app)
      .post('/hazards')
      .set('Authorization', 'Bearer not-a-real-token')
      .send(createHazardBody())
      .expect(401);
  });

  it('403 on the admin list for a normal user', async () => {
    const user = await registerUser();
    const res = await request(app)
      .get('/hazards/admin/list')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403);
    expect(res.body.status).toBe(403);
  });

  it('200 on the admin list for an admin', async () => {
    const admin = await registerAdmin();
    await request(app)
      .get('/hazards/admin/list')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
  });

  it('403 when another user tries to delete your hazard', async () => {
    const owner = await registerUser();
    const other = await registerUser();

    const created = await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(createHazardBody())
      .expect(201);

    await request(app)
      .delete(`/hazards/${created.body._id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(403);
  });

  it('lets an admin update someone else’s hazard', async () => {
    const owner = await registerUser();
    const admin = await registerAdmin();

    const created = await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(createHazardBody())
      .expect(201);

    const res = await request(app)
      .patch(`/hazards/${created.body._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'resolved' })
      .expect(200);

    expect(res.body.status).toBe('resolved');
  });
});

describe('error contract', () => {
  it('404 for a well-formed id that does not exist', async () => {
    const res = await request(app).get('/hazards/507f1f77bcf86cd799439011').expect(404);
    expect(res.body).toMatchObject({ status: 404, path: '/hazards/507f1f77bcf86cd799439011' });
    // The frontend reads data.message — it must always be present.
    expect(typeof res.body.message).toBe('string');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('400 for a malformed id instead of a 500', async () => {
    const res = await request(app).get('/hazards/not-an-id').expect(400);
    expect(res.body.message).toContain('id');
  });

  it('400 listing the offending field for a bad body', async () => {
    const user = await registerUser();
    const res = await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'pothole', latitude: 'abc', longitude: 34.7 })
      .expect(400);

    expect(res.body.message).toContain('latitude');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'latitude' })])
    );
  });

  it('400 for an unknown hazard type', async () => {
    const user = await registerUser();
    await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody({ type: 'volcano' }))
      .expect(400);
  });

  it('404 with the standard body for an unmatched route', async () => {
    const res = await request(app).get('/no-such-route').expect(404);
    expect(res.body.status).toBe(404);
    expect(res.body.message).toContain('/no-such-route');
  });
});
