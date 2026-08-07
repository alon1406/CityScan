import { EventEmitter } from 'node:events';
import type { EventsService, EventSubscriber, HazardEvent } from '../events.service.js';

/**
 * In-process event bus backed by Node's EventEmitter.
 *
 * Honest constraint: this is per-process. It works because CityScan runs a single
 * backend instance. Behind a load balancer with several instances, a client connected
 * to instance A would not see a hazard created on instance B — that would need Redis
 * pub/sub, and the `EventsService` interface is what would absorb that change.
 */
const CHANNEL = 'hazard';

export class EmitterEventsServiceImpl implements EventsService {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One listener per open SSE connection. The Node default of 10 would print a
    // spurious leak warning as soon as an 11th browser tab opened the map.
    this.emitter.setMaxListeners(0);
  }

  emit(event: HazardEvent): void {
    this.emitter.emit(CHANNEL, event);
  }

  subscribe(subscriber: EventSubscriber): () => void {
    this.emitter.on(CHANNEL, subscriber);
    return () => {
      this.emitter.off(CHANNEL, subscriber);
    };
  }

  subscriberCount(): number {
    return this.emitter.listenerCount(CHANNEL);
  }
}
