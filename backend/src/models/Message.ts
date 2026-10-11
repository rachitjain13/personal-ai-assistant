import mongoose, { Document, Schema } from "mongoose";

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  role: "user" | "model";
  content: string;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    role: {
      type: String,
      enum: ["user", "model"],
      required: true,
    },

    content: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Message = mongoose.model<IMessage>(
  "Message",
  messageSchema
);