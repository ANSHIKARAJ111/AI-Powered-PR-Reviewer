
import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";

async function main() {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("GITHUB_WEBHOOK_SECRET missing in .env");
  }

  const payload = JSON.stringify({
    zen: "CodePilot AI webhook test",
  });

  const signature = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  const response = await fetch(
    "http://127.0.0.1:5001/api/webhooks/github",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "ping",
        "X-GitHub-Delivery": randomUUID(),
        "X-Hub-Signature-256": signature,
      },
      body: payload,
    }
  );

  console.log("HTTP Status:", response.status);
  console.log("Response:", await response.text());
}

main().catch((error) => {
  console.error("Webhook test failed:", error.message);
  process.exitCode = 1;
});
