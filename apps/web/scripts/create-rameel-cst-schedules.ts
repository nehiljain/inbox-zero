#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
import { calculateNextScheduleDate } from "../utils/schedule";
import * as dotenv from "dotenv";
import path from "path";

// Load production environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.prod"), override: true });

console.log(`🌍 Environment: PRODUCTION (from .env.prod)`);

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL_PROD || process.env.DATABASE_URL;
console.log("🔗 Connecting to PRODUCTION database");

// Extract and display the database host domain
if (databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    console.log(`🌐 Database Host: ${url.hostname}`);
    console.log(`🔌 Database Port: ${url.port || '5432'}`);
    console.log(`📊 Database Name: ${url.pathname.substring(1)}`);
  } catch (error) {
    console.log(`❌ Could not parse database URL`);
  }
} else {
  console.log(`❌ No database URL found`);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

// Helper function to create canonical time of day
function createCanonicalTimeOfDay(hour24: number, minute: number): Date {
  const date = new Date('1970-01-01T00:00:00.000Z');
  date.setUTCHours(hour24, minute, 0, 0);
  return date;
}

// Function to convert CST hour to UTC hour
function cstToUtcHour(cstHour: number): number {
  // CST is UTC-6
  let utcHour = cstHour + 6;
  if (utcHour >= 24) {
    utcHour -= 24;
  }
  return utcHour;
}

async function createCSTSchedulesForRameel() {
  const userEmail = 'rameel@thebottleneck.io';
  const cstTimes = [8, 12, 17]; // 8am CST, 12pm CST, 5pm CST
  
  console.log(`🔍 Finding user: ${userEmail}`);
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

    for (const cstHour of cstTimes) {
      const utcHour = cstToUtcHour(cstHour);
      const timeOfDay = createCanonicalTimeOfDay(utcHour, 0); // 0 minutes for simplicity

      console.log(`\n⏰ Creating schedule for ${cstHour}:00 AM/PM CST (${utcHour}:00 UTC)`);

      const scheduleData = {
        emailAccountId: emailAccount.id,
        intervalDays: 1, // Daily
        occurrences: 1,
        daysOfWeek: null, // Every day
        timeOfDay: timeOfDay,
        lastOccurrenceAt: null,
        nextOccurrenceAt: null, // Will be calculated immediately
      };

      // Calculate next occurrence
      const nextOccurrence = calculateNextScheduleDate(scheduleData);

      if (!nextOccurrence) {
        console.error(`❌ Could not calculate next occurrence for ${cstHour}:00 CST`);
        continue;
      }

      scheduleData.nextOccurrenceAt = nextOccurrence;
      console.log(`🕐 Next occurrence: ${nextOccurrence.toISOString()}`);

      try {
        const newSchedule = await prisma.schedule.create({
          data: scheduleData,
        });
        console.log(`✅ Created schedule ${newSchedule.id} for ${cstHour}:00 CST`);
        console.log(`   Next digest: ${newSchedule.nextOccurrenceAt?.toISOString()}`);
      } catch (error: any) {
        if (error.code === 'P2002' && error.meta?.target?.includes('emailAccountId') && error.meta?.target?.includes('timeOfDay')) {
          console.warn(`⚠️  Schedule for ${cstHour}:00 CST already exists for this email account. Skipping.`);
        } else {
          console.error(`❌ Failed to create schedule for ${cstHour}:00 CST:`, error);
        }
      }
    }
  }

  console.log(`\n🎉 Completed creating CST schedules for user: ${userEmail}`);

  // Fetch and summarize all schedules for the user
  const allSchedules = await prisma.schedule.findMany({
    where: {
      emailAccount: {
        userId: user.id,
      },
    },
    include: {
      emailAccount: true,
    },
    orderBy: {
      timeOfDay: 'asc',
    },
  });

  console.log(`\n📋 Summary of all schedules:\n`);
  const groupedSchedules: Record<string, any[]> = {};
  for (const schedule of allSchedules) {
    const email = schedule.emailAccount.email;
    if (!groupedSchedules[email]) {
      groupedSchedules[email] = [];
    }
    groupedSchedules[email].push(schedule);
  }

  for (const email in groupedSchedules) {
    console.log(`📬 ${email}:`);
    for (const schedule of groupedSchedules[email]) {
      const timeOfDay = schedule.timeOfDay;
      const hour = timeOfDay?.getUTCHours() || 0;
      const minute = timeOfDay?.getUTCMinutes() || 0;
      const cstHour = (hour - 6 + 24) % 24; // Convert UTC to CST

      console.log(`   ${cstHour}:${minute.toString().padStart(2, '0')} CST (${hour}:${minute.toString().padStart(2, '0')} UTC) - Next: ${schedule.nextOccurrenceAt?.toISOString() || 'Not set'}`);
    }
  }
}

async function main() {
  try {
    await createCSTSchedulesForRameel();
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
