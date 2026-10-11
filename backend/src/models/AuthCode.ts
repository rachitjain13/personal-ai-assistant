import mongoose, { Schema, Document } from "mongoose";

export type AuthCodePurpose = "verify_email" | "reset_password";

export interface IAuthCode extends Document {
  email: string;
  purpose: AuthCodePurpose;
  codeHash: string;
  expiresAt: Date;
  sentAt: Date;
  attempts: number;
  signupName?: string;
  passwordHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const authCodeSchema = new Schema<IAuthCode>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: {
      type: String,
      enum: ["verify_email", "reset_password"],
      required: true,
    },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    sentAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    signupName: { type: String, select: false },
    passwordHash: { type: String, select: false },
  },
  { timestamps: true }
);

authCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });

export const AuthCode =
  mongoose.models.AuthCode ||
  mongoose.model<IAuthCode>("AuthCode", authCodeSchema);
