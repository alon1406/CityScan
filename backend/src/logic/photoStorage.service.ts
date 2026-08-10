/**
 * Where hazard photos live.
 *
 * One implementation today (`localDisk.photoStorage.impl.ts`), because the requirement
 * is zero cost and no third-party account. The interface exists so that adding S3 or
 * an object store later is a container wiring change, not a rewrite of the hazard logic.
 */
export interface PhotoStorageService {
  /**
   * Compress and persist one inbound base64 image.
   *
   * @returns the stored reference — a path or URL — which is what goes into MongoDB.
   *          Never the image bytes: inline base64 pushed documents toward the 16 MB
   *          BSON ceiling and would have exhausted a free Atlas M0 in ~100 reports.
   */
  save(base64: string): Promise<string>;

  /** Convenience for a whole report. Individual failures are skipped, not fatal. */
  saveMany(base64Images: string[]): Promise<string[]>;

  /** Best-effort cleanup. Never throws — a missing file is not a reason to fail a delete. */
  remove(storedRef: string): Promise<void>;

  removeMany(storedRefs: string[]): Promise<void>;
}
