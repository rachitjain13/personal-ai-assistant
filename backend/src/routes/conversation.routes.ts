import { Router } from "express";
import { deleteConversation, getConversation, getConversations } from "../controllers/conversation.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();
router.use(requireAuth);
router.get("/", getConversations);
router.get("/:id", getConversation);
router.delete("/:id", deleteConversation);
export default router;
