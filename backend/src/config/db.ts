import mongoose from "mongoose";

export async function connectDB() {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error("MONGODB_URI is missing from .env");
    }

    await mongoose.connect(mongoURI);

    console.log(" MongoDB connected successfully");
  } catch (error) {
    console.error(" MongoDB connection failed:");
    console.error(error);
    process.exit(1);
  }
}