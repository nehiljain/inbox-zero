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

async function cleanupPSTSchedules() {
  console.log(`🧹 Cleaning up PST schedules...`);
  
  // Get all schedules for Rameel
  const user = await prisma.user.findUnique({
    where: { email: 'rameel@thebottleneck.io' },
    include: {
      emailAccounts: true,
    },
  });

  if (!user) {
    console.error(`❌ User not found: rameel@thebottleneck.io`);
    return;
  }

  // Get all schedules for this user
  const allSchedules = await prisma.schedule.findMany({
    where: {
      emailAccount: {
        userId: user.id,
      },
    },
    include: {
      emailAccount: true,
    },
  });

  console.log(`✅ Found user: ${user.name} (${user.email})`);

  // Define the CST times we want to keep (8am, 12pm, 5pm CST)
  const keepCstTimes = [8, 12, 17]; // 8am, 12pm, 5pm CST
  const keepUtcTimes = keepCstTimes.map(cst => (cst + 6) % 24); // Convert to UTC

  let deletedCount = 0;
  let keptCount = 0;

  console.log(`\n📬 Processing ${allSchedules.length} schedules for ${user.email}`);
  
  for (const schedule of allSchedules) {
      const timeOfDay = schedule.timeOfDay;
      const utcHour = timeOfDay?.getUTCHours() || 0;
      const cstHour = utcToCstHour(utcHour);
      
      // Check if this is one of the schedules we want to keep
      const shouldKeep = keepUtcTimes.includes(utcHour);
      
      if (shouldKeep) {
        console.log(`✅ Keeping schedule ${schedule.id} - ${cstHour}:00 CST (${utcHour}:00 UTC)`);
        keptCount++;
      } else {
        console.log(`🗑️  Deleting schedule ${schedule.id} - ${cstHour}:00 CST (${utcHour}:00 UTC)`);
        
        try {
          await prisma.schedule.delete({
            where: { id: schedule.id },
          });
          deletedCount++;
          console.log(`   ✅ Deleted successfully`);
        } catch (error) {
          console.error(`   ❌ Failed to delete:`, error);
        }
      }
  }

  console.log(`\n🎉 Cleanup completed!`);
  console.log(`   🗑️  Deleted: ${deletedCount} schedules`);
  console.log(`   ✅ Kept: ${keptCount} schedules`);

  // Show final schedule summary
  const remainingSchedules = await prisma.schedule.findMany({
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

  console.log(`\n📋 Final schedule summary for Rameel:`);
  for (const schedule of remainingSchedules) {
    const timeOfDay = schedule.timeOfDay;
    const utcHour = timeOfDay?.getUTCHours() || 0;
    const cstHour = utcToCstHour(utcHour);
    const minute = timeOfDay?.getUTCMinutes() || 0;

    console.log(`   📅 ${cstHour}:${minute.toString().padStart(2, '0')} CST (${utcHour}:${minute.toString().padStart(2, '0')} UTC) - Next: ${schedule.nextOccurrenceAt?.toISOString() || 'Not set'}`);
  }
}

async function main() {
  try {
    await cleanupPSTSchedules();
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
