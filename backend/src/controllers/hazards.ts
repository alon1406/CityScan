import type { Request, Response } from 'express';
import Hazard from '../models/Hazard.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import type { HazardStatus, HazardType } from '../models/Hazard.js';
import { checkSameHazardViaService, analyzePhotoViaService } from '../services/aiServiceClient.js';

/** Radius in meters for considering two reports as the same hazard. */
const DUPLICATE_RADIUS_METERS = 50;

// ========== LIST ==========
/**
 * GET /hazards — list hazards with optional limit and status/type filter.
 * Public (no auth required) so the map can load all hazards.
 * Query: unsolved=1 — return only open and in_progress (for map display).
 */
export async function list(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const status = req.query.status as HazardStatus | undefined;
    const type = req.query.type as HazardType | undefined;
    const unsolved = req.query.unsolved === '1' || req.query.unsolved === 'true';

    const filter: Record<string, unknown> = {};
    if (unsolved) {
      filter.status = { $in: ['open', 'in_progress'] };
    } else if (status) {
      filter.status = status;
    }
    if (type) filter.type = type;

    const hazards = await Hazard.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('reportedBy', 'email name')
      .lean();

    res.json(hazards);
  } catch (err) {
    console.error('Hazards list error:', err);
    res.status(500).json({ message: 'Failed to list hazards' });
  }
}

// ========== COUNT NEW (OPEN) REPORTS FOR ADMIN ==========
/**
 * GET /hazards/admin/count — count of open reports (for admin navbar badge). Requires auth + admin role.
 */
export async function countNewForAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }
    const role = (user as unknown as { role?: string }).role;
    if (role !== 'admin') {
      res.status(403).json({ message: 'Admin only' });
      return;
    }
    const count = await Hazard.countDocuments({ status: 'open' });
    res.json({ count });
  } catch (err) {
    console.error('Hazards countNewForAdmin error:', err);
    res.status(500).json({ message: 'Failed to get count' });
  }
}

// ========== LIST ALL FOR ADMIN ==========
/**
 * GET /hazards/admin/list — list all hazards with optional filters. Requires auth + admin role.
 * Query: limit, status, type, search (matches address or description).
 * Sorted by newest first.
 */
export async function listAllForAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }
    const role = (user as unknown as { role?: string }).role;
    if (role !== 'admin') {
      res.status(403).json({ message: 'Admin only' });
      return;
    }
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const status = req.query.status as HazardStatus | undefined;
    const type = req.query.type as HazardType | undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const filter: Record<string, unknown> = {};
    if (status && ['open', 'in_progress', 'resolved'].includes(status)) filter.status = status;
    if (type && ['pothole', 'broken_streetlight', 'debris', 'flooding', 'other'].includes(type)) filter.type = type;
    if (search) {
      filter.$or = [
        { address: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const hazards = await Hazard.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('reportedBy', 'email name')
      .lean();

    res.json(hazards);
  } catch (err) {
    console.error('Hazards listAllForAdmin error:', err);
    res.status(500).json({ message: 'Failed to list reports' });
  }
}

// ========== LIST MINE (current user's reports) ==========
/**
 * GET /hazards/mine — list hazards reported by the current user. Requires auth.
 */
export async function listMine(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const hazards = await Hazard.find({ reportedBy: user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('reportedBy', 'email name')
      .lean();
    res.json(hazards);
  } catch (err) {
    console.error('Hazards listMine error:', err);
    res.status(500).json({ message: 'Failed to list your reports' });
  }
}

// ========== CREATE ==========
/**
 * POST /hazards — create a new hazard. Requires auth; reportedBy = req.user._id.
 */
export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    const body = req.body as {
      type?: HazardType;
      latitude?: number | string;
      longitude?: number | string;
      description?: string;
      address?: string;
      hazardPhotos?: string[];
      status?: HazardStatus;
    };
    const type = body.type;
    const latitude = typeof body.latitude === 'string' ? Number(body.latitude) : body.latitude;
    const longitude = typeof body.longitude === 'string' ? Number(body.longitude) : body.longitude;
    const { description, address, hazardPhotos: rawPhotos, status } = body;

    if (
      type == null ||
      latitude == null ||
      longitude == null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      res.status(400).json({ message: 'type, latitude, and longitude are required and must be valid numbers' });
      return;
    }

    const validTypes: HazardType[] = ['pothole', 'broken_streetlight', 'debris', 'flooding', 'other'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ message: 'Invalid type' });
      return;
    }

    const createData: {
      type: HazardType;
      latitude: number;
      longitude: number;
      description?: string;
      address?: string;
      hazardPhotos?: string[];
      status?: HazardStatus;
      reportedBy: typeof user._id;
    } = {
      type,
      latitude,
      longitude,
      reportedBy: user._id,
    };
    if (description !== undefined && description !== '') {
      createData.description = String(description).trim();
    }
    if (address !== undefined && address !== '') {
      createData.address = String(address).trim();
    }
    const maxPhotoLength = 1_500_000;
    const maxPhotos = 10;
    if (Array.isArray(rawPhotos) && rawPhotos.length > 0) {
      createData.hazardPhotos = rawPhotos
        .slice(0, maxPhotos)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)
        .map((p) => (p.length > maxPhotoLength ? p.slice(0, maxPhotoLength) : p));
    }
    if (status !== undefined && ['open', 'in_progress', 'resolved'].includes(status)) {
      createData.status = status;
    }

    // Block duplicate: same hazard type within DUPLICATE_RADIUS_METERS (50m).
    const radiusRadians = DUPLICATE_RADIUS_METERS / 6378100;
    const nearby = await Hazard.find({
      status: { $in: ['open', 'in_progress'] },
      location: {
        $geoWithin: {
          $centerSphere: [[createData.longitude, createData.latitude], radiusRadians],
        },
      },
    })
      .limit(50)
      .lean();

    // If any open hazard of the SAME type exists within radius → block (duplicate).
    const sameTypeInRadius = nearby.some((h) => h.type === type);
    if (sameTypeInRadius) {
      res.status(409).json({
        message: 'A hazard of this type was already reported within 50m. No need to report again.',
        code: 'DUPLICATE_HAZARD',
      });
      return;
    }

    // Optional: when there are nearby hazards of different type, AI can still flag same physical hazard.
    if (nearby.length > 0) {
      const newReportForAi = {
        type,
        ...(createData.description && { description: createData.description }),
      };
      const existingForAi = nearby.map((h) => {
        const item: { _id: string; type: string; description?: string; status: string } = {
          _id: String(h._id),
          type: h.type,
          status: h.status,
        };
        if (h.description != null) item.description = h.description;
        return item;
      });
      const duplicateResult = await checkSameHazardViaService(existingForAi, newReportForAi);
      if (duplicateResult.isDuplicate) {
        res.status(409).json({
          message: 'This hazard was already reported. No need to report it again on the map.',
          code: 'DUPLICATE_HAZARD',
          matchingHazardId: duplicateResult.matchingHazardId ?? undefined,
        });
        return;
      }
    }

    const hazard = await Hazard.create(createData);
    const populated = await Hazard.findById(hazard._id)
      .populate('reportedBy', 'email name')
      .lean();

    console.log(`[CityScan] Hazard saved to DB: id=${hazard._id} type=${type} lat=${latitude} lng=${longitude}`);
    res.status(201).json(populated);
  } catch (err) {
    console.error('Hazard create error:', err);
    res.status(500).json({ message: 'Failed to create hazard' });
  }
}

// ========== LIST NEARBY ==========
/**
 * GET /hazards/nearby?latitude=&longitude=&radiusMeters=
 * Returns open/in_progress hazards within radius (default 50m).
 * Uses GeoJSON 2dsphere index on location (synced from lat/lng on save).
 */
export async function listNearby(req: Request, res: Response): Promise<void> {
  try {
    const lat = Number(req.query.latitude);
    const lng = Number(req.query.longitude);
    const radiusMeters = Math.min(Math.max(Number(req.query.radiusMeters) || 50, 10), 500);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ message: 'latitude and longitude are required and must be numbers' });
      return;
    }

    const radiusRadians = radiusMeters / 6378100;
    const hazards = await Hazard.find({
      status: { $in: ['open', 'in_progress'] },
      location: {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusRadians],
        },
      },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('reportedBy', 'email name')
      .lean();

    res.json(hazards);
  } catch (err) {
    console.error('Hazards listNearby error:', err);
    res.status(500).json({ message: 'Failed to list nearby hazards' });
  }
}

// ========== ANALYZE PHOTO (AI proxy) ==========
/**
 * POST /hazards/analyze-photo — proxy to AI service for image description. Body: { image: base64 }.
 * Keeps AI_SERVICE_API_KEY server-side; no auth required so demo frontend can call.
 */
export async function analyzePhoto(req: Request, res: Response): Promise<void> {
  try {
    const { image } = req.body as { image?: string };
    if (typeof image !== 'string' || !image.trim()) {
      res.status(400).json({ message: 'image (base64 string) is required' });
      return;
    }
    const description = await analyzePhotoViaService(image);
    if (description == null) {
      res.status(503).json({ message: 'AI service unavailable or not configured' });
      return;
    }
    res.json({ description });
  } catch (err) {
    console.error('analyzePhoto error:', err);
    res.status(500).json({ message: 'Failed to analyze photo' });
  }
}

// ========== CHECK SAME HAZARD (AI) ==========
/**
 * POST /hazards/check-same-hazard
 * Body: { type, description?, latitude, longitude, address? }
 * Fetches nearby open hazards and uses AI to determine if the new report is the same hazard.
 * Returns { isDuplicate: boolean, matchingHazardId?: string }.
 */
export async function checkSameHazardRoute(req: Request, res: Response): Promise<void> {
  try {
    const { type, description, latitude, longitude, address } = req.body as {
      type?: string;
      description?: string;
      latitude?: number;
      longitude?: number;
      address?: string;
    };

    if (
      type == null ||
      latitude == null ||
      longitude == null ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number'
    ) {
      res.status(400).json({ message: 'type, latitude, and longitude are required' });
      return;
    }

    const radiusRadians = DUPLICATE_RADIUS_METERS / 6378100;
    const lat = latitude;
    const lng = longitude;

    const nearby = await Hazard.find({
      status: { $in: ['open', 'in_progress'] },
      location: {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusRadians],
        },
      },
    })
      .limit(20)
      .lean();

    const newReport: { type: string; description?: string; address?: string } = { type };
    if (description != null && description !== '') newReport.description = description;
    if (address != null && address !== '') newReport.address = address;

    const existingForAi = nearby.map((h) => {
      const item: { _id: string; type: string; description?: string; status: string } = {
        _id: String(h._id),
        type: h.type,
        status: h.status,
      };
      if (h.description != null) item.description = h.description;
      return item;
    });

    const result = await checkSameHazardViaService(existingForAi, newReport);

    res.json({
      isDuplicate: result.isDuplicate,
      ...(result.matchingHazardId && { matchingHazardId: result.matchingHazardId }),
    });
  } catch (err) {
    console.error('checkSameHazardRoute error:', err);
    res.status(500).json({ message: 'Failed to check duplicate hazard' });
  }
}

// ========== GET ONE ==========
/**
 * GET /hazards/:id — get a single hazard by id.
 */
export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const hazard = await Hazard.findById(id).populate('reportedBy', 'email name').lean();
    if (!hazard) {
      res.status(404).json({ message: 'Hazard not found' });
      return;
    }
    res.json(hazard);
  } catch (err) {
    console.error('Hazard getOne error:', err);
    res.status(500).json({ message: 'Failed to get hazard' });
  }
}

// ========== UPDATE ==========
/**
 * PATCH /hazards/:id — update hazard (status, description). Requires auth; only reporter can update.
 */
export async function update(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const hazard = await Hazard.findById(id);
    if (!hazard) {
      res.status(404).json({ message: 'Hazard not found' });
      return;
    }

    const isAdmin = (user as unknown as { role?: string }).role === 'admin';
    if (!isAdmin && !hazard.reportedBy.equals(user._id)) {
      res.status(403).json({ message: 'Only the reporter or an admin can update this hazard' });
      return;
    }

    const { status, description } = req.body as { status?: HazardStatus; description?: string };
    if (status !== undefined && ['open', 'in_progress', 'resolved'].includes(status)) {
      hazard.status = status;
    }
    if (description !== undefined) {
      hazard.description = description.trim();
    }

    await hazard.save();
    const populated = await Hazard.findById(hazard._id)
      .populate('reportedBy', 'email name')
      .lean();
    res.json(populated);
  } catch (err) {
    console.error('Hazard update error:', err);
    res.status(500).json({ message: 'Failed to update hazard' });
  }
}

// ========== DELETE ==========
/**
 * DELETE /hazards/:id — delete hazard. Requires auth; only reporter can delete.
 */
export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const hazard = await Hazard.findById(id);
    if (!hazard) {
      res.status(404).json({ message: 'Hazard not found' });
      return;
    }

    if (!hazard.reportedBy.equals(user._id)) {
      res.status(403).json({ message: 'Only the reporter can delete this hazard' });
      return;
    }

    await Hazard.findByIdAndDelete(id);
    res.status(204).send();
  } catch (err) {
    console.error('Hazard delete error:', err);
    res.status(500).json({ message: 'Failed to delete hazard' });
  }
}
