import { recoverPendingReviews } from "./services/recoveryService.js";
import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import { prisma } from "./config/database.js";
import { runAIReview } from "./services/reviewService.js";
import { App } from "@octokit/app";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { randomBytes } from "node:crypto";

dotenv.config();

// ==========================================
// EXPRESS APPLICATIONS
// ==========================================

const app = express();
const webhookApp = express();

const isProduction = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 5000;
const WEBHOOK_PORT = 5001;
const HOST = isProduction ? "0.0.0.0" : "127.0.0.1";

const OWNER = "ANSHIKARAJ111";
const REPO = "IntelliTrust-FinGuard";

// ==========================================
// RATE LIMITING
// ==========================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

// ==========================================
// MIDDLEWARE
// ==========================================

// In production, GitHub sends signed webhooks to the SAME port as the API.
// Mount before express.json() so the HMAC handler receives the raw body.
// In development, webhooks remain isolated on 127.0.0.1:5001.
if (isProduction) {
  app.set("trust proxy", 1);
  app.use(webhookApp);
}

const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use("/api", apiLimiter);

// ==========================================
// GITHUB OAUTH + SIGNED SESSION
// ==========================================
// Set SESSION_SECRET (32+ random bytes), FRONTEND_ORIGIN,
// GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET, and
// GITHUB_ALLOWED_LOGIN in Render. Do not put secrets in Vite.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const SESSION_COOKIE = "codepilot_session";
const STATE_COOKIE = "codepilot_oauth_state";
const EIGHT_HOURS = 8 * 60 * 60;

type SessionUser = { id: number; login: string; avatarUrl?: string };
type SignedSession = { user: SessionUser; exp: number };

function oauthReady(): boolean {
  return Boolean(
    process.env.GITHUB_OAUTH_CLIENT_ID &&
      process.env.GITHUB_OAUTH_CLIENT_SECRET &&
      process.env.SESSION_SECRET &&
      process.env.GITHUB_ALLOWED_LOGIN &&
      process.env.FRONTEND_ORIGIN
  );
}

function sign(value: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET || "")
    .update(value)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function makeSession(user: SessionUser): string {
  const payload = Buffer.from(
    JSON.stringify({ user, exp: Date.now() + EIGHT_HOURS * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readSession(req: Request): SessionUser | null {
  if (!process.env.SESSION_SECRET) return null;
  const raw = req.cookies?.[SESSION_COOKIE];
  if (typeof raw !== "string") return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!safeEqual(sign(payload), signature)) return null;
  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as SignedSession;
    if (
      typeof session.exp !== "number" ||
      session.exp <= Date.now() ||
      typeof session.user?.id !== "number" ||
      typeof session.user?.login !== "string"
    ) return null;
    if (
      session.user.login.toLowerCase() !==
      process.env.GITHUB_ALLOWED_LOGIN?.toLowerCase()
    ) return null;
    return session.user;
  } catch {
    return null;
  }
}

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
};

// Follow these routes through the Vercel /api rewrite. The callback
// is intentionally on the Vercel origin so cookies are first-party.
app.get("/api/auth/github", (_req: Request, res: Response) => {
  if (!oauthReady()) {
    res.status(503).json({ success: false, message: "OAuth not configured" });
    return;
  }
  const state = randomBytes(32).toString("hex");
  res.cookie(STATE_COOKIE, sign(state) + "." + state, {
    ...cookieOptions,
    maxAge: 10 * 60 * 1000,
  });
  const redirectUri = `${FRONTEND_ORIGIN}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    state,
  });
  res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
});

app.get("/api/auth/github/callback", async (req: Request, res: Response) => {
  const finish = (reason: string) =>
    res.redirect(302, `${FRONTEND_ORIGIN}/?auth_error=${encodeURIComponent(reason)}`);
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const saved = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, cookieOptions);
  if (!oauthReady() || !code || !state || typeof saved !== "string") {
    finish("invalid_request");
    return;
  }
  if (!safeEqual(`${sign(state)}.${state}`, saved)) {
    finish("state_mismatch");
    return;
  }
  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: `${FRONTEND_ORIGIN}/api/auth/github/callback`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenResponse.ok) throw new Error("GitHub token exchange failed");
    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
    };
    if (!tokenData.access_token || tokenData.error) {
      finish("github_token_failed");
      return;
    }
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "CodePilot-AI",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!userResponse.ok) throw new Error("GitHub identity lookup failed");
    const githubUser = (await userResponse.json()) as {
      id?: number;
      login?: string;
      avatar_url?: string;
    };
    if (
      !Number.isSafeInteger(githubUser.id) ||
      !githubUser.login ||
      githubUser.login.toLowerCase() !==
        process.env.GITHUB_ALLOWED_LOGIN!.toLowerCase()
    ) {
      finish("not_authorized");
      return;
    }
    if (
  typeof githubUser.id !== "number" ||
  !Number.isSafeInteger(githubUser.id)
) {
  throw new Error("Invalid GitHub user ID");
}

const user: SessionUser = {
  id: githubUser.id,
  login: githubUser.login,
  ...(githubUser.avatar_url
    ? { avatarUrl: githubUser.avatar_url }
    : {}),
};
    res.cookie(SESSION_COOKIE, makeSession(user), {
      ...cookieOptions,
      maxAge: EIGHT_HOURS * 1000,
    });
    res.redirect(302, `${FRONTEND_ORIGIN}/`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    finish("login_failed");
  }
});

app.get("/api/auth/me", (req: Request, res: Response) => {
  const user = readSession(req);
  res.setHeader("Cache-Control", "no-store");
  if (!user) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, user });
});

app.post("/api/auth/logout", (req: Request, res: Response) => {
  if (isProduction && req.header("origin") !== FRONTEND_ORIGIN) {
    res.status(403).json({ success: false, message: "Invalid origin" });
    return;
  }
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.json({ success: true });
});

// Protect ALL production dashboard APIs, including manual review requests.
// Webhook routes are mounted before this guard and verified by GitHub HMAC.
app.use("/api", (req: Request, res: Response, next) => {
  if (!isProduction || req.path === "/health") return next();
  if (!readSession(req)) {
    res.status(401).json({ success: false, message: "Sign in with GitHub" });
    return;
  }
  // Restrict cross-site state-changing requests even if cookies are present.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.header("origin") !== FRONTEND_ORIGIN) {
    res.status(403).json({ success: false, message: "Invalid origin" });
    return;
  }
  next();
});

// ==========================================
// GITHUB WEBHOOK HANDLER
// ==========================================

// Protect against repeated webhook delivery IDs.
const processedDeliveries = new Map<string, number>();

// Prevent overlapping AI reviews for the same PR.
const activeReviews = new Set<number>();

async function executeReview(pullNumber: number) {
  if (activeReviews.has(pullNumber)) {
    throw new Error(
      `Review for PR #${pullNumber} is already running`
    );
  }

  activeReviews.add(pullNumber);

  try {
    return await runAIReview(pullNumber);
  } finally {
    activeReviews.delete(pullNumber);
  }
}

type GitHubWebhookPayload = {
  action?: string;
  installation?: {
    id?: number;
  };
  repository?: {
    full_name?: string;
  };
  pull_request?: {
    number?: number;
  };
};

// IMPORTANT:
// GitHub webhooks use the separate Express app.
// Raw request body is required for signature verification.

webhookApp.post(
  "/api/webhooks/github",
  express.raw({
    type: "application/json",
    limit: "1mb",
  }),
  (req: Request, res: Response) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    // 1. Verify webhook configuration.
    if (!secret || !Buffer.isBuffer(req.body)) {
      res.status(400).json({
        success: false,
        message: "Invalid webhook configuration or payload",
      });
      return;
    }

    // 2. Verify GitHub's HMAC-SHA256 signature.
    const signature = req.header("x-hub-signature-256");

    if (
      !signature ||
      !/^sha256=[a-f0-9]{64}$/i.test(signature)
    ) {
      res.status(401).json({
        success: false,
        message: "Missing or invalid signature",
      });
      return;
    }

    const expected = `sha256=${createHmac("sha256", secret)
      .update(req.body)
      .digest("hex")}`;

    const signatureBuffer = Buffer.from(
      signature.toLowerCase()
    );

    const expectedBuffer = Buffer.from(expected);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      res.status(401).json({
        success: false,
        message: "Webhook signature verification failed",
      });
      return;
    }

    // 3. Read event metadata.
    const event = req.header("x-github-event");
    const deliveryId = req.header("x-github-delivery");

    if (!deliveryId) {
      res.status(400).json({
        success: false,
        message: "Missing delivery ID",
      });
      return;
    }

    // 4. Check duplicate deliveries.
    if (processedDeliveries.has(deliveryId)) {
      res.status(200).json({
        success: true,
        message: "Duplicate delivery ignored",
      });
      return;
    }

    // 5. Parse the signed request body.
    let payload: GitHubWebhookPayload;

    try {
      payload = JSON.parse(
        req.body.toString("utf8")
      ) as GitHubWebhookPayload;
    } catch {
      res.status(400).json({
        success: false,
        message: "Invalid JSON payload",
      });
      return;
    }

    // 6. Only allow events from our test repository.
    const allowedRepo = `${OWNER}/${REPO}`;

    const allowedInstallation = Number(
      process.env.GITHUB_INSTALLATION_ID
    );

    const pullNumber = payload.pull_request?.number;

    const supportedActions = [
      "opened",
      "synchronize",
      "reopened",
    ];

    const validEvent =
      event === "pull_request" &&
      supportedActions.includes(payload.action ?? "") &&
      payload.repository?.full_name === allowedRepo &&
      Number.isSafeInteger(allowedInstallation) &&
      payload.installation?.id === allowedInstallation &&
      typeof pullNumber === "number" &&
      Number.isSafeInteger(pullNumber) &&
      pullNumber > 0;

    if (!validEvent) {
      res.status(200).json({
        success: true,
        message: "Event ignored",
      });
      return;
    }

    // 7. Remove old delivery IDs.
    const now = Date.now();
    const retention = 24 * 60 * 60 * 1000;

    for (const [id, timestamp] of processedDeliveries) {
      if (now - timestamp > retention) {
        processedDeliveries.delete(id);
      }
    }

    // 8. Prevent concurrent review jobs.
    if (activeReviews.has(pullNumber)) {
      res.status(202).json({
        success: true,
        message: "Review is already running",
        pullNumber,
      });
      return;
    }

    processedDeliveries.set(deliveryId, now);

    console.log(
      `Verified webhook: ${payload.action} PR #${pullNumber}`
    );

    // 9. Reserve the PR before acknowledging the event.
    activeReviews.add(pullNumber);

    res.status(202).json({
      success: true,
      message: "Webhook accepted. AI review starting.",
      pullNumber,
    });

    // 10. Execute the review asynchronously.
    void runAIReview(pullNumber)
      .then((review) => {
        console.log(
          `Automatic review saved: ${review.id}`
        );
      })
      .catch((error) => {
        console.error(
          "Automatic review failed:",
          error
        );
      })
      .finally(() => {
        activeReviews.delete(pullNumber);
      });
  }
);

// ==========================================
// HOME ROUTE
// ==========================================

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    message: "Welcome to CodePilot AI",
    status: "running",
    endpoints: [
      "/api/health",
      "/api/users",
      "/api/reviews",
      "/api/reviews/run",
      "/api/github/pulls",
    ],
  });
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get(
  "/api/health",
  (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      service: "CodePilot AI Backend",
    });
  }
);

// ==========================================
// USER VALIDATION
// ==========================================

const userSchema = z.object({
  githubId: z.string().min(1),
  username: z.string().min(1),
  avatarUrl: z.string().url().optional(),
});

// ==========================================
// CREATE OR UPDATE USER
// ==========================================

app.post("/api/users", async (req, res) => {
  try {
    const parsed = userSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid user data",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { githubId, username, avatarUrl } = parsed.data;

    const user = await prisma.user.upsert({
      where: {
        githubId,
      },
      update: {
        username,
        ...(avatarUrl !== undefined
          ? { avatarUrl }
          : {}),
      },
      create: {
        githubId,
        username,
        ...(avatarUrl !== undefined
          ? { avatarUrl }
          : {}),
      },
    });

    res.status(200).json({
      success: true,
      message: "User saved successfully",
      user,
    });
  } catch (error) {
    console.error("Create user error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ==========================================
// GET ALL USERS
// ==========================================

app.get("/api/users", async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({
      success: true,
      total: users.length,
      users,
    });
  } catch (error) {
    console.error("Fetch users error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ==========================================
// GET ALL AI REVIEWS
// ==========================================

app.get("/api/reviews", async (_req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        findings: true,
        pullRequest: {
          include: {
            repository: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      total: reviews.length,
      reviews,
    });
  } catch (error) {
    console.error(
      "Failed to fetch reviews:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch AI reviews",
    });
  }
});

// ==========================================
// GET SINGLE AI REVIEW
// ==========================================

app.get("/api/reviews/:id", async (req, res) => {
  try {
    const id = String(req.params.id);

    const review = await prisma.review.findUnique({
      where: {
        id,
      },
      include: {
        findings: true,
        pullRequest: {
          include: {
            repository: true,
          },
        },
      },
    });

    if (!review) {
      res.status(404).json({
        success: false,
        message: "Review not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      review,
    });
  } catch (error) {
    console.error(
      "Failed to fetch review:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch AI review",
    });
  }
});

// ==========================================
// RUN AI REVIEW MANUALLY
// ==========================================

const runReviewSchema = z.object({
  pullNumber: z.number().int().positive().max(100000),
});

app.post("/api/reviews/run", async (req, res) => {
  // Development-only endpoint.
  // The API listener is bound to 127.0.0.1.
  // Never expose port 5000 through a public tunnel.

  // Development mein manual reviews sirf localhost se allowed hain.
// Production mein GitHub OAuth authentication middleware protect karega.

if (!isProduction) {
  const remoteAddress = req.socket.remoteAddress;

  const isLocal =
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1";

  if (!isLocal) {
    res.status(403).json({
      success: false,
      message: "Review trigger is restricted to localhost",
    });
    return;
  }
}
  const parsed = runReviewSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Provide a valid pullNumber",
    });
    return;
  }

  const { pullNumber } = parsed.data;

  if (activeReviews.has(pullNumber)) {
    res.status(409).json({
      success: false,
      message: `Review for PR #${pullNumber} is already running`,
    });
    return;
  }

  try {
    console.log(
      `Starting AI review for PR #${pullNumber}`
    );

    const review = await executeReview(pullNumber);

    res.status(201).json({
      success: true,
      message: "AI review completed successfully",
      reviewId: review.id,
      totalFindings: review.findings.length,
      review,
    });
  } catch (error) {
    console.error(
      "Run AI review failed:",
      error
    );

    res.status(500).json({
      success: false,
      message: "AI review could not be completed",
    });
  }
});

// ==========================================
// FETCH GITHUB PULL REQUESTS
// ==========================================

app.get("/api/github/pulls", async (_req, res) => {
  try {
    const appId = process.env.GITHUB_APP_ID;
    const installationId =
      process.env.GITHUB_INSTALLATION_ID;
    const keyPath =
      process.env.GITHUB_PRIVATE_KEY_PATH;

    if (!appId || !installationId || !keyPath) {
      res.status(500).json({
        success: false,
        message: "GitHub App configuration missing",
      });
      return;
    }

    const privateKey = readFileSync(
      resolve(process.cwd(), keyPath),
      "utf8"
    );

    const githubApp = new App({
      appId,
      privateKey,
    });

    const octokit =
      await githubApp.getInstallationOctokit(
        Number(installationId)
      );

    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/pulls",
      {
        owner: OWNER,
        repo: REPO,
        state: "open",
        per_page: 100,
      }
    );

    const pulls = response.data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      state: pr.state,
    }));

    res.status(200).json({
      success: true,
      total: pulls.length,
      pulls,
    });
  } catch (error) {
    console.error(
      "Failed to fetch GitHub PRs:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch GitHub pull requests",
    });
  }
});

// ==========================================
// START API SERVER
// ==========================================

app.listen(PORT, HOST, () => {
  console.log("\n==============================");
  console.log("CodePilot AI Backend Started!");
  console.log("==============================");
  console.log(`Mode: ${isProduction ? "production" : "development"}`);
  console.log(`Server: http://${HOST}:${PORT}`);
  console.log(`Health: http://${HOST}:${PORT}/api/health`);
  if (isProduction) {
    console.log(`Webhook: /api/webhooks/github (same port ${PORT})`);
    console.log("Dashboard API requires GitHub OAuth session.");
  } else {
    console.log(`Reviews: http://${HOST}:${PORT}/api/reviews`);
  }
  console.log("==============================\n");

  // Recover completed, unpublished reviews on startup.
  // This is an initial recovery sweep, not a durable background queue.
  void recoverPendingReviews().catch((error: unknown) => {
    console.error("[Recovery] Startup recovery failed:", error);
  });
});

// ==========================================
// DEV-ONLY SEPARATE WEBHOOK LISTENER
// ==========================================

if (!isProduction) {
  webhookApp.listen(WEBHOOK_PORT, "127.0.0.1", () => {
    console.log("==============================");
    console.log("GitHub Webhook Server Started!");
    console.log("==============================");
    console.log(
      `Webhook: http://127.0.0.1:${WEBHOOK_PORT}/api/webhooks/github`
    );
    console.log("==============================\n");
  });
}
