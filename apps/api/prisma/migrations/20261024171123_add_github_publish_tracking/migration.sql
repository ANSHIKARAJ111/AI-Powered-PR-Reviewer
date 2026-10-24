-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "githubPostAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "githubPostError" TEXT,
ADD COLUMN     "githubPostedAt" TIMESTAMP(3),
ADD COLUMN     "githubReviewId" TEXT;
