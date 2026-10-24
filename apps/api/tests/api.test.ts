
import { describe, expect, it } from "vitest";

const API = "http://127.0.0.1:5000";
const WEBHOOK = "http://127.0.0.1:5001";

describe("CodePilot AI - API Integration Tests", () => {
  it("should return healthy backend status", async () => {
    const response = await fetch(`${API}/api/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.service).toBe("CodePilot AI Backend");
  });

  it("should return existing AI reviews", async () => {
    const response = await fetch(`${API}/api/reviews`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.reviews)).toBe(true);
  });

  it("should reject an invalid PR number", async () => {
    const response = await fetch(`${API}/api/reviews/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pullNumber: -1 }),
    });

    expect(response.status).toBe(400);
  });

  it("should reject an unsigned GitHub webhook", async () => {
    const response = await fetch(
      `${WEBHOOK}/api/webhooks/github`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GitHub-Event": "ping",
        },
        body: JSON.stringify({ zen: "test" }),
      }
    );

    expect(response.status).toBe(401);
  });

  it("should not expose reviews API on webhook port", async () => {
    const response = await fetch(`${WEBHOOK}/api/reviews`);

    expect(response.status).toBe(404);
  });
});
