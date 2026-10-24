/*
  Warnings:

  - A unique constraint covering the columns `[pullRequestId,commitSha]` on the table `Review` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "commitSha" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Review_pullRequestId_commitSha_key" ON "Review"("pullRequestId", "commitSha");
