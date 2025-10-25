#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
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

// Function to convert UTC hour to CST hour
function utcToCstHour(utcHour: number): number {
  // CST is UTC-6
  let cstHour = utcHour - 6;
  if (cstHour < 0) {
    cstHour += 24;
  }
  return cstHour;
}

async function ensureAllDigestsAreDaily() {
  console.log(`🔍 Checking all user digest schedules...`);
  
  // Get all schedules
  const allSchedules = await prisma.schedule.findMany({
    include: {
      emailAccount: {
        include: {
          user: true,
        },
      },
    },
    orderBy: {
      timeOfDay: 'asc',
    },
  });

  console.log(`📊 Found ${allSchedules.length} total schedules`);

  let updatedCount = 0;
  let alreadyDailyCount = 0;

  for (const schedule of allSchedules) {
    const user = schedule.emailAccount.user;
    const timeOfDay = schedule.timeOfDay;
    const utcHour = timeOfDay?.getUTCHours() || 0;
    const utcMinute = timeOfDay?.getUTCMinutes() || 0;
    const cstHour = utcToCstHour(utcHour);

    // Check if schedule is already daily
    const isDaily = schedule.intervalDays === 1 && schedule.daysOfWeek === null;
    
    if (isDaily) {
      console.log(`✅ ${user.name} (${user.email}) - ${cstHour}:${utcMinute.toString().padStart(2, '0')} CST - Already daily`);
      alreadyDailyCount++;
    } else {
      console.log(`🔄 ${user.name} (${user.email}) - ${cstHour}:${utcMinute.toString().padStart(2, '0')} CST - Updating to daily`);
      
      try {
        await prisma.schedule.update({
          where: { id: schedule.id },
          data: {
            intervalDays: 1, // Daily
            daysOfWeek: null, // Every day (not specific days)
          },
        });
        updatedCount++;
        console.log(`   ✅ Updated successfully`);
      } catch (error) {
        console.error(`   ❌ Failed to update:`, error);
      }
    }
  }

  console.log(`\n🎉 Daily digest setup completed!`);
  console.log(`   ✅ Already daily: ${alreadyDailyCount} schedules`);
  console.log(`   🔄 Updated to daily: ${updatedCount} schedules`);

  // Show final summary
  const finalSchedules = await prisma.schedule.findMany({
    include: {
      emailAccount: {
        include: {
          user: true,
        },
      },
    },
    orderBy: {
      timeOfDay: 'asc',
    },
  });

  console.log(`\n📋 Final daily digest summary:`);
  const groupedSchedules: Record<string, any[]> = {};
  for (const schedule of finalSchedules) {
    const userEmail = schedule.emailAccount.user.email;
    if (!groupedSchedules[userEmail]) {
      groupedSchedules[userEmail] = [];
    }
    groupedSchedules[userEmail].push(schedule);
  }

  for (const userEmail in groupedSchedules) {
    const schedules = groupedSchedules[userEmail];
    const user = schedules[0].emailAccount.user;
    console.log(`\n👤 ${user.name} (${userEmail}):`);
    
    for (const schedule of schedules) {
      const timeOfDay = schedule.timeOfDay;
      const utcHour = timeOfDay?.getUTCHours() || 0;
      const utcMinute = timeOfDay?.getUTCMinutes() || 0;
      const cstHour = utcToCstHour(utcHour);
      
      const isDaily = schedule.intervalDays === 1 && schedule.daysOfWeek === null;
      const status = isDaily ? '✅ Daily' : '❌ Not daily';
      
      console.log(`   📅 ${cstHour}:${utcMinute.toString().padStart(2, '0')} CST (${utcHour}:${utcMinute.toString().padStart(2, '0')} UTC) - ${status}`);
      console.log(`      Next: ${schedule.nextOccurrenceAt?.toISOString() || 'Not set'}`);
    }
  }
}

async function main() {
  try {
    await ensureAllDigestsAreDaily();
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
