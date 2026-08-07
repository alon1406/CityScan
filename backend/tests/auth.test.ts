import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, registerUser, uniqueEmail } from './support/base.js';

describe('auth', () => {
  it('registers and returns a token plus a password-free user', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: 'password123', name: 'Alice' })
      .expect(201);

    expect(res.body.user).toMatchObject({ email, name: 'Alice', role: 'user' });
    // The response type has nowhere to put a password — assert that holds.
    expect(res.body.user.password).toBeUndefined();
    expect(typeof res.body.token).toBe('string');
  });

  it('signs tokens with the configured secret, not the dev fallback', async () => {
    // This is the regression test for the original bug: `services/jwt.ts` read
    // process.env.JWT_SECRET at module scope, which under ESM ran *before*
    // dotenv.config() in app.ts, so the configured secret was never seen and every
    // token was signed with the hardcoded 'dev-secret-change-in-production'.
    const user = await registerUser();

    expect(() => jwt.verify(user.token, process.env.JWT_SECRET!)).not.toThrow();
    expect(() => jwt.verify(user.token, 'dev-secret-change-in-production')).toThrow();
    expect(() => jwt.verify(user.token, 'dev-only-insecure-secret-do-not-use-in-production')).toThrow();
  });

  it('logs in with correct credentials', async () => {
    const email = uniqueEmail();
    await request(app).post('/auth/register').send({ email, password: 'password123' }).expect(201);

    const res = await request(app)
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    expect(res.body.user.email).toBe(email);
  });

  it('401 on a wrong password', async () => {
    const email = uniqueEmail();
    await request(app).post('/auth/register').send({ email, password: 'password123' }).expect(201);

    await request(app).post('/auth/login').send({ email, password: 'wrong-one' }).expect(401);
  });

  it('gives the same 401 for an unknown email, so the endpoint is not an account oracle', async () => {
    const unknown = await request(app)
      .post('/auth/login')
      .send({ email: uniqueEmail(), password: 'password123' })
      .expect(401);

    const email = uniqueEmail();
    await request(app).post('/auth/register').send({ email, password: 'password123' }).expect(201);
    const wrongPassword = await request(app)
      .post('/auth/login')
      .send({ email, password: 'nope-nope-nope' })
      .expect(401);

    expect(unknown.body.message).toBe(wrongPassword.body.message);
  });

  it('409 on a duplicate email', async () => {
    const email = uniqueEmail();
    await request(app).post('/auth/register').send({ email, password: 'password123' }).expect(201);
    await request(app).post('/auth/register').send({ email, password: 'password123' }).expect(409);
  });

  it('400 on an invalid email or a short password', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'password123' })
      .expect(400);

    await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail(), password: 'short' })
      .expect(400);
  });

  it('demo login creates the guest account and is idempotent', async () => {
    const first = await request(app).post('/auth/demo-login').send({ role: 'admin' }).expect(200);
    expect(first.body.user.role).toBe('admin');

    const second = await request(app).post('/auth/demo-login').send({ role: 'admin' }).expect(200);
    expect(second.body.user._id).toBe(first.body.user._id);
  });

  it('400 when the demo role is not admin or user', async () => {
    await request(app).post('/auth/demo-login').send({ role: 'wizard' }).expect(400);
  });
});

describe('demo restriction', () => {
  it('blocks writes from the demo admin — the guard that never fired before', async () => {
    // demoRestrict compared against 'admin-demo@cityscan.demo' while auth.ts created
    // 'guest_admin@cityscan.com'. The two never matched, so every request fell through
    // and the demo admin could delete real data. Both now read config.demo.adminEmail.
    const demo = await request(app).post('/auth/demo-login').send({ role: 'admin' }).expect(200);

    const res = await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${demo.body.token}`)
      .send({ type: 'pothole', latitude: 32.08, longitude: 34.78 })
      .expect(403);

    expect(res.body.message).toContain('demo mode');
  });

  it('still allows the demo admin to read and to update a report status', async () => {
    const owner = await registerUser();
    const created = await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ type: 'debris', latitude: 32.08, longitude: 34.78 })
      .expect(201);

    const demo = await request(app).post('/auth/demo-login').send({ role: 'admin' }).expect(200);

    await request(app)
      .get('/hazards')
      .set('Authorization', `Bearer ${demo.body.token}`)
      .expect(200);

    await request(app)
      .patch(`/hazards/${created.body._id}`)
      .set('Authorization', `Bearer ${demo.body.token}`)
      .send({ status: 'in_progress' })
      .expect(200);
  });
});

describe('users', () => {
  it('returns the current profile', async () => {
    const user = await registerUser();
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body.password).toBeUndefined();
  });

  it('401 without a token', async () => {
    await request(app).get('/users/me').expect(401);
  });
});
