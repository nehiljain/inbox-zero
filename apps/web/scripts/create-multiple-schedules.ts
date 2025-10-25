#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
import { calculateNextScheduleDate } from "../utils/schedule";
import * as dotenv from "dotenv";
import path from "path";

// Support different environments
const environment = process.argv[2] || "local";
console.log(`🌍 Environment: ${environment}`);

// Load environment variables from .env.prod for production
if (environment === "production" || environment === "prod") {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.prod"), override: true });
  console.log("🔗 Loading production environment from .env.prod");
}

// Use different database URLs based on environment
let databaseUrl: string;

if (environment === "production" || environment === "prod") {
  databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL_PROD || process.env.DATABASE_URL;
  console.log("🔗 Connecting to PRODUCTION database");
} else {
  databaseUrl = process.env.DATABASE_URL;
  console.log("🔗 Connecting to LOCAL database");
}

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
  const canonicalDate = new Date("1970-01-01T00:00:00Z");
  canonicalDate.setUTCHours(hour24, minute, 0, 0);
  return canonicalDate;
}

// Helper function to convert PST to UTC
function pstToUtc(pstHour: number): number {
  // PST is UTC-8, so add 8 hours to convert PST to UTC
  return (pstHour + 8) % 24;
}

async function createMultipleSchedulesForUser(userEmail: string) {
  console.log(`🔍 Finding user: ${userEmail}`);
  
  // Find the user and their email accounts
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

  // PST times requested: 11am, 8am, 9am, 1pm, 5pm
  const pstTimes = [
    { hour: 11, minute: 0, label: "11:00 AM PST" },
    { hour: 8, minute: 0, label: "8:00 AM PST" },
    { hour: 9, minute: 0, label: "9:00 AM PST" },
    { hour: 13, minute: 0, label: "1:00 PM PST" },
    { hour: 17, minute: 0, label: "5:00 PM PST" },
  ];

  for (const emailAccount of user.emailAccounts) {
    console.log(`\n📬 Processing email account: ${emailAccount.email}`);
    
    for (const time of pstTimes) {
      const utcHour = pstToUtc(time.hour);
      const timeOfDay = createCanonicalTimeOfDay(utcHour, time.minute);
      
      console.log(`\n⏰ Creating schedule for ${time.label} (${utcHour}:${time.minute.toString().padStart(2, '0')} UTC)`);
      
      // Calculate next occurrence
      const nextOccurrence = calculateNextScheduleDate({
        intervalDays: 1, // Daily
        daysOfWeek: null, // Every day
        timeOfDay: timeOfDay,
        occurrences: 1,
        lastOccurrenceAt: null,
      });

      if (!nextOccurrence) {
        console.log(`❌ Could not calculate next occurrence for ${time.label}`);
        continue;
      }

      console.log(`🕐 Next occurrence: ${nextOccurrence.toISOString()}`);

      try {
        // Create the schedule
        const schedule = await prisma.schedule.create({
          data: {
            emailAccountId: emailAccount.id,
            intervalDays: 1, // Daily
            occurrences: 1,
            daysOfWeek: null, // Every day
            timeOfDay: timeOfDay,
            lastOccurrenceAt: null,
            nextOccurrenceAt: nextOccurrence,
          },
        });

        console.log(`✅ Created schedule ${schedule.id} for ${time.label}`);
        console.log(`   Next digest: ${schedule.nextOccurrenceAt?.toISOString()}`);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('Unique constraint')) {
          console.log(`⚠️  Schedule already exists for ${time.label}, skipping...`);
        } else {
          console.error(`❌ Error creating schedule for ${time.label}:`, error);
        }
      }
    }
  }

  console.log(`\n🎉 Completed creating schedules for user: ${userEmail}`);
  
  // Show summary of all schedules
  console.log(`\n📋 Summary of all schedules:`);
  for (const emailAccount of user.emailAccounts) {
    const schedules = await prisma.schedule.findMany({
      where: { emailAccountId: emailAccount.id },
      orderBy: { timeOfDay: 'asc' },
    });
    
    console.log(`\n📬 ${emailAccount.email}:`);
    for (const schedule of schedules) {
      const timeOfDay = schedule.timeOfDay;
      const hour = timeOfDay?.getUTCHours() || 0;
      const minute = timeOfDay?.getUTCMinutes() || 0;
      const pstHour = (hour - 8 + 24) % 24; // Convert UTC back to PST
      
      console.log(`   ${pstHour}:${minute.toString().padStart(2, '0')} PST (${hour}:${minute.toString().padStart(2, '0')} UTC) - Next: ${schedule.nextOccurrenceAt?.toISOString()}`);
    }
  }
}

async function main() {
  const userEmail = process.argv[3];
  
  if (!userEmail) {
    console.error("❌ Please provide a user email as an argument");
    console.log("Usage: tsx scripts/create-multiple-schedules.ts [environment] <user-email>");
    console.log("Examples:");
    console.log("  Local:    tsx scripts/create-multiple-schedules.ts local jain.nehil@gmail.com");
    console.log("  Prod:     tsx scripts/create-multiple-schedules.ts production jain.nehil@gmail.com");
    console.log("  Prod:     tsx scripts/create-multiple-schedules.ts prod jain.nehil@gmail.com");
    process.exit(1);
  }

  try {
    await createMultipleSchedulesForUser(userEmail);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
