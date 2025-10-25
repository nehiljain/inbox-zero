#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import path from "path";

// Load production environment variables
config({ path: path.join(__dirname, '..', '.env.prod'), override: true });

console.log(`🌍 Environment: PRODUCTION (from .env.prod)`);
console.log(`🔗 Using DIRECT_URL: ${process.env.DIRECT_URL ? 'SET' : 'NOT SET'}`);

// Extract and display the database host domain
if (process.env.DIRECT_URL) {
  try {
    const url = new URL(process.env.DIRECT_URL);
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
      url: process.env.DIRECT_URL,
    },
  },
});

async function connectAndListUsers() {
  console.log(`🔍 Connecting to database...`);
  
  try {
    // Test connection
    await prisma.$connect();
    console.log(`✅ Database connection successful!`);
    
    // Get user count
    const userCount = await prisma.user.count();
    console.log(`📊 Found ${userCount} users in database`);
    
    // Get all users with detailed info
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
        completedOnboardingAt: true,
        completedAppOnboardingAt: true,
        emailAccounts: {
          select: {
            id: true,
            email: true,
            createdAt: true,
            coldEmailDigest: true,
            statsEmailFrequency: true,
            summaryEmailFrequency: true,
            lastSummaryEmailAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    console.log(`\n📋 ALL USERS IN DATABASE:`);
    console.log(`\n${'ID'.padEnd(25)} ${'Name'.padEnd(20)} ${'Email'.padEnd(35)} ${'Created'.padEnd(20)} ${'Onboarding'.padEnd(12)} ${'Accounts'.padEnd(8)} ${'Last Login'}`);
    console.log(`${'-'.repeat(140)}`);

    for (const user of allUsers) {
      const id = user.id.substring(0, 24);
      const name = (user.name || 'No name').substring(0, 19);
      const email = user.email.substring(0, 34);
      const created = user.createdAt.toISOString().split('T')[0];
      const onboarding = user.completedOnboardingAt ? '✅' : '❌';
      const accountCount = user.emailAccounts.length;
      const lastLogin = user.lastLogin ? user.lastLogin.toISOString().split('T')[0] : 'Never';
      
      console.log(`${id.padEnd(25)} ${name.padEnd(20)} ${email.padEnd(35)} ${created.padEnd(20)} ${onboarding.padEnd(12)} ${accountCount.toString().padEnd(8)} ${lastLogin}`);
      
      // Show email account details
      if (user.emailAccounts.length > 0) {
        for (const emailAccount of user.emailAccounts) {
          console.log(`   📧 ${emailAccount.email}`);
          console.log(`      🆔 ID: ${emailAccount.id}`);
          console.log(`      📅 Created: ${emailAccount.createdAt.toISOString()}`);
          console.log(`      🧊 Cold Email Digest: ${emailAccount.coldEmailDigest}`);
          console.log(`      📊 Stats Frequency: ${emailAccount.statsEmailFrequency}`);
          console.log(`      📊 Summary Frequency: ${emailAccount.summaryEmailFrequency}`);
          console.log(`      📊 Last Summary: ${emailAccount.lastSummaryEmailAt?.toISOString() || 'Never'}`);
        }
      }
    }

    // Get all schedules
    console.log(`\n📅 ALL DIGEST SCHEDULES:`);
    const allSchedules = await prisma.schedule.findMany({
      include: {
        emailAccount: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { timeOfDay: 'asc' },
    });

    if (allSchedules.length === 0) {
      console.log(`   ⚠️  No digest schedules found in database`);
    } else {
      console.log(`   📊 Found ${allSchedules.length} schedule(s):`);
      
      for (const schedule of allSchedules) {
        const timeOfDay = schedule.timeOfDay;
        const hour = timeOfDay?.getUTCHours() || 0;
        const minute = timeOfDay?.getUTCMinutes() || 0;
        const pstHour = (hour - 8 + 24) % 24;
        
        console.log(`\n   📋 Schedule ID: ${schedule.id}`);
        console.log(`      👤 User: ${schedule.emailAccount.user.name} (${schedule.emailAccount.user.email})`);
        console.log(`      📧 Email Account: ${schedule.emailAccount.email}`);
        console.log(`      ⏰ Time: ${pstHour}:${minute.toString().padStart(2, '0')} PST (${hour}:${minute.toString().padStart(2, '0')} UTC)`);
        console.log(`      🔄 Interval: Every ${schedule.intervalDays || 1} day(s)`);
        console.log(`      📅 Days of Week: ${schedule.daysOfWeek || 'Every day'}`);
        console.log(`      ⏭️  Next digest: ${schedule.nextOccurrenceAt?.toISOString() || 'Not set'}`);
        console.log(`      ⏮️  Last digest: ${schedule.lastOccurrenceAt?.toISOString() || 'Never sent'}`);
        
        // Status
        if (schedule.nextOccurrenceAt) {
          const now = new Date();
          const nextDigest = new Date(schedule.nextOccurrenceAt);
          if (nextDigest <= now) {
            console.log(`      🟡 Status: DUE NOW`);
          } else {
            console.log(`      🟢 Status: ACTIVE`);
          }
        } else {
          console.log(`      🔴 Status: INACTIVE`);
        }
      }
    }

    // Search for specific user ID
    console.log(`\n🔍 Searching for specific user ID: cmgha4fk70001l804zxjv4scy`);
    const specificUser = await prisma.user.findUnique({
      where: { id: 'cmgha4fk70001l804zxjv4scy' },
    });
    
    if (specificUser) {
      console.log(`✅ Found user with ID cmgha4fk70001l804zxjv4scy:`);
      console.log(`   👤 Name: ${specificUser.name}`);
      console.log(`   📧 Email: ${specificUser.email}`);
      console.log(`   📅 Created: ${specificUser.createdAt.toISOString()}`);
    } else {
      console.log(`❌ User with ID cmgha4fk70001l804zxjv4scy NOT FOUND in this database`);
    }

    // Search for Rameel by email
    console.log(`\n🔍 Searching for Rameel by email: rameel@thebottleneck.io`);
    const rameelByEmail = await prisma.user.findUnique({
      where: { email: 'rameel@thebottleneck.io' },
    });
    
    if (rameelByEmail) {
      console.log(`✅ Found Rameel by email:`);
      console.log(`   👤 Name: ${rameelByEmail.name}`);
      console.log(`   📧 Email: ${rameelByEmail.email}`);
      console.log(`   🆔 ID: ${rameelByEmail.id}`);
    } else {
      console.log(`❌ Rameel with email rameel@thebottleneck.io NOT FOUND in this database`);
    }

    console.log(`\n🎉 Database connection and query completed successfully!`);
    
  } catch (error) {
    console.error(`❌ Database connection failed:`, error);
  }
}

async function main() {
  try {
    await connectAndListUsers();
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
