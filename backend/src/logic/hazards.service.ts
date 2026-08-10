import type { Types } from 'mongoose';
import type {
  CreateHazardBoundary,
  UpdateHazardBoundary,
  ListHazardsQuery,
  AdminListQuery,
  NearbyQuery,
  CheckSameHazardBoundary,
  HazardBoundary,
  CheckSameHazardResultBoundary,
} from '../boundaries/hazard.boundary.js';

/**
 * Everything the application can do with a hazard.
 *
 * Interface-first, as SmartCollect does with `logic/ObjectsService.java` +
 * `logic/impl/ObjectsServiceImpl.java`: controllers depend on this type, never on the
 * implementation, so the impl can be swapped or faked in a test without touching the
 * HTTP layer.
 */
export interface HazardsService {
  list(query: ListHazardsQuery): Promise<HazardBoundary[]>;

  listForAdmin(query: AdminListQuery): Promise<HazardBoundary[]>;

  countOpen(): Promise<number>;

  listByReporter(reporterId: Types.ObjectId, limit: number): Promise<HazardBoundary[]>;

  listNearby(query: NearbyQuery): Promise<HazardBoundary[]>;

  getById(id: string): Promise<HazardBoundary>;

  /** Throws ConflictException with code DUPLICATE_HAZARD when the report already exists. */
  create(input: CreateHazardBoundary, reporter: RequestingUser): Promise<HazardBoundary>;

  update(id: string, input: UpdateHazardBoundary, actor: RequestingUser): Promise<HazardBoundary>;

  remove(id: string, actor: RequestingUser): Promise<void>;

  checkSameHazard(input: CheckSameHazardBoundary): Promise<CheckSameHazardResultBoundary>;

  analyzePhoto(imageBase64: string): Promise<string>;
}

/** The authenticated caller, as far as the business layer needs to know. */
export interface RequestingUser {
  _id: Types.ObjectId;
  email: string;
  role: string;
}
