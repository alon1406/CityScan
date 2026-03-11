/**
 * One-off script: delete all hazard reports from the database.
 * Run from backend folder: npm run clear-reports
 */
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import Hazard from '../models/Hazard.js';

dotenv.config();

async function clearReports() {
  await connectDB();
  const result = await Hazard.deleteMany({});
  console.log(`Cleared ${result.deletedCount} report(s) from the database.`);
  process.exit(0);
}

clearReports().catch((err) => {
  console.error('Error clearing reports:', err);
  process.exit(1);
});
