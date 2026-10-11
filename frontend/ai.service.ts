import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

// Load environment variables.
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is missing from .env");
}

const ai = new GoogleGenAI({ apiKey });
const model = process.env.GEMINI_MODEL || "gemini-3.7-flash";

export type ChatMessage = {
  role: "user" | "model";
  content: string;
};

export type ChatAttachment = {
  name: string;
  mimeType: string;
  data: string; // Base64 only: do not include the data:...;base64, prefix.
};

const modeInstructions: Record<string, string> = {
  Assistant: `
You are a highly capable personal AI assistant.
Be helpful, accurate, practical and friendly.
Give clear answers.
When the user asks for a complex task, break it into logical steps.
Do not unnecessarily repeat the user's question.
When files or images are attached, inspect their contents and answer the user's question about them.
If you cannot read or confidently interpret part of an attachment, say so rather than guessing.
`,
  Coding: `
You are an expert software engineer and coding mentor.
Write clean, production-quality code.
Explain important decisions.
When debugging, identify the root cause first.
Always consider performance, security and maintainability.
When code files, screenshots, or error images are attached, inspect them carefully before answering.
`,
  Study: `
You are an expert personal tutor.
Teach concepts clearly from basic to advanced.
Use simple examples.
When appropriate, provide examples, practice questions, memory tricks and step-by-step explanations.
When a document, screenshot, or study material is attached, use it as the basis for your answer.
`,
  Research: `
You are a research assistant.
Provide structured, analytical answers.
Clearly distinguish facts from assumptions.
Organize complex information into sections and tables when useful.
Do not fabricate sources or facts.
When files are attached, analyze their actual contents and be clear about limitations.
`,
};

export async function streamAIResponse(
  messages: ChatMessage[],
  mode: string,
  onChunk: (text: string) => void,
  attachments: ChatAttachment[] = []
) {
  const systemInstruction =
    modeInstructions[mode] || modeInstructions.Assistant;

  const lastUserMessageIndex = messages.reduce(
    (lastIndex, message, index) =>
      message.role === "user" ? index : lastIndex,
    -1
  );

  const contents = messages.map((message, index) => {
    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (message.content.trim()) {
      parts.push({ text: message.content });
    } else if (
      index === lastUserMessageIndex &&
      attachments.length > 0
    ) {
      parts.push({
        text: "Please inspect the attached file(s) and help me with them.",
      });
    }

    // Attach files only to the latest user turn. Never replay old base64 files
    // from previous turns or store their binary contents in MongoDB.
    if (index === lastUserMessageIndex && message.role === "user") {
      for (const attachment of attachments) {
        parts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data,
          },
        });
      }
    }

    return {
      role: message.role,
      parts,
    };
  });

  const response = await ai.models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction,
      temperature: 0.7,
    },
  });

  for await (const chunk of response) {
    const text = chunk.text;
    if (text) onChunk(text);
  }
}
