import type { Types } from 'mongoose';
import type { HazardsService, RequestingUser } from '../hazards.service.js';
import type { AiService, ExistingHazardForAi } from '../ai.service.js';
import type { PhotoStorageService } from '../photoStorage.service.js';
import type { EventsService } from '../events.service.js';
import type { HazardRepository } from '../../repositories/hazard.repository.js';
import type { HazardConverter } from '../../converters/hazard.converter.js';
import type { HazardEntity } from '../../data/hazard.entity.js';
import type {
  CreateHazardBoundary,
  UpdateHazardBoundary,
  ListHazardsQuery,
  AdminListQuery,
  NearbyQuery,
  CheckSameHazardBoundary,
  HazardBoundary,
  CheckSameHazardResultBoundary,
} from '../../boundaries/hazard.boundary.js';
import { config } from '../../config/env.js';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '../../errors/index.js';

/** Response code the frontend branches on — `ReportSidebar` shows its own flow for this. */
const DUPLICATE_CODE = 'DUPLICATE_HAZARD';

/** Only the fields the duplicate comparison reads. Keeps photos out of the query. */
const DUPLICATE_CHECK_FIELDS = '_id type status description';

/**
 * All hazard business logic.
 *
 * This is the layer that did not exist: every rule below used to live inside
 * `controllers/hazards.ts`, interleaved with `req`/`res` handling, Mongoose queries and
 * `try/catch` blocks that turned each failure into a hand-written 500.
 *
 * Method shape follows SmartCollect's `ObjectsServiceImpl`: authorize, then apply the
 * rule, then persist, then convert on the way out — and throw a typed exception rather
 * than choosing a status code.
 */
export class HazardsServiceImpl implements HazardsService {
  constructor(
    private readonly hazards: HazardRepository,
    private readonly converter: HazardConverter,
    private readonly ai: AiService,
    private readonly photos: PhotoStorageService,
    private readonly events: EventsService
  ) {}

  // ---------- Reads ----------

  async list(query: ListHazardsQuery): Promise<HazardBoundary[]> {
    const found = await this.hazards.findAll({
      limit: query.limit,
      unsolved: query.unsolved,
      status: query.status,
      type: query.type,
    });
    return this.converter.toBoundaryList(found);
  }

  async listForAdmin(query: AdminListQuery): Promise<HazardBoundary[]> {
    const found = await this.hazards.findAll({
      limit: query.limit,
      status: query.status,
      type: query.type,
      search: query.search,
    });
    return this.converter.toBoundaryList(found);
  }

  async countOpen(): Promise<number> {
    return this.hazards.countByStatus('open');
  }

  async listByReporter(reporterId: Types.ObjectId, limit: number): Promise<HazardBoundary[]> {
    const found = await this.hazards.findByReporter(reporterId, limit);
    return this.converter.toBoundaryList(found);
  }

  async listNearby(query: NearbyQuery): Promise<HazardBoundary[]> {
    const found = await this.hazards.findNearbyUnresolved(
      query.longitude,
      query.latitude,
      query.radiusMeters,
      { limit: 50, populate: true }
    );
    return this.converter.toBoundaryList(found);
  }

  async getById(id: string): Promise<HazardBoundary> {
    const found = await this.hazards.findById(id);
    if (!found) throw new NotFoundException('Hazard not found');
    return this.converter.toBoundary(found);
  }

  // ---------- Create ----------

  async create(input: CreateHazardBoundary, reporter: RequestingUser): Promise<HazardBoundary> {
    // 1. Duplicate policy, before anything is written or any photo is stored.
    await this.assertNotDuplicate({
      type: input.type,
      latitude: input.latitude,
      longitude: input.longitude,
      description: input.description,
      address: input.address,
    });

    // 2. Compress and store photos; only the resulting URLs are persisted.
    const storedPhotos = input.hazardPhotos?.length
      ? await this.photos.saveMany(input.hazardPhotos)
      : undefined;

    // 3. Persist. If this throws, the photos we just wrote would be orphaned, so
    //    clean them up rather than leaving files nothing points at.
    let created: HazardEntity;
    try {
      created = await this.hazards.create({
        type: input.type,
        latitude: input.latitude,
        longitude: input.longitude,
        reportedBy: reporter._id,
        ...(input.description && { description: input.description }),
        ...(input.address && { address: input.address }),
        ...(storedPhotos?.length && { hazardPhotos: storedPhotos }),
        ...(input.status && { status: input.status }),
      });
    } catch (err) {
      if (storedPhotos?.length) await this.photos.removeMany(storedPhotos);
      throw err;
    }

    const boundary = this.converter.toBoundary(created);
    this.publish('hazard:created', boundary);
    return boundary;
  }

  // ---------- Update / delete ----------

  async update(
    id: string,
    input: UpdateHazardBoundary,
    actor: RequestingUser
  ): Promise<HazardBoundary> {
    const doc = await this.hazards.findDocumentById(id);
    if (!doc) throw new NotFoundException('Hazard not found');

    this.assertCanModify(doc, actor, 'Only the reporter or an admin can update this hazard');

    if (input.status !== undefined) doc.status = input.status;
    if (input.description !== undefined) doc.description = input.description;

    const saved = await this.hazards.save(doc);
    const boundary = this.converter.toBoundary(saved);
    this.publish('hazard:updated', boundary);
    return boundary;
  }

  async remove(id: string, actor: RequestingUser): Promise<void> {
    const doc = await this.hazards.findDocumentById(id);
    if (!doc) throw new NotFoundException('Hazard not found');

    this.assertCanModify(doc, actor, 'Only the reporter or an admin can delete this hazard');

    const photos = doc.hazardPhotos ?? [];
    await this.hazards.deleteById(id);

    // Photos live on disk now, so deleting the row is no longer enough — without this
    // every deleted report would leave its images behind forever.
    if (photos.length > 0) await this.photos.removeMany(photos);

    this.events.emit({
      type: 'hazard:deleted',
      hazard: { _id: id },
      at: new Date().toISOString(),
    });
  }

  // ---------- AI-backed endpoints ----------

  async checkSameHazard(input: CheckSameHazardBoundary): Promise<CheckSameHazardResultBoundary> {
    const nearby = await this.findNearbyForComparison(input.latitude, input.longitude);
    if (nearby.length === 0) return { isDuplicate: false };

    const result = await this.ai.checkDuplicate(this.toAiPayload(nearby), {
      type: input.type,
      description: input.description,
      address: input.address,
    });

    return {
      isDuplicate: result.isDuplicate,
      ...(result.matchingHazardId && { matchingHazardId: result.matchingHazardId }),
    };
  }

  async analyzePhoto(imageBase64: string): Promise<string> {
    const description = await this.ai.describePhoto(imageBase64);
    if (description == null) {
      throw new ServiceUnavailableException('AI service unavailable or not configured');
    }
    return description;
  }

  // ---------- Internals ----------

  /**
   * Two-tier duplicate detection.
   *
   * Tier 1 is deterministic: an unresolved hazard of the *same* type inside the radius
   * is a duplicate, full stop. No AI call, no latency, works offline.
   *
   * Tier 2 only runs when there are nearby hazards of a *different* type, where the
   * question is genuinely fuzzy — "debris" and "flooding" reported five metres apart
   * may or may not be the same physical problem. That judgement goes to the AI.
   *
   * Tier 2 fails open: if the AI service is unreachable the report is allowed through.
   * A citizen must always be able to file a report, even when an optional dependency
   * is down. This is also why duplicate detection is not delegated to n8n.
   */
  private async assertNotDuplicate(input: {
    type: string;
    latitude: number;
    longitude: number;
    description?: string | undefined;
    address?: string | undefined;
  }): Promise<void> {
    const nearby = await this.findNearbyForComparison(input.latitude, input.longitude);
    if (nearby.length === 0) return;

    if (nearby.some((h) => h.type === input.type)) {
      throw new ConflictException(
        `A hazard of this type was already reported within ${config.hazards.duplicateRadiusMeters}m. No need to report again.`,
        DUPLICATE_CODE
      );
    }

    const verdict = await this.ai.checkDuplicate(this.toAiPayload(nearby), {
      type: input.type,
      description: input.description,
      address: input.address,
    });

    if (verdict.isDuplicate) {
      throw new ConflictException(
        'This hazard was already reported. No need to report it again on the map.',
        DUPLICATE_CODE,
        verdict.matchingHazardId ? { matchingHazardId: verdict.matchingHazardId } : undefined
      );
    }
  }

  private async findNearbyForComparison(
    latitude: number,
    longitude: number
  ): Promise<HazardEntity[]> {
    return this.hazards.findNearbyUnresolved(
      longitude,
      latitude,
      config.hazards.duplicateRadiusMeters,
      { limit: 50, fields: DUPLICATE_CHECK_FIELDS }
    );
  }

  private toAiPayload(entities: HazardEntity[]): ExistingHazardForAi[] {
    return entities.map((h) => ({
      _id: h._id.toString(),
      type: h.type,
      status: h.status,
      description: h.description,
    }));
  }

  /** Reporter or admin. Anyone else gets a 403. */
  private assertCanModify(doc: HazardEntity, actor: RequestingUser, message: string): void {
    const isOwner = doc.reportedBy.equals(actor._id);
    if (!isOwner && actor.role !== 'admin') throw new ForbiddenException(message);
  }

  /** Photos are stripped before publishing — the SSE stream must stay small. */
  private publish(type: 'hazard:created' | 'hazard:updated', hazard: HazardBoundary): void {
    const { hazardPhotos: _omitted, ...withoutPhotos } = hazard;
    this.events.emit({
      type,
      hazard: withoutPhotos as HazardBoundary,
      at: new Date().toISOString(),
    });
  }
}
