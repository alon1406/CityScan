import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import connectDB from './config/db.js';
import { healthRoutes, authRoutes, usersRoutes, hazardsRoutes, logsRoutes } from './routes/index.js';
import { rateLimiter, authRateLimiter } from './middleware/rateLimiter.js';
import { optionalAuth } from './middleware/optionalAuth.js';
import { demoRestrict } from './middleware/demoRestrict.js';

// STEP 1: Load environment variables before anything else
dotenv.config();

const app = express();
const port = process.env.PORT ?? 5000;

const frontendOrigin = process.env.FRONTEND_URL || process.env.CORS_ORIGIN;
const corsOptions = frontendOrigin
  ? { origin: frontendOrigin }
  : {}; // dev: allow all origins when FRONTEND_URL not set

// STEP 3: Global Middlewares
app.use(cors(corsOptions));
app.use(helmet());
// Allow larger payloads for hazard reports with multiple photos (base64)
app.use(express.json({ limit: '8mb' }));
app.use(rateLimiter);
app.use(optionalAuth);
app.use(demoRestrict);

// STEP 4: Route Definitions
app.use('/health', healthRoutes);
app.use('/auth', authRateLimiter, authRoutes);
app.use('/users', usersRoutes);
app.use('/hazards', hazardsRoutes);
app.use('/logs', logsRoutes);

// Root Endpoint for testing
app.get('/', (_req, res) => {
  res.send('CityScan API is running...');
});

// STEP 5: Global Error Handling Middleware
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err?.stack ?? err);
  const isProduction = process.env.NODE_ENV === 'production';
  const status = err?.status ?? err?.statusCode ?? 500;
  const message = status === 413
    ? 'Request too large. Try fewer or smaller photos.'
    : (err?.message && !isProduction ? err.message : 'Something went wrong!');
  res.status(status >= 400 && status < 600 ? status : 500).json({
    message,
    ...(isProduction ? {} : { error: err?.message }),
  });
});

// STEP 6: Connect to DB then start Server (so first request can use DB)
async function start() {
  await connectDB();
  app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
  });
}
start();