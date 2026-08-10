import type { HazardBoundary } from '../boundaries/hazard.boundary.js';

/**
 * Domain event fan-out.
 *
 * This is what replaces the frontend's 8-second poll: the map used to refetch up to
 * 500 hazards every 8 seconds forever, even on a backgrounded tab. Now the server
 * publishes once when something actually changes, and subscribers receive it.
 *
 * Two subscribers are planned:
 *   - the SSE endpoint (`GET /hazards/stream`), consumed by the map — Phase 2
 *   - an outbound webhook to n8n for asynchronous automation — Phase 3
 *
 * Note the deliberate boundary: duplicate detection is NOT an event subscriber. It sits
 * on the request's critical path, is core business logic, and must keep working when
 * n8n is down — so it stays inside HazardsServiceImpl.
 */
export type HazardEventType = 'hazard:created' | 'hazard:updated' | 'hazard:deleted';

export interface HazardEvent {
  type: HazardEventType;
  /** Photo-free payload — the stream must stay small. */
  hazard: HazardBoundary | { _id: string };
  at: string;
}

export type EventSubscriber = (event: HazardEvent) => void;

export interface EventsService {
  emit(event: HazardEvent): void;

  /** @returns an unsubscribe function. */
  subscribe(subscriber: EventSubscriber): () => void;

  /** Number of live subscribers — surfaced by the health endpoint. */
  subscriberCount(): number;
}
