import dotenv from "dotenv";

dotenv.config();

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:0.6b";

export type ChatMessage = {
  role: "user" | "model";
  content: string;
};

export type ChatAttachment = {
  name: string;
  mimeType: string;
  data: string;
};

const modeInstructions: Record<string, string> = {
  Assistant: `
You are a highly capable personal AI assistant.

Be helpful, accurate, practical and friendly.
Give clear and direct answers.
Do not unnecessarily repeat the user's question.
For complex tasks, break the answer into logical steps.
If you are unsure about something, say so instead of inventing information.
`,

  Coding: `
You are an expert software engineer and coding mentor.

Write clean and practical code.
Explain important decisions clearly.
When debugging, identify the root cause first.
Consider performance, security and maintainability.
When giving code, make sure it is complete and usable.
`,

  Study: `
You are an expert personal tutor.

Teach concepts clearly from basic to advanced.
Use simple examples.
Explain difficult concepts step by step.
When useful, provide examples, practice questions and memory tricks.
Focus on helping the student actually understand the topic.
`,

  Research: `
You are a research assistant.

Provide structured and analytical answers.
Clearly distinguish facts from assumptions.
Do not fabricate sources, statistics or facts.
Organize complex information into useful sections.
`,
};

export type TokenUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
};

function attachmentToText(attachment: ChatAttachment): string | null {
  const mimeType = attachment.mimeType.toLowerCase();

  const textTypes = [
    "text/",
    "application/json",
    "application/javascript",
    "application/typescript",
    "application/xml",
    "application/sql",
  ];

  const isText = textTypes.some((type) => mimeType.startsWith(type));

  if (!isText) {
    return null;
  }

  try {
    return Buffer.from(attachment.data, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

function buildAttachmentContext(
  attachments: ChatAttachment[]
): string {
  if (!attachments.length) {
    return "";
  }

  const sections: string[] = [];

  for (const attachment of attachments) {
    const text = attachmentToText(attachment);

    if (text !== null) {
      sections.push(
        `\n--- FILE: ${attachment.name} ---\n${text}\n--- END FILE ---\n`
      );
    } else {
      sections.push(
        `\nThe user attached "${attachment.name}" (${attachment.mimeType}), but this local text model cannot directly inspect this file type.\n`
      );
    }
  }

  return sections.join("\n");
}

function convertRole(role: ChatMessage["role"]): "user" | "assistant" {
  return role === "model" ? "assistant" : "user";
}

export async function streamAIResponse(
  messages: ChatMessage[],
  mode: string,
  onChunk: (text: string) => void,
  attachments: ChatAttachment[] = [],
  onUsage?: (
    usage: TokenUsageMetadata
  ) => void | Promise<void>
) {
  const systemInstruction =
    modeInstructions[mode] || modeInstructions.Assistant;

  const lastUserMessageIndex = messages.reduce(
    (lastIndex, message, index) =>
      message.role === "user" ? index : lastIndex,
    -1
  );

  const attachmentContext = buildAttachmentContext(attachments);

  const ollamaMessages = messages.map((message, index) => {
    let content = message.content;

    // Attach file information only to the latest user message.
    if (
      index === lastUserMessageIndex &&
      message.role === "user" &&
      attachments.length > 0
    ) {
      if (content.trim()) {
        content += "\n\n";
      }

      content +=
        "Please use the following attached file information when answering the user's question:\n";

      content += attachmentContext;
    }

    return {
      role: convertRole(message.role),
      content,
    };
  });

  // If there are attachments but the latest user message was empty,
  // create a user message containing the attachment information.
  if (
    attachments.length > 0 &&
    lastUserMessageIndex === -1
  ) {
    ollamaMessages.push({
      role: "user",
      content:
        "Please inspect the following attached file information and help me with it:\n" +
        attachmentContext,
    });
  }

  const requestBody = {
  model: OLLAMA_MODEL,
  messages: [
    {
      role: "system",
      content: systemInstruction,
    },
    ...ollamaMessages,
  ],
  stream: true,
  think: false,
  options: {
    temperature: 0.7,
    num_ctx: 1024,
    num_predict: 160,
  },
  keep_alive: "30m",
};
  console.log(
    `Sending request to Ollama: ${OLLAMA_URL}`
  );

  console.log(
    `Ollama model: ${OLLAMA_MODEL}`
  );

  const response = await fetch(
    `${OLLAMA_URL}/api/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Ollama API error (${response.status}): ${errorText}`
    );
  }

  if (!response.body) {
    throw new Error(
      "Ollama returned no response body."
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  let promptTokenCount: number | undefined;
  let candidatesTokenCount: number | undefined;
  let totalTokenCount: number | undefined;

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const lines = buffer.split("\n");

      // Keep incomplete JSON line for next chunk.
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
          continue;
        }

        let data: {
          message?: {
            role?: string;
            content?: string;
          };
          done?: boolean;
          prompt_eval_count?: number;
          eval_count?: number;
          total_duration?: number;
          load_duration?: number;
        };

        try {
          data = JSON.parse(trimmed);
        } catch {
          console.warn(
            "Could not parse Ollama stream chunk:",
            trimmed
          );

          continue;
        }

        // Send generated text to the controller/frontend.
        const text = data.message?.content;

        if (text) {
          onChunk(text);
        }

        // Ollama provides token counts on the final chunk.
        if (typeof data.prompt_eval_count === "number") {
          promptTokenCount =
            data.prompt_eval_count;
        }

        if (typeof data.eval_count === "number") {
          candidatesTokenCount =
            data.eval_count;
        }

        if (data.done) {
          if (
            promptTokenCount !== undefined ||
            candidatesTokenCount !== undefined
          ) {
            totalTokenCount =
              (promptTokenCount || 0) +
              (candidatesTokenCount || 0);

            if (onUsage) {
              await onUsage({
                promptTokenCount,
                candidatesTokenCount,
                totalTokenCount,
                // Ollama/Qwen does not expose
                // Gemini-style thoughtsTokenCount here.
                thoughtsTokenCount: undefined,
              });
            }
          }

          console.log(
            `Ollama generation completed. Prompt tokens: ${promptTokenCount ?? 0
            }, Output tokens: ${candidatesTokenCount ?? 0
            }, Total: ${totalTokenCount ?? 0}`
          );
        }
      }
    }

    // Process any final buffered line.
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);

        const text = data.message?.content;

        if (text) {
          onChunk(text);
        }

        if (typeof data.prompt_eval_count === "number") {
          promptTokenCount =
            data.prompt_eval_count;
        }

        if (typeof data.eval_count === "number") {
          candidatesTokenCount =
            data.eval_count;
        }
      } catch {
        // Ignore incomplete final buffer.
      }
    }
  } finally {
    reader.releaseLock();
  }
}