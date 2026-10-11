import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUserUsage extends Document {
  userId: Types.ObjectId;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  requestCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const userUsageSchema = new Schema<IUserUsage>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  totalInputTokens: { type: Number, default: 0 },
  totalOutputTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  requestCount: { type: Number, default: 0 },
}, { timestamps: true });

export const UserUsage = mongoose.models.UserUsage || mongoose.model<IUserUsage>("UserUsage", userUsageSchema);
