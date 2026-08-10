import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_HAZARDS } from '../src/data/demoFixtures.js';

/**
 * The demo fixtures exist twice: here for the seeder and the nightly reset, and in
 * `frontend/src/data/demoFixtures.ts` for the browser-only public demo, which has no
 * backend to seed from.
 *
 * They cannot share a module — Vite's root is `frontend/`, and the backend copy is a
 * server module — so this asserts they have not drifted. Two hand-maintained fixture
 * lists always eventually disagree, and the failure mode is quiet: the live demo would
 * show a different map from the one every other environment shows.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendFixtures = path.resolve(here, '..', '..', 'frontend', 'src', 'data', 'demoFixtures.ts');

interface ParsedFixture {
  type: string;
  address: string;
  status: string;
  latitude: number;
  longitude: number;
}

/**
 * Pulled out with a regex rather than by importing: the frontend file is TSX-adjacent
 * ESM that imports from `../api/client`, which drags in `import.meta.env` and the whole
 * browser bundle. Parsing the literals is cheaper and has no runtime dependencies.
 */
function parseFrontendFixtures(source: string): ParsedFixture[] {
  const body = source.slice(source.indexOf('const FIXTURES'), source.indexOf('export function buildDemoHazards'));
  const rows = body.match(/\{[^{}]*type:[^{}]*\}/g) ?? [];

  return rows.map((row) => {
    const pick = (key: string): string => {
      const m = new RegExp(`${key}:\\s*'([^']*)'`).exec(row);
      return m?.[1] ?? '';
    };
    const num = (key: string): number => {
      const m = new RegExp(`${key}:\\s*(-?[0-9.]+)`).exec(row);
      return m ? Number(m[1]) : Number.NaN;
    };
    return {
      type: pick('type'),
      address: pick('address'),
      status: pick('status'),
      latitude: num('latitude'),
      longitude: num('longitude'),
    };
  });
}

describe('demo fixtures stay in sync between backend and frontend', () => {
  it('the frontend copy exists', () => {
    expect(fs.existsSync(frontendFixtures)).toBe(true);
  });

  it('both lists describe the same hazards, in the same order', () => {
    const parsed = parseFrontendFixtures(fs.readFileSync(frontendFixtures, 'utf8'));

    expect(parsed).toHaveLength(DEMO_HAZARDS.length);

    parsed.forEach((fe, i) => {
      const be = DEMO_HAZARDS[i]!;
      expect(fe.type, `fixture ${i} type`).toBe(be.type);
      expect(fe.address, `fixture ${i} address`).toBe(be.address);
      expect(fe.status, `fixture ${i} status`).toBe(be.status);
      expect(fe.latitude, `fixture ${i} latitude`).toBeCloseTo(be.latitude, 5);
      expect(fe.longitude, `fixture ${i} longitude`).toBeCloseTo(be.longitude, 5);
    });
  });

  it('keeps the duplicate-detection pair within the radius in both copies', () => {
    // The live demo's whole value rests on this pair being close enough to trigger
    // the rejection. If someone nudges a coordinate, the feature silently stops
    // demonstrating anything.
    const parsed = parseFrontendFixtures(fs.readFileSync(frontendFixtures, 'utf8'));
    const [a, b] = [parsed[0]!, parsed[1]!];

    expect(a.type).toBe('pothole');
    expect(b.type).toBe('pothole');

    const R = 6_378_100;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
    const metres = 2 * R * Math.asin(Math.sqrt(h));

    expect(metres).toBeLessThan(50);
  });
});
