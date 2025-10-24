#!/usr/bin/env tsx

import { PrismaClient, ActionType, SystemType } from "@prisma/client";
import { createScopedLogger } from "../utils/logger";
import { createCanonicalTimeOfDay } from "../utils/schedule";

const prisma = new PrismaClient();
const logger = createScopedLogger("digest-migration");

// All categories that should have digest enabled
const ALL_DIGEST_CATEGORIES = [
  SystemType.TO_REPLY,
  SystemType.NEWSLETTER,
  SystemType.MARKETING,
  SystemType.CALENDAR,
  SystemType.RECEIPT,
  SystemType.NOTIFICATION,
] as const;

type MigrationResult = {
  userId: string;
  userEmail: string;
  status: "success" | "skipped" | "error";
  rulesUpdated: string[];
  scheduleCreated?: boolean;
  error?: string;
};

async function migrateUsersToDigestDefaults(dryRun = false): Promise<{
  totalUsers: number;
  migrated: number;
  skipped: number;
  errors: number;
  results: MigrationResult[];
}> {
  logger.info("Starting digest migration", { dryRun });

  // Find users who haven't been migrated yet
  // We migrate ALL users, not just those with system rules
  // Users without system rules will just get the flags set for future use
  const users = await prisma.emailAccount.findMany({
    where: {
      // digestMigrationCompleted: false, // Temporarily commented out due to Prisma type issues
      // Only migrate users who have system rules
      rules: {
        some: {
          systemType: {
            in: [...ALL_DIGEST_CATEGORIES],
          },
        },
      },
    },
    include: {
      rules: {
        include: { actions: true },
      },
    },
  });

  logger.info("Found users to migrate", { count: users.length });

  const results: MigrationResult[] = [];
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const result = await migrateUserDigestDefaults(
        {
          id: user.id,
          email: user.email,
          rules: user.rules.map((rule: any) => ({
            id: rule.id,
            name: rule.name,
            systemType: rule.systemType,
            actions: rule.actions.map((action: any) => ({ type: action.type })),
          })),
        },
        dryRun,
      );
      results.push(result);

      if (result.status === "success") migrated++;
      else if (result.status === "skipped") skipped++;
      else errors++;
    } catch (error) {
      logger.error("Failed to migrate user", {
        userId: user.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      results.push({
        userId: user.id,
        userEmail: user.email,
        status: "error",
        rulesUpdated: [],
        error: error instanceof Error ? error.message : "Unknown error",
      });
      errors++;
    }
  }

  const summary = {
    totalUsers: users.length,
    migrated,
    skipped,
    errors,
    results,
  };

  logger.info("Migration completed", summary);
  return summary;
}

async function migrateUserDigestDefaults(
  user: {
    id: string;
    email: string;
    rules: Array<{
      id: string;
      name: string;
      systemType: SystemType | null;
      actions: Array<{ type: ActionType }>;
    }>;
  },
  dryRun: boolean,
): Promise<MigrationResult> {
  const rulesUpdated: string[] = [];

  logger.info("Migrating user", {
    userId: user.id,
    userEmail: user.email,
    dryRun,
  });

  // Check each category
  for (const categoryType of ALL_DIGEST_CATEGORIES) {
    const rule = user.rules.find((r: any) => r.systemType === categoryType);

    if (!rule) {
      logger.info("Rule not found for user", {
        userId: user.id,
        categoryType,
      });
      continue;
    }

    // Check if digest is already enabled
    const hasDigest = rule.actions.some(
      (a: any) => a.type === ActionType.DIGEST,
    );

    if (hasDigest) {
      logger.info("Digest already enabled", {
        userId: user.id,
        ruleName: rule.name,
      });
      continue;
    }

    // Check if user has customized this rule significantly
    const hasCustomActions = rule.actions.some(
      (a) =>
        a.type !== ActionType.LABEL &&
        a.type !== ActionType.ARCHIVE &&
        a.type !== ActionType.MOVE_FOLDER,
    );

    if (hasCustomActions) {
      logger.info("Skipping user with custom actions", {
        userId: user.id,
        ruleName: rule.name,
        actions: rule.actions.map((a) => a.type),
      });
      continue; // Skip this rule but continue with other rules
    }

    if (!dryRun) {
      // Add digest action
      await prisma.action.create({
        data: {
          ruleId: rule.id,
          type: ActionType.DIGEST,
        },
      });
    }

    rulesUpdated.push(rule.name);
    logger.info("Added digest action", {
      userId: user.id,
      ruleName: rule.name,
      dryRun,
    });
  }

  // Always mark user as migrated and enable cold email digest
  // Even if they have no system rules, we set the defaults for future use
  let scheduleCreated = false;

  if (!dryRun) {
    await prisma.emailAccount.update({
      where: { id: user.id },
      data: {
        digestMigrationCompleted: true,
        // Also enable cold email digest by default
        coldEmailDigest: true,
      },
    });
    logger.info("Marked user as migrated", {
      userId: user.id,
      rulesUpdated: rulesUpdated.length,
      hasSystemRules: rulesUpdated.length > 0,
    });

    // Create default daily schedule at 9 AM UTC if user doesn't have one
    // Users can adjust timezone and add more schedules via UI
    const existingSchedule = await prisma.schedule.findFirst({
      where: { emailAccountId: user.id },
    });

    if (!existingSchedule) {
      try {
        await prisma.schedule.create({
          data: {
            emailAccountId: user.id,
            intervalDays: 1, // Daily
            occurrences: 1,
            daysOfWeek: null,
            timeOfDay: createCanonicalTimeOfDay(9, 0), // 9 AM UTC as default
            lastOccurrenceAt: null,
            nextOccurrenceAt: null, // Will be calculated by cron
          },
        });
        scheduleCreated = true;
        logger.info("Created default digest schedule", {
          userId: user.id,
          time: "9:00 AM UTC",
        });
      } catch (error) {
        logger.error("Failed to create schedule", {
          userId: user.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } else {
      logger.info("User already has schedule, skipping creation", {
        userId: user.id,
      });
    }
  }

  return {
    userId: user.id,
    userEmail: user.email,
    status: "success", // Always success - we set the default flags
    rulesUpdated,
    scheduleCreated,
  };
}

async function rollbackUserMigration(userId: string): Promise<void> {
  logger.info("Rolling back migration for user", { userId });

  const user = await prisma.emailAccount.findUnique({
    where: { id: userId },
    include: {
      rules: {
        include: { actions: true },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Remove digest actions for all categories
  for (const categoryType of ALL_DIGEST_CATEGORIES) {
    const rule = user.rules.find((r) => r.systemType === categoryType);

    if (rule) {
      await prisma.action.deleteMany({
        where: {
          ruleId: rule.id,
          type: ActionType.DIGEST,
        },
      });
    }
  }

  // Mark user as not migrated and disable cold email digest
  await prisma.emailAccount.update({
    where: { id: userId },
    data: {
      digestMigrationCompleted: false,
      coldEmailDigest: false,
    },
  });

  logger.info("Rollback completed", { userId });
}

async function getMigrationStatus(): Promise<{
  totalUsers: number;
  migratedUsers: number;
  pendingUsers: number;
  migrationProgress: number;
}> {
  const totalUsers = await prisma.emailAccount.count();
  const migratedUsers = await prisma.emailAccount.count({
    where: { digestMigrationCompleted: true },
  });

  const pendingUsers = totalUsers - migratedUsers;
  const migrationProgress =
    totalUsers > 0 ? (migratedUsers / totalUsers) * 100 : 0;

  return {
    totalUsers,
    migratedUsers,
    pendingUsers,
    migrationProgress,
  };
}

async function verifyScheduleState() {
  const users = await prisma.emailAccount.findMany({
    where: { digestMigrationCompleted: true },
    include: {
      digestSchedules: true,
      rules: {
        where: {
          actions: {
            some: { type: ActionType.DIGEST },
          },
        },
      },
    },
  });

  return {
    totalMigratedUsers: users.length,
    usersWithSchedules: users.filter((u) => u.digestSchedules.length > 0)
      .length,
    usersWithoutSchedules: users.filter((u) => u.digestSchedules.length === 0)
      .length,
    usersWithMultipleSchedules: users.filter(
      (u) => u.digestSchedules.length > 1,
    ).length,
    details: users.map((u) => ({
      email: u.email,
      scheduleCount: u.digestSchedules.length,
      digestRules: u.rules.length,
    })),
  };
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const dryRun = args.includes("--dry-run");

  try {
    switch (command) {
      case "migrate": {
        const result = await migrateUsersToDigestDefaults(dryRun);
        console.log("Migration Results:", JSON.stringify(result, null, 2));
        break;
      }

      case "status": {
        const status = await getMigrationStatus();
        console.log("Migration Status:", JSON.stringify(status, null, 2));
        break;
      }

      case "rollback": {
        const userId = args[1];
        if (!userId) {
          console.error("Usage: rollback <userId>");
          process.exit(1);
        }
        await rollbackUserMigration(userId);
        console.log("Rollback completed for user:", userId);
        break;
      }

      case "verify-schedules": {
        const verifyResult = await verifyScheduleState();
        console.log(
          "Schedule Verification:",
          JSON.stringify(verifyResult, null, 2),
        );
        break;
      }

      default:
        console.log(`
Usage: tsx migrate-digest-defaults.ts <command> [options]

Commands:
  migrate [--dry-run]    Run migration (use --dry-run to test)
  status                 Show migration status
  verify-schedules       Verify schedule creation state
  rollback <userId>      Rollback migration for specific user

Examples:
  tsx migrate-digest-defaults.ts migrate --dry-run
  tsx migrate-digest-defaults.ts migrate
  tsx migrate-digest-defaults.ts status
  tsx migrate-digest-defaults.ts verify-schedules
  tsx migrate-digest-defaults.ts rollback user123
        `);
    }
  } catch (error) {
    logger.error("Migration failed", { error });
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export {
  migrateUsersToDigestDefaults,
  rollbackUserMigration,
  getMigrationStatus,
};
