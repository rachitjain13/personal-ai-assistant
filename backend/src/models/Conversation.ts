import mongoose, { Schema, Types } from "mongoose";

export interface IConversation {
  userId: Types.ObjectId;
  title: string;
  mode: string;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  mode: { type: String, default: "Assistant" },
}, { timestamps: true });

conversationSchema.index({ userId: 1, updatedAt: -1 });

export const Conversation = mongoose.models.Conversation || mongoose.model<IConversation>("Conversation", conversationSchema);
