#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
import { calculateNextScheduleDate } from "../utils/schedule";

// Support different environments
const environment = process.argv[3] || "local";
console.log(`🌍 Environment: ${environment}`);

// Use different database URLs based on environment
let databaseUrl: string;

if (environment === "production" || environment === "prod") {
  // For production, you'll need to set DATABASE_URL_PROD in your .env
  databaseUrl = process.env.DATABASE_URL_PROD || process.env.DATABASE_URL;
  console.log("🔗 Connecting to PRODUCTION database");
} else {
  databaseUrl = process.env.DATABASE_URL;
  console.log("🔗 Connecting to LOCAL database");
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

async function setupNextOccurrenceForUser(userEmail: string) {
  console.log(`🔍 Finding schedules for user: ${userEmail}`);
  
  // Find the user first
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    include: {
      emailAccounts: true,
    },
  });

  if (!user) {
    console.error(`❌ User not found: ${userEmail}`);
    return;
  }

  console.log(`✅ Found user: ${user.name} (${user.email})`);
  console.log(`📧 Email accounts: ${user.emailAccounts.length}`);

  for (const emailAccount of user.emailAccounts) {
    console.log(`\n📬 Processing email account: ${emailAccount.email}`);
    
    // Find schedules for this email account
    const schedules = await prisma.schedule.findMany({
      where: { emailAccountId: emailAccount.id },
    });

    if (schedules.length === 0) {
      console.log(`⚠️  No digest schedules found for ${emailAccount.email}`);
      continue;
    }

    for (const schedule of schedules) {
      console.log(`\n📅 Schedule ID: ${schedule.id}`);
      console.log(`   Interval Days: ${schedule.intervalDays}`);
      console.log(`   Days of Week: ${schedule.daysOfWeek}`);
      console.log(`   Time of Day: ${schedule.timeOfDay}`);
      console.log(`   Current nextOccurrenceAt: ${schedule.nextOccurrenceAt}`);
      console.log(`   Current lastOccurrenceAt: ${schedule.lastOccurrenceAt}`);

      // Calculate next occurrence using the application logic
      const nextOccurrence = calculateNextScheduleDate({
        intervalDays: schedule.intervalDays,
        daysOfWeek: schedule.daysOfWeek,
        timeOfDay: schedule.timeOfDay,
        occurrences: schedule.occurrences,
        lastOccurrenceAt: schedule.lastOccurrenceAt,
      });

      if (!nextOccurrence) {
        console.log(`❌ Could not calculate next occurrence for schedule ${schedule.id}`);
        continue;
      }

      console.log(`🕐 Calculated next occurrence: ${nextOccurrence.toISOString()}`);

      // Update the schedule
      const updatedSchedule = await prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          nextOccurrenceAt: nextOccurrence,
        },
      });

      console.log(`✅ Updated schedule ${schedule.id}`);
      console.log(`   New nextOccurrenceAt: ${updatedSchedule.nextOccurrenceAt?.toISOString()}`);
    }
  }

  console.log(`\n🎉 Completed setup for user: ${userEmail}`);
}

async function main() {
  const userEmail = process.argv[2];
  
  if (!userEmail) {
    console.error("❌ Please provide a user email as an argument");
    console.log("Usage: tsx scripts/setup-next-occurrence.ts <user-email> [environment]");
    console.log("Examples:");
    console.log("  Local:    tsx scripts/setup-next-occurrence.ts jain.nehil@gmail.com");
    console.log("  Local:    tsx scripts/setup-next-occurrence.ts jain.nehil@gmail.com local");
    console.log("  Prod:     tsx scripts/setup-next-occurrence.ts jain.nehil@gmail.com production");
    console.log("  Prod:     tsx scripts/setup-next-occurrence.ts jain.nehil@gmail.com prod");
    process.exit(1);
  }

  try {
    await setupNextOccurrenceForUser(userEmail);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
