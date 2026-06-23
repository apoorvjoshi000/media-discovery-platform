// Authentication: signup/login/refresh + JWT issue/verify + role guard.
//
// Access token: short-lived (15 min), returned in the JSON body and sent by the
// client as `Authorization: Bearer`. Refresh token: longer-lived, set in an
// httpOnly + SameSite cookie to mitigate XSS token theft.
import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Collection, MongoClient } from "mongodb";
import { logger } from "./logger.js";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret";
const ACCESS_TTL = Number(process.env.JWT_ACCESS_TTL ?? 900);
const REFRESH_TTL = Number(process.env.JWT_REFRESH_TTL ?? 604800);

interface UserDoc {
  email: string;
  passwordHash: string;
  role: "user" | "admin";
}

export interface AuthPayload {
  sub: string; // email
  role: "user" | "admin";
}

let users: Collection<UserDoc> | null = null;

export async function initUsers(uri: string): Promise<void> {
  const client = new MongoClient(uri, { maxPoolSize: 10 });
  await client.connect();
  users = client.db().collection<UserDoc>("users");
  await users.createIndex({ email: 1 }, { unique: true });
  logger.info("user store ready");
}

function issueAccess(payload: AuthPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}
function issueRefresh(payload: AuthPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

authRouter.post("/signup", async (req: Request, res: Response) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;
  const exists = await users!.findOne({ email });
  if (exists) return res.status(409).json({ error: "email already registered" });
  const passwordHash = await bcrypt.hash(password, 10);
  // First user becomes admin so the demo can seed the catalog; rest are users.
  const role: "user" | "admin" = (await users!.countDocuments()) === 0 ? "admin" : "user";
  await users!.insertOne({ email, passwordHash, role });
  res.status(201).json({ email, role });
});

authRouter.post("/login", async (req: Request, res: Response) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;
  const user = await users!.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const payload: AuthPayload = { sub: email, role: user.role };
  const refresh = issueRefresh(payload);
  res.cookie("refresh_token", refresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: REFRESH_TTL * 1000,
  });
  res.json({ accessToken: issueAccess(payload), email, role: user.role, expiresIn: ACCESS_TTL });
});

authRouter.post("/refresh", (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: "no refresh token" });
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET) as AuthPayload;
    const payload: AuthPayload = { sub: decoded.sub, role: decoded.role };
    res.json({ accessToken: issueAccess(payload), expiresIn: ACCESS_TTL });
  } catch {
    res.status(401).json({ error: "invalid refresh token" });
  }
});

authRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("refresh_token");
  res.json({ ok: true });
});

// ---- middleware ----
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
      routePattern?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  try {
    req.user = jwt.verify(header.slice(7), ACCESS_SECRET) as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}

export function requireRole(role: "admin") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}

// Optional auth: attaches req.user if a valid token is present, else continues
// anonymously (used so browse/search work logged-out but can personalise in).
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice(7), ACCESS_SECRET) as AuthPayload;
    } catch {
      /* ignore bad token, stay anonymous */
    }
  }
  next();
}
