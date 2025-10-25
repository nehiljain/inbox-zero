#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import path from "path";

// Load production environment variables
config({ path: path.join(__dirname, '.env.prod') });

console.log(`🌍 Environment: PRODUCTION (from .env.prod)`);
console.log(`🔗 Database URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function readUserSchedules(userEmail: string) {
  console.log(`🔍 Reading schedules for user: ${userEmail}`);
  
  try {
    // Find the user
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

    console.log(`\n✅ Found user:`);
    console.log(`   👤 Name: ${user.name}`);
    console.log(`   📧 Email: ${user.email}`);
    console.log(`   🆔 ID: ${user.id}`);
    console.log(`   📅 Created: ${user.createdAt.toISOString()}`);
    console.log(`   🔄 Updated: ${user.updatedAt.toISOString()}`);
    console.log(`   🔐 Last Login: ${user.lastLogin?.toISOString() || 'Never'}`);
    console.log(`   ✅ Onboarding Completed: ${user.completedOnboardingAt?.toISOString() || 'Not completed'}`);
    console.log(`   📱 App Onboarding: ${user.completedAppOnboardingAt?.toISOString() || 'Not completed'}`);

    console.log(`\n📧 Email Accounts: ${user.emailAccounts.length}`);
    
    let totalSchedules = 0;
    let activeSchedules = 0;
    let inactiveSchedules = 0;

    for (const emailAccount of user.emailAccounts) {
      console.log(`\n📬 Email Account: ${emailAccount.email}`);
      console.log(`   🆔 ID: ${emailAccount.id}`);
      console.log(`   📅 Created: ${emailAccount.createdAt.toISOString()}`);
      console.log(`   🔄 Updated: ${emailAccount.updatedAt.toISOString()}`);
      console.log(`   📊 Stats Email Frequency: ${emailAccount.statsEmailFrequency}`);
      console.log(`   📊 Summary Email Frequency: ${emailAccount.summaryEmailFrequency}`);
      console.log(`   📊 Last Summary Email: ${emailAccount.lastSummaryEmailAt?.toISOString() || 'Never'}`);
      console.log(`   🧊 Cold Email Digest: ${emailAccount.coldEmailDigest}`);
      console.log(`   🔄 Auto Categorize Senders: ${emailAccount.autoCategorizeSenders}`);
      console.log(`   📧 Outbound Reply Tracking: ${emailAccount.outboundReplyTracking}`);
      console.log(`   ✅ Digest Migration Completed: ${emailAccount.digestMigrationCompleted}`);
      
      // Find schedules for this email account
      const schedules = await prisma.schedule.findMany({
        where: { emailAccountId: emailAccount.id },
        orderBy: { timeOfDay: 'asc' },
      });

      console.log(`\n   📅 Digest Schedules: ${schedules.length}`);

      if (schedules.length === 0) {
        console.log(`   ⚠️  No digest schedules found for this email account`);
        continue;
      }

      for (const schedule of schedules) {
        totalSchedules++;
        
        const timeOfDay = schedule.timeOfDay;
        const hour = timeOfDay?.getUTCHours() || 0;
        const minute = timeOfDay?.getUTCMinutes() || 0;
        const pstHour = (hour - 8 + 24) % 24; // Convert UTC to PST
        
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
        console.log(`      🔄 Updated: ${schedule.updatedAt.toISOString()}`);
        console.log(`      ⏭️  Next digest: ${schedule.nextOccurrenceAt?.toISOString() || 'Not set'}`);
        console.log(`      ⏮️  Last digest: ${schedule.lastOccurrenceAt?.toISOString() || 'Never sent'}`);
        
        // Status indicator
        if (schedule.nextOccurrenceAt) {
          activeSchedules++;
          const now = new Date();
          const nextDigest = new Date(schedule.nextOccurrenceAt);
          if (nextDigest <= now) {
            console.log(`      🟡 Status: DUE NOW (overdue)`);
          } else {
            const hoursUntil = Math.round((nextDigest.getTime() - now.getTime()) / (1000 * 60 * 60));
            console.log(`      🟢 Status: ACTIVE (${hoursUntil}h until next digest)`);
          }
        } else {
          inactiveSchedules++;
          console.log(`      🔴 Status: INACTIVE (no next occurrence set)`);
        }
      }
    }

    console.log(`\n📊 SUMMARY:`);
    console.log(`   👤 User: ${user.name} (${user.email})`);
    console.log(`   📧 Email accounts: ${user.emailAccounts.length}`);
    console.log(`   📅 Total schedules: ${totalSchedules}`);
    console.log(`   🟢 Active schedules: ${activeSchedules}`);
    console.log(`   🔴 Inactive schedules: ${inactiveSchedules}`);
    
    if (totalSchedules === 0) {
      console.log(`\n⚠️  This user has no digest schedules configured.`);
      console.log(`   This might be because:`);
      console.log(`   - User hasn't completed onboarding`);
      console.log(`   - User hasn't set up digest preferences`);
      console.log(`   - Default schedules weren't created`);
    }

  } catch (error) {
    console.error(`❌ Error reading user schedules:`, error);
  }
}

async function main() {
  const userEmail = process.argv[2];
  
  if (!userEmail) {
    console.error("❌ Please provide a user email as an argument");
    console.log("Usage: tsx scripts/read-user-schedules-prod.ts <user-email>");
    console.log("Examples:");
    console.log("  tsx scripts/read-user-schedules-prod.ts jain.nehil@gmail.com");
    console.log("  tsx scripts/read-user-schedules-prod.ts rameel@thebottleneck.io");
    process.exit(1);
  }

  try {
    await readUserSchedules(userEmail);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
