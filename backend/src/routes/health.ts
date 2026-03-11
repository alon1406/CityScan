import { Router } from 'express';
import mongoose from 'mongoose';

export const router = Router();

router.get('/', (_req, res) => {
  res.json({ message: 'OK' });
});

/** GET /health/db — verify MongoDB connection (for debugging "data not saving"). */
router.get('/db', async (_req, res) => {
  try {
    const state = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const stateName = states[state] ?? 'unknown';
    if (state !== 1) {
      return res.status(503).json({ ok: false, message: 'DB not connected', readyState: state, readyStateName: stateName });
    }
    res.json({ ok: true, message: 'MongoDB connected', readyState: state, readyStateName: stateName });
  } catch (e) {
    res.status(503).json({ ok: false, message: (e as Error).message });
  }
});