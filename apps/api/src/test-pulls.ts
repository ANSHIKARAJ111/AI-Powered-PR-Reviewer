
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

  const owner = "ANSHIKARAJ111";
  const repo = "IntelliTrust-FinGuard";

  // Get open and closed pull requests
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls",
    {
      owner,
      repo,
      state: "all",
      per_page: 30,
    }
  );

  console.log("GitHub repository connected!");
  console.log("Total pull requests fetched:", response.data.length);

  for (const pr of response.data) {
    console.log("--------------------------");
    console.log("PR Number:", pr.number);
    console.log("Title:", pr.title);
    console.log("State:", pr.state);
    console.log("URL:", pr.html_url);
  }

  if (response.data.length === 0) {
    console.log(
      "No pull requests found. Create a test PR to continue."
    );
  }
}

main().catch((error) => {
  console.error("GitHub PR fetch failed:", error.message);
  process.exitCode = 1;
});
