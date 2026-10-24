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

dotenv.config();

// ==========================================
// EXPRESS APPLICATIONS
// ==========================================

const app = express();
const webhookApp = express();

const PORT = Number(process.env.PORT) || 5000;
const WEBHOOK_PORT = 5001;

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

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json({ limit: "100kb" }));

app.use("/api", apiLimiter);

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
// START MAIN BACKEND — PORT 5000
// ==========================================

app.listen(PORT, "127.0.0.1", () => {
  console.log("\n==============================");
  console.log("CodePilot AI Backend Started!");
  console.log("==============================");
  console.log(`Server: http://127.0.0.1:${PORT}`);
  console.log(
    `Health API: http://127.0.0.1:${PORT}/api/health`
  );
  console.log(
    `Reviews API: http://127.0.0.1:${PORT}/api/reviews`
  );
  console.log("==============================\n");
});

// ==========================================
// START WEBHOOK SERVER — PORT 5001
// ==========================================

webhookApp.listen(
  WEBHOOK_PORT,
  "127.0.0.1",
  () => {
    console.log("==============================");
    console.log("GitHub Webhook Server Started!");
    console.log("==============================");
    console.log(
      `Webhook: http://127.0.0.1:${WEBHOOK_PORT}/api/webhooks/github`
    );
    console.log("==============================\n");
  }
);
