#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";

// Support different environments
const environment = process.argv[2] || "local";
console.log(`🌍 Environment: ${environment}`);

// Use different database URLs based on environment
let databaseUrl: string;

if (environment === "production" || environment === "prod") {
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

async function searchUserSchedules(userEmail: string) {
  console.log(`🔍 Searching schedules for user: ${userEmail}`);
  
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

  let totalSchedules = 0;

  for (const emailAccount of user.emailAccounts) {
    console.log(`\n📬 Email account: ${emailAccount.email}`);
    
    // Find all schedules for this email account
    const schedules = await prisma.schedule.findMany({
      where: { emailAccountId: emailAccount.id },
      orderBy: { timeOfDay: 'asc' },
    });

    if (schedules.length === 0) {
      console.log(`   ⚠️  No digest schedules found`);
      continue;
    }

    console.log(`   📅 Found ${schedules.length} schedule(s):`);
    
    for (const schedule of schedules) {
      totalSchedules++;
      
      // Parse schedule details
      const timeOfDay = schedule.timeOfDay;
      const hour = timeOfDay?.getUTCHours() || 0;
      const minute = timeOfDay?.getUTCMinutes() || 0;
      const pstHour = (hour - 8 + 24) % 24; // Convert UTC back to PST
      
      // Parse days of week
      let daysDescription = "Every day";
      if (schedule.daysOfWeek) {
        const days = [];
        if (schedule.daysOfWeek & 0b0000001) days.push("Sunday");
        if (schedule.daysOfWeek & 0b0000010) days.push("Monday");
        if (schedule.daysOfWeek & 0b0000100) days.push("Tuesday");
        if (schedule.daysOfWeek & 0b0001000) days.push("Wednesday");
        if (schedule.daysOfWeek & 0b0010000) days.push("Thursday");
        if (schedule.daysOfWeek & 0b0100000) days.push("Friday");
        if (schedule.daysOfWeek & 0b1000000) days.push("Saturday");
        daysDescription = days.length > 0 ? days.join(", ") : "Every day";
      }

      console.log(`\n   📋 Schedule ID: ${schedule.id}`);
      console.log(`      ⏰ Time: ${pstHour}:${minute.toString().padStart(2, '0')} PST (${hour}:${minute.toString().padStart(2, '0')} UTC)`);
      console.log(`      📅 Days: ${daysDescription}`);
      console.log(`      🔄 Interval: Every ${schedule.intervalDays || 1} day(s)`);
      console.log(`      🔢 Occurrences: ${schedule.occurrences || 1} per interval`);
      console.log(`      📅 Created: ${schedule.createdAt.toISOString()}`);
      console.log(`      📅 Updated: ${schedule.updatedAt.toISOString()}`);
      console.log(`      ⏭️  Next digest: ${schedule.nextOccurrenceAt?.toISOString() || 'Not set'}`);
      console.log(`      ⏮️  Last digest: ${schedule.lastOccurrenceAt?.toISOString() || 'Never sent'}`);
      
      // Status indicator
      if (schedule.nextOccurrenceAt) {
        const now = new Date();
        const nextDigest = new Date(schedule.nextOccurrenceAt);
        if (nextDigest <= now) {
          console.log(`      🟡 Status: DUE NOW (overdue)`);
        } else {
          const hoursUntil = Math.round((nextDigest.getTime() - now.getTime()) / (1000 * 60 * 60));
          console.log(`      🟢 Status: Active (${hoursUntil}h until next digest)`);
        }
      } else {
        console.log(`      🔴 Status: INACTIVE (no next occurrence set)`);
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   👤 User: ${user.name} (${user.email})`);
  console.log(`   📧 Email accounts: ${user.emailAccounts.length}`);
  console.log(`   📅 Total schedules: ${totalSchedules}`);
  
  if (totalSchedules > 0) {
    console.log(`   ✅ User has active digest schedules`);
  } else {
    console.log(`   ⚠️  User has no digest schedules`);
  }
}

async function main() {
  const userEmail = process.argv[3];
  
  if (!userEmail) {
    console.error("❌ Please provide a user email as an argument");
    console.log("Usage: tsx scripts/search-user-schedules.ts [environment] <user-email>");
    console.log("Examples:");
    console.log("  Local:    tsx scripts/search-user-schedules.ts local jain.nehil@gmail.com");
    console.log("  Prod:     tsx scripts/search-user-schedules.ts production rameel@thebottleneck.io");
    console.log("  Prod:     tsx scripts/search-user-schedules.ts prod rameel@thebottleneck.io");
    process.exit(1);
  }

  try {
    await searchUserSchedules(userEmail);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
