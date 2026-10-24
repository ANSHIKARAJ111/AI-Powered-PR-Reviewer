-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "githubLockToken" TEXT,
ADD COLUMN     "githubLockedAt" TIMESTAMP(3);
