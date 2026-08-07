import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import type { PhotoStorageService } from '../photoStorage.service.js';
import { config } from '../../config/env.js';
import { BadRequestException } from '../../errors/index.js';

/**
 * Photos on local disk, compressed on the way in.
 *
 * Compression is what makes local disk viable rather than a stopgap. A phone photo
 * arrives as roughly 1.5 MB of base64; resized to 1600 px and re-encoded as WebP at
 * quality 80 it lands near 150 KB, so a 25 GB VPS disk holds on the order of 100k
 * images. In Phase 3 `uploads/` becomes a Docker named volume — same code.
 *
 * Stripping metadata is deliberate and not just a size win: phone photos carry EXIF
 * GPS, and these images are displayed publicly on a map. The report already carries
 * explicit coordinates, so there is no reason to also publish the exact spot the
 * reporter was standing. sharp drops all metadata unless `.withMetadata()` is called.
 */
const DATA_URL_RE = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/s;

export class LocalDiskPhotoStorageImpl implements PhotoStorageService {
  private readonly absoluteDir: string;
  private ensured = false;

  constructor() {
    this.absoluteDir = path.isAbsolute(config.photos.dir)
      ? config.photos.dir
      : path.join(config.backendRoot, config.photos.dir);
  }

  async save(base64: string): Promise<string> {
    const buffer = this.decode(base64);

    const webp = await sharp(buffer, { failOn: 'none' })
      .rotate() // honour the EXIF orientation flag before that metadata is dropped
      .resize({
        width: config.photos.maxWidth,
        height: config.photos.maxWidth,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: config.photos.webpQuality })
      .toBuffer();

    await this.ensureDir();

    const filename = `${Date.now()}-${randomUUID()}.webp`;
    await fs.writeFile(path.join(this.absoluteDir, filename), webp);

    // Stored as a root-relative URL path. The converter makes it absolute when
    // PUBLIC_BASE_URL is set, so the same row works behind any hostname.
    return `${config.photos.routePrefix}/${filename}`;
  }

  async saveMany(base64Images: string[]): Promise<string[]> {
    const stored: string[] = [];
    for (const image of base64Images) {
      stored.push(await this.save(image));
    }
    return stored;
  }

  async remove(storedRef: string): Promise<void> {
    const filename = this.toFilename(storedRef);
    if (!filename) return;
    try {
      await fs.unlink(path.join(this.absoluteDir, filename));
    } catch (err) {
      // A file that is already gone is the desired end state, not an error.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Could not delete photo ${filename}:`, err);
      }
    }
  }

  async removeMany(storedRefs: string[]): Promise<void> {
    await Promise.all(storedRefs.map((ref) => this.remove(ref)));
  }

  /** Accepts a full data URL or a bare base64 payload. */
  private decode(input: string): Buffer {
    const trimmed = input.trim();
    const match = DATA_URL_RE.exec(trimmed);
    const payload = match?.[2] ?? trimmed;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(payload, 'base64');
    } catch {
      throw new BadRequestException('Photo is not valid base64 data');
    }
    if (buffer.length === 0) {
      throw new BadRequestException('Photo is empty');
    }
    return buffer;
  }

  /**
   * Map a stored reference back to a bare filename.
   *
   * `path.basename` also neutralises traversal: a crafted `../../etc/passwd` in the
   * database can only ever resolve to `passwd` inside the uploads directory.
   */
  private toFilename(storedRef: string): string | null {
    if (!storedRef || storedRef.startsWith('data:')) return null;
    const withoutQuery = storedRef.split('?')[0] ?? storedRef;
    const base = path.basename(withoutQuery);
    return base && base !== '.' && base !== '..' ? base : null;
  }

  private async ensureDir(): Promise<void> {
    if (this.ensured) return;
    await fs.mkdir(this.absoluteDir, { recursive: true });
    this.ensured = true;
  }
}
