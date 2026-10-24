
import { describe, expect, it } from "vitest";

const API = "http://127.0.0.1:5000";

describe("CodePilot AI - API Rate Limiting", () => {
  it("should expose rate limit headers", async () => {
    const response = await fetch(`${API}/api/health`);

    expect(response.status).toBe(200);
    expect(response.headers.has("ratelimit")).toBe(true);
    expect(response.headers.has("ratelimit-policy")).toBe(true);
  });

  it("should limit excessive API requests", async () => {
    let blocked = false;

    for (let i = 0; i < 105; i++) {
      const response = await fetch(`${API}/api/health`);

      if (response.status === 429) {
        blocked = true;
        break;
      }
    }

    expect(blocked).toBe(true);
  });
});
