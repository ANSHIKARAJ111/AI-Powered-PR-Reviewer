

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { App } from "@octokit/app";

async function main() {
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_INSTALLATION_ID;
  const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH;

  if (!appId || !installationId || !keyPath) {
    throw new Error("Missing GitHub App configuration");
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
  "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
  {
    owner: "ANSHIKARAJ111",
    repo: "IntelliTrust-FinGuard",
    pull_number: 1,
    per_page: 100,
  }
);

const files = response.data;

  console.log("PR #1 changed files:", files.length);

  for (const file of files) {
    console.log("\n------------------------");
    console.log("Filename:", file.filename);
    console.log("Status:", file.status);
    console.log("Additions:", file.additions);
    console.log("Deletions:", file.deletions);
    console.log("Code Diff:\n", file.patch ?? "Diff unavailable");
  }
}

main().catch((error) => {
  console.error("Failed to fetch PR diff:", error.message);
  process.exitCode = 1;
});
