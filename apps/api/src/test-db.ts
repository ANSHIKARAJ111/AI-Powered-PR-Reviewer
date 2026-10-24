
import { prisma } from "./config/database.js";

async function main() {
  const count = await prisma.user.count();

  console.log("PostgreSQL connected successfully!");
  console.log("Total users:", count);
}

main()
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
