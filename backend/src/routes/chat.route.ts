import { Router } from "express";
import { chatController } from "../controllers/chat.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth, chatController);

export default router;
