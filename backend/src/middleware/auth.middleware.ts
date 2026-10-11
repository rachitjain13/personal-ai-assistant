import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { User } from "../models/User";

export type AuthenticatedRequest = Request & { userId?: string };

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const token = header.slice(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is missing from .env");

    const decoded = jwt.verify(token, secret) as { id?: string };
    if (!decoded.id || !Types.ObjectId.isValid(decoded.id)) {
      return res.status(401).json({ success: false, message: "Invalid authentication token." });
    }

    const user = await User.findById(decoded.id).select("_id");
    if (!user) {
      return res.status(401).json({ success: false, message: "User account not found." });
    }

    (req as AuthenticatedRequest).userId = user._id.toString();
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ success: false, message: "Invalid or expired authentication token." });
  }
}
