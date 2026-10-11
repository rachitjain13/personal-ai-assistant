import "dotenv/config";

import express from "express";
import cors from "cors";

import chatRoutes from "./routes/chat.route";
import conversationRoutes from "./routes/conversation.routes";
import authRoutes from "./routes/auth.route";
import { connectDB } from "./config/db";

const app = express();
const PORT = process.env.PORT || 5000;

// --------------------------------------------------
// LOCAL DEVELOPMENT CORS
// --------------------------------------------------
app.use(
  cors({
    origin: true,
    credentials: false,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// --------------------------------------------------
// JSON BODY PARSER
// --------------------------------------------------
app.use(
  express.json({
    limit: "20mb",
    strict: true,
  })
);

// --------------------------------------------------
// REQUEST LOGGER
// --------------------------------------------------
app.use((req, _res, next) => {
  console.log(
    `📥 ${new Date().toLocaleTimeString()} ${req.method} ${req.originalUrl}`
  );

  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    console.log("📦 Body received:", {
      hasBody: !!req.body,
      keys: req.body ? Object.keys(req.body) : [],
    });
  }

  next();
});
// --------------------------------------------------
// ROUTES
// --------------------------------------------------
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

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/conversations", conversationRoutes);

// --------------------------------------------------
// 404 HANDLER
// --------------------------------------------------
app.use("/api", (req, res) => {
  console.log(`❌ API route not found: ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// --------------------------------------------------
// JSON / EXPRESS ERROR HANDLER
// --------------------------------------------------
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("❌ EXPRESS ERROR:", error);

    if (error?.type === "entity.parse.failed") {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON body received by the server.",
      });
    }

    if (error?.type === "entity.too.large") {
      return res.status(413).json({
        success: false,
        message: "Request body is too large.",
      });
    }

    return res.status(500).json({
      success: false,
      message: error?.message || "Internal server error.",
    });
  }
);
// --------------------------------------------------
// START SERVER
// --------------------------------------------------
async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log("==========================================");
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log("📡 Request logging is ENABLED");
      console.log("📦 JSON body parsing is ENABLED");
      console.log("🌐 Local CORS is ENABLED");
      console.log("==========================================");
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
