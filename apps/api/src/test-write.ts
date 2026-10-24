
import { prisma } from "./config/database.js";

async function main() {
  console.log("Starting database write test...");

  const user = await prisma.user.upsert({
    where: {
      githubId: "12345"
    },
    update: {
      username: "demo-user-updated"
    },
    create: {
      githubId: "12345",
      username: "demo-user-updated"
    }
  });

  console.log("Database write successful!");
  console.log("User ID:", user.id);
  console.log("Username:", user.username);
}

main()
  .catch((error) => {
    console.error("Database write failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
