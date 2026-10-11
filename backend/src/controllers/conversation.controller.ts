import { Request, Response } from "express";
import { Conversation } from "../models/Conversation";
import { Message } from "../models/Message";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

const userIdOf = (req: Request) => (req as AuthenticatedRequest).userId;

export async function getConversations(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
    const conversations = await Conversation.find({ userId }).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, conversations });
  } catch (error) {
    console.error("Get conversations error:", error);
    return res.status(500).json({ success: false, message: "Failed to load conversations." });
  }
}

export async function getConversation(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
    const conversation = await Conversation.findOne({ _id: req.params.id, userId });
    if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found." });
    const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
    return res.json({ success: true, conversation, messages });
  } catch (error) {
    console.error("Get conversation error:", error);
    return res.status(500).json({ success: false, message: "Failed to load conversation." });
  }
}

export async function deleteConversation(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
    const conversation = await Conversation.findOneAndDelete({ _id: req.params.id, userId });
    if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found." });
    await Message.deleteMany({ conversationId: conversation._id });
    return res.json({ success: true, message: "Conversation deleted." });
  } catch (error) {
    console.error("Delete conversation error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete conversation." });
  }
}
