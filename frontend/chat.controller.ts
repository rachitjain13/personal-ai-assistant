import { Request, Response } from "express";
import {
  ChatAttachment,
  ChatMessage,
  streamAIResponse,
} from "../services/ai.service";
import { Conversation } from "../models/Conversation";
import { Message } from "../models/Message";

const MAX_ATTACHMENTS = 3;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 12 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
]);

function isValidBase64(value: string): boolean {
  if (!value || value.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

function validateAttachments(
  input: unknown
): { attachments?: ChatAttachment[]; error?: string } {
  if (input === undefined) return { attachments: [] };
  if (!Array.isArray(input)) {
    return { error: "Attachments must be an array." };
  }
  if (input.length > MAX_ATTACHMENTS) {
    return { error: `You can attach up to ${MAX_ATTACHMENTS} files per message.` };
  }

  const attachments: ChatAttachment[] = [];
  let totalBytes = 0;

  for (const item of input) {
    if (
      !item ||
      typeof item.name !== "string" ||
      typeof item.mimeType !== "string" ||
      typeof item.data !== "string"
    ) {
      return { error: "An attachment has an invalid format." };
    }

    const name = item.name.trim();
    const mimeType = item.mimeType.toLowerCase();
    const data = item.data;

    if (!name || name.length > 255) {
      return { error: "Attachment filename is invalid." };
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return {
        error: "Unsupported file type. Upload JPG, PNG, WEBP, PDF, TXT, or CSV files.",
      };
    }
    if (!isValidBase64(data)) {
      return {
        error: `The file "${name}" is not valid base64 data. Please select it again.`,
      };
    }

    const fileBytes = Buffer.from(data, "base64").byteLength;
    if (fileBytes === 0) {
      return { error: `The file "${name}" is empty.` };
    }
    if (fileBytes > MAX_FILE_BYTES) {
      return { error: `"${name}" is too large. Each file must be 6 MB or smaller.` };
    }

    totalBytes += fileBytes;
    if (totalBytes > MAX_TOTAL_FILE_BYTES) {
      return { error: "The combined attachment size must be 12 MB or smaller." };
    }

    attachments.push({ name, mimeType, data });
  }

  return { attachments };
}

export async function chatController(req: Request, res: Response) {
  console.log("\n==============================");
  console.log("CHAT REQUEST RECEIVED");
  console.log("==============================");

  try {
    const body = req.body as {
      messages?: ChatMessage[];
      mode?: string;
      conversationId?: string;
      attachments?: unknown;
    };

    const {
      messages,
      mode = "Assistant",
      conversationId,
    } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one message is required.",
      });
    }

    if (
      messages.some(
        (message) =>
          !message ||
          (message.role !== "user" && message.role !== "model") ||
          typeof message.content !== "string"
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more messages have an invalid format.",
      });
    }

    const attachmentValidation = validateAttachments(body.attachments);
    if (attachmentValidation.error) {
      return res.status(400).json({
        success: false,
        message: attachmentValidation.error,
      });
    }
    const attachments = attachmentValidation.attachments || [];

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserMessage) {
      return res.status(400).json({
        success: false,
        message: "A user message is required.",
      });
    }

    if (!latestUserMessage.content.trim() && attachments.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a message or attach a file before sending.",
      });
    }

    console.log("Mode:", mode);
    console.log("Conversation ID:", conversationId);
    console.log("Attachment count:", attachments.length);
    console.log("Message count:", messages.length);
    // Do not log attachment base64 or file contents.

    let conversation;

    if (conversationId) {
      conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: "Conversation not found.",
        });
      }
    } else {
      const firstUserMessage =
        messages.find((message) => message.role === "user")?.content.trim() ||
        (attachments.length
          ? `File: ${attachments[0].name}`
          : "New Chat");

      conversation = await Conversation.create({
        title: firstUserMessage.slice(0, 50),
        mode,
      });

      console.log("New conversation created:", conversation._id.toString());
    }

    const attachmentNote = attachments.length
      ? `\n\n[Attached files: ${attachments.map((file) => file.name).join(", ")}]`
      : "";
    const savedUserContent =
      `${latestUserMessage.content.trim()}${attachmentNote}`.trim() ||
      `[Attached files: ${attachments.map((file) => file.name).join(", ")}]`;

    await Message.create({
      conversationId: conversation._id,
      role: "user",
      content: savedUserContent,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let fullAIResponse = "";

    await streamAIResponse(
      messages,
      mode,
      (text) => {
        fullAIResponse += text;
        res.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
      },
      attachments
    );

    if (fullAIResponse) {
      await Message.create({
        conversationId: conversation._id,
        role: "model",
        content: fullAIResponse,
      });
    }

    await Conversation.findByIdAndUpdate(conversation._id, {
      updatedAt: new Date(),
    });

    res.write(
      `data: ${JSON.stringify({
        type: "conversation",
        conversationId: conversation._id.toString(),
      })}\n\n`
    );

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (error) {
    console.error("AI chat error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate AI response.",
      });
    }

    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message:
          error instanceof Error ? error.message : "AI response failed.",
      })}\n\n`
    );
    res.end();
  }
}
