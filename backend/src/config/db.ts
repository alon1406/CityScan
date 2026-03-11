import mongoose from 'mongoose';

const connectDB = async () => {
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URI)?.trim();
  if (!uri || typeof uri !== 'string') {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }
  const dbName = (process.env.MONGODB_DB_NAME || 'cityscan').trim();
  try {
    const conn = await mongoose.connect(uri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`🚀 MongoDB Connected: ${conn.connection.host} (db: ${conn.connection.name})`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`❌ MongoDB connection error: ${error.message}`);
    }
    process.exit(1);
  }
};

export default connectDB;