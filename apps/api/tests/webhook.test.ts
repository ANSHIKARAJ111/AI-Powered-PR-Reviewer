
import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const WEBHOOK_URL =
  "http://127.0.0.1:5001/api/webhooks/github";

function signPayload(payload: string, secret: string) {
  return `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;
}

describe("CodePilot AI - GitHub Webhook Security", () => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  it("should reject a missing signature", async () => {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "ping",
        "X-GitHub-Delivery": randomUUID(),
      },
      body: JSON.stringify({ zen: "test" }),
    });

    expect(response.status).toBe(401);
  });

  it("should reject an incorrect signature", async () => {
    const payload = JSON.stringify({ zen: "test" });

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "ping",
        "X-GitHub-Delivery": randomUUID(),
        "X-Hub-Signature-256": signPayload(
          payload,
          "incorrect-test-secret"
        ),
      },
      body: payload,
    });

    expect(response.status).toBe(401);
  });

  it("should accept a correctly signed ping event", async () => {
    if (!secret) {
      throw new Error(
        "GITHUB_WEBHOOK_SECRET is missing in .env"
      );
    }

    const payload = JSON.stringify({
      zen: "CodePilot AI signed webhook test",
    });

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "ping",
        "X-GitHub-Delivery": randomUUID(),
        "X-Hub-Signature-256": signPayload(
          payload,
          secret
        ),
      },
      body: payload,
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe("Event ignored");
  });

  it("should reject a tampered payload", async () => {
    if (!secret) {
      throw new Error(
        "GITHUB_WEBHOOK_SECRET is missing in .env"
      );
    }

    const originalPayload = JSON.stringify({
      zen: "original message",
    });

    const tamperedPayload = JSON.stringify({
      zen: "modified message",
    });

    const signature = signPayload(
      originalPayload,
      secret
    );

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "ping",
        "X-GitHub-Delivery": randomUUID(),
        "X-Hub-Signature-256": signature,
      },
      body: tamperedPayload,
    });

    expect(response.status).toBe(401);
  });

  it("should ignore a signed irrelevant event", async () => {
    if (!secret) {
      throw new Error(
        "GITHUB_WEBHOOK_SECRET is missing in .env"
      );
    }

    const payload = JSON.stringify({
      action: "created",
    });

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "issues",
        "X-GitHub-Delivery": randomUUID(),
        "X-Hub-Signature-256": signPayload(
          payload,
          secret
        ),
      },
      body: payload,
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe("Event ignored");
  });
});
