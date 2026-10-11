import "dotenv/config";
import express from "express";
import cors from "cors";

import chatRoutes from "./routes/chat.route";
import conversationRoutes from "./routes/conversation.routes";
import { connectDB } from "./config/db";

const app = express();
const PORT = process.env.PORT || 5000;

// Base64 expands file size by roughly one third. Keep this limit aligned with
// the 12 MB combined raw attachment limit in chat.controller.ts.
app.use(
  cors({
    origin: "http://localhost:5173",
  })
);
app.use(express.json({ limit: "20mb" }));

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Personal AI Assistant API is running 🚀",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    status: "healthy",
  });
});

app.use("/api/chat", chatRoutes);
app.use("/api/conversations", conversationRoutes);

// Return a clear response when an incoming JSON request exceeds the body limit.
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (error?.type === "entity.too.large") {
      return res.status(413).json({
        success: false,
        message: "Request is too large. Reduce the size or number of attachments.",
      });
    }
    return next(error);
  }
);

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer();
