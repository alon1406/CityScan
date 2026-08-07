import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import request from 'supertest';
import { app, registerUser, createHazardBody } from './support/base.js';

/**
 * The SSE stream needs a real listening socket — supertest's in-process transport
 * buffers the response, and a stream that never ends never resolves.
 */
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Reads SSE frames until `predicate` is satisfied or the timeout elapses. */
async function readUntil(
  signal: AbortSignal,
  res: Response,
  predicate: (chunk: string) => boolean
): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (predicate(buffer)) return buffer;
  }
  return buffer;
}

describe('SSE live updates', () => {
  it('pushes hazard:created to a connected client', async () => {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/hazards/stream`, { signal: controller.signal });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    // Phase 3: nginx must also be told not to buffer this location.
    expect(res.headers.get('x-accel-buffering')).toBe('no');

    const collecting = readUntil(controller.signal, res, (b) => b.includes('hazard:created'));

    // Give the subscription a moment to register before triggering the event.
    await new Promise((r) => setTimeout(r, 200));

    const user = await registerUser();
    const created = await request(app)
      .post('/hazards')
      .set('Authorization', `Bearer ${user.token}`)
      .send(createHazardBody())
      .expect(201);

    const received = await Promise.race([
      collecting,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timed out')), 8000)),
    ]);

    controller.abort();

    expect(received).toContain('event: connected');
    expect(received).toContain('event: hazard:created');
    expect(received).toContain(created.body._id);
    // The stream must stay small — photos are stripped before publishing.
    expect(received).not.toContain('hazardPhotos');
  });

  it('reports live subscriber count on the health endpoint', async () => {
    const controller = new AbortController();
    await fetch(`${baseUrl}/hazards/stream`, { signal: controller.signal });
    await new Promise((r) => setTimeout(r, 200));

    const health = await request(app).get('/health/db').expect(200);
    expect(health.body.sseSubscribers).toBeGreaterThan(0);
    // AI is intentionally unconfigured in tests, and the endpoint says so honestly.
    expect(health.body.aiEnabled).toBe(false);

    controller.abort();
  });
});
