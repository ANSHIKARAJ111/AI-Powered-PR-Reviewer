
import { prisma } from "../config/database.js";
import { runAIReview } from "./reviewService.js";

export async function recoverPendingReviews() {
  console.log(
    "[Recovery] Checking pending GitHub reviews..."
  );

  const pendingReviews = await prisma.review.findMany({
    where: {
      status: "COMPLETED",
      githubPostedAt: null,
      commitSha: {
        not: null,
      },
    },
    include: {
      pullRequest: true,
    },
    orderBy: {
      createdAt: "asc",
    },
    take: 20,
  });

  if (pendingReviews.length === 0) {
    console.log(
      "[Recovery] No pending reviews found."
    );
    return;
  }

  console.log(
    `[Recovery] Found ${pendingReviews.length} pending reviews.`
  );

  for (const review of pendingReviews) {
    try {
      console.log(
        `[Recovery] Recovering PR #${review.pullRequest.number}`
      );

      await runAIReview(
        review.pullRequest.number
      );

      console.log(
        `[Recovery] Processed PR #${review.pullRequest.number}`
      );
    } catch (error) {
      console.error(
        `[Recovery] Failed for PR #${review.pullRequest.number}:`,
        error
      );
    }
  }
}
