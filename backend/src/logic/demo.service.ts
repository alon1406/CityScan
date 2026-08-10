/**
 * Restores the demo deployment to its original seeded state.
 *
 * The public demo is open to anyone: an interviewer can file reports, change statuses
 * and delete hazards. Without a reset the map drifts into whatever the last visitor
 * left behind, and uploaded photos accumulate on a small disk indefinitely.
 *
 * Lives in `logic/` rather than in a script because two callers need it — the
 * `npm run seed:demo` CLI and the scheduled HTTP endpoint that n8n calls nightly.
 */
export interface DemoService {
  /**
   * Wipe everything a visitor could have touched and re-seed the original fixtures.
   *
   * Deletes every hazard, every stored photo file, and every account except the ones
   * the demo owns. The guest account is not recreated here — `demoLogin` does that on
   * the next click.
   */
  resetToSeed(): Promise<DemoResetSummary>;
}

export interface DemoResetSummary {
  hazardsRemoved: number;
  photosRemoved: number;
  usersRemoved: number;
  hazardsSeeded: number;
  /** Milliseconds, so the scheduled caller can log how long the wipe took. */
  durationMs: number;
}
