
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { App } from "@octokit/app";

async function main() {
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_INSTALLATION_ID;
  const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH;

  if (!appId || !installationId || !keyPath) {
    throw new Error("GitHub App environment variables missing");
  }

  const privateKey = readFileSync(
    resolve(process.cwd(), keyPath),
    "utf8"
  );

  const githubApp = new App({
    appId,
    privateKey,
  });

  const octokit = await githubApp.getInstallationOctokit(
    Number(installationId)
  );

  const response = await octokit.request(
    "GET /installation/repositories",
    { per_page: 100 }
  );

  console.log("GitHub App connected successfully!");
  console.log("Total repositories:", response.data.total_count);

  for (const repo of response.data.repositories) {
    console.log("Repository:", repo.full_name);
  }
}

main().catch((error) => {
  console.error("GitHub connection failed:", error.message);
  process.exitCode = 1;
});
