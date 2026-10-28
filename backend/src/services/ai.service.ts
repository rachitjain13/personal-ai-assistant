import dotenv from "dotenv";

dotenv.config();

/*
 * Ollama Cloud configuration
 *
 * Local:
 *   http://localhost:11434
 *
 * Cloud:
 *   https://ollama.com
 */

const OLLAMA_URL =
  process.env.OLLAMA_URL || "https://ollama.com";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "gemma4:31b";

const OLLAMA_API_KEY =
  process.env.OLLAMA_API_KEY;

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

Give complete and sufficiently detailed answers.
Do not stop in the middle of a sentence, list, explanation, or code block.
For multi-part questions, address every part.
For long answers, organize the response using headings and bullet points.
If a response must be shortened, finish the current point clearly instead of ending abruptly.

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

function attachmentToText(
  attachment: ChatAttachment
): string | null {
  const mimeType = attachment.mimeType.toLowerCase();

  const textTypes = [
    "text/",
    "application/json",
    "application/javascript",
    "application/typescript",
    "application/xml",
    "application/sql",
  ];

  const isText = textTypes.some((type) =>
    mimeType.startsWith(type)
  );

  if (!isText) {
    return null;
  }

  try {
    return Buffer.from(
      attachment.data,
      "base64"
    ).toString("utf-8");
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
        `\nThe user attached "${attachment.name}" (${attachment.mimeType}), but this AI model cannot directly inspect this file type.\n`
      );
    }
  }

  return sections.join("\n");
}

function convertRole(
  role: ChatMessage["role"]
): "user" | "assistant" {
  return role === "model"
    ? "assistant"
    : "user";
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
  /*
   * ---------------------------------------------------------
   * 1. Validate Ollama Cloud API key
   * ---------------------------------------------------------
   */

  if (!OLLAMA_API_KEY) {
    throw new Error(
      "OLLAMA_API_KEY is missing. Please configure it in your backend environment."
    );
  }

  /*
   * ---------------------------------------------------------
   * 2. Select system instruction
   * ---------------------------------------------------------
   */

  const systemInstruction =
    modeInstructions[mode] ||
    modeInstructions.Assistant;

  /*
   * ---------------------------------------------------------
   * 3. Find latest user message
   * ---------------------------------------------------------
   */

  const lastUserMessageIndex =
    messages.reduce(
      (lastIndex, message, index) =>
        message.role === "user"
          ? index
          : lastIndex,
      -1
    );

  /*
   * ---------------------------------------------------------
   * 4. Build attachment context
   * ---------------------------------------------------------
   */

  const attachmentContext =
    buildAttachmentContext(attachments);

  /*
   * ---------------------------------------------------------
   * 5. Convert messages to Ollama format
   * ---------------------------------------------------------
   */

  const ollamaMessages = messages.map(
    (message, index) => {
      let content = message.content;

      /*
       * Attach file information only to the
       * latest user message.
       */

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
    }
  );

  /*
   * ---------------------------------------------------------
   * 6. If only an attachment was sent
   * ---------------------------------------------------------
   */

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

  /*
   * ---------------------------------------------------------
   * 7. Ollama Cloud request body
   * ---------------------------------------------------------
   */

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

    /*
     * Disable thinking to keep responses faster
     * and reduce unnecessary token usage.
     */
    think: false,

    
options: {
  temperature: 0.7,
  num_ctx: 8192,
  num_predict: 2048,
},
  };

  /*
   * ---------------------------------------------------------
   * 8. Logging
   * ---------------------------------------------------------
   */

  console.log(
    `Sending request to Ollama Cloud: ${OLLAMA_URL}`
  );

  console.log(
    `Ollama Cloud model: ${OLLAMA_MODEL}`
  );

  /*
   * ---------------------------------------------------------
   * 9. Send request to Ollama Cloud
   * ---------------------------------------------------------
   */

  const response = await fetch(
    `${OLLAMA_URL.replace(/\/+$/, "")}/api/chat`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        /*
         * Ollama Cloud authentication.
         */
        Authorization: `Bearer ${OLLAMA_API_KEY}`,
      },

      body: JSON.stringify(requestBody),
    }
  );

  /*
   * ---------------------------------------------------------
   * 10. Handle API errors
   * ---------------------------------------------------------
   */

  if (!response.ok) {
    const errorText = await response.text();

    console.error(
      `Ollama Cloud API error (${response.status}):`,
      errorText
    );

    throw new Error(
      `Ollama API error (${response.status}): ${errorText}`
    );
  }

  /*
   * ---------------------------------------------------------
   * 11. Validate response body
   * ---------------------------------------------------------
   */

  if (!response.body) {
    throw new Error(
      "Ollama returned no response body."
    );
  }

  /*
   * ---------------------------------------------------------
   * 12. Create stream reader
   * ---------------------------------------------------------
   */

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let buffer = "";

  /*
   * ---------------------------------------------------------
   * 13. Token usage variables
   * ---------------------------------------------------------
   */

  let promptTokenCount:
    | number
    | undefined;

  let candidatesTokenCount:
    | number
    | undefined;

  let totalTokenCount:
    | number
    | undefined;

  /*
   * ---------------------------------------------------------
   * 14. Read streaming response
   * ---------------------------------------------------------
   */

  try {
    while (true) {
      const {
        value,
        done,
      } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(
        value,
        {
          stream: true,
        }
      );

      /*
       * Ollama sends newline-delimited JSON.
       */

      const lines =
        buffer.split("\n");

      /*
       * Keep incomplete JSON line
       * for the next chunk.
       */

      buffer =
        lines.pop() || "";

      for (const line of lines) {
        const trimmed =
          line.trim();

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

        /*
         * Parse JSON chunk.
         */

        try {
          data =
            JSON.parse(trimmed);
        } catch {
          console.warn(
            "Could not parse Ollama stream chunk:",
            trimmed
          );

          continue;
        }

        /*
         * ---------------------------------------------------
         * Send generated text to frontend
         * ---------------------------------------------------
         */

        const text =
          data.message?.content;

        if (text) {
          onChunk(text);
        }

        /*
         * ---------------------------------------------------
         * Collect token usage
         * ---------------------------------------------------
         */

        if (
          typeof data.prompt_eval_count ===
          "number"
        ) {
          promptTokenCount =
            data.prompt_eval_count;
        }

        if (
          typeof data.eval_count ===
          "number"
        ) {
          candidatesTokenCount =
            data.eval_count;
        }

        /*
         * ---------------------------------------------------
         * Final response
         * ---------------------------------------------------
         */

        if (data.done) {
          totalTokenCount =
            (promptTokenCount || 0) +
            (candidatesTokenCount || 0);

          /*
           * Send usage information
           * to the controller/database.
           */

          if (onUsage) {
            await onUsage({
              promptTokenCount,
              candidatesTokenCount,
              totalTokenCount,

              /*
               * Ollama does not provide
               * Gemini-style thoughtsTokenCount
               * here.
               */
              thoughtsTokenCount:
                undefined,
            });
          }

          console.log(
            `Ollama Cloud generation completed. ` +
              `Prompt tokens: ${
                promptTokenCount ?? 0
              }, ` +
              `Output tokens: ${
                candidatesTokenCount ?? 0
              }, ` +
              `Total: ${
                totalTokenCount ?? 0
              }`
          );
        }
      }
    }

    /*
     * ---------------------------------------------------------
     * 15. Process final buffered JSON
     * ---------------------------------------------------------
     */

    if (buffer.trim()) {
      try {
        const data =
          JSON.parse(buffer);

        const text =
          data.message?.content;

        if (text) {
          onChunk(text);
        }

        if (
          typeof data.prompt_eval_count ===
          "number"
        ) {
          promptTokenCount =
            data.prompt_eval_count;
        }

        if (
          typeof data.eval_count ===
          "number"
        ) {
          candidatesTokenCount =
            data.eval_count;
        }

        /*
         * Make sure total usage is available
         * even if the final JSON arrived in
         * the remaining buffer.
         */

        totalTokenCount =
          (promptTokenCount || 0) +
          (candidatesTokenCount || 0);
      } catch {
        /*
         * Ignore incomplete final buffer.
         */
      }
    }

    /*
     * ---------------------------------------------------------
     * 16. If usage wasn't reported earlier,
     *     report it here.
     * ---------------------------------------------------------
     */

    if (
      onUsage &&
      totalTokenCount !== undefined
    ) {
      await onUsage({
        promptTokenCount,
        candidatesTokenCount,
        totalTokenCount,
        thoughtsTokenCount:
          undefined,
      });
    }
  } finally {
    /*
     * Always release the stream reader.
     */

    reader.releaseLock();
  }
}