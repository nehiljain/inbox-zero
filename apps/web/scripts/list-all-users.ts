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

async function listAllUsers() {
  console.log(`🔍 Listing all users in database...`);
  
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      emailAccounts: {
        select: {
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`\n📊 Found ${users.length} total users:`);
  console.log(`\n${'Name'.padEnd(20)} ${'Email'.padEnd(35)} ${'Created'.padEnd(20)} ${'Accounts'}`);
  console.log(`${'-'.repeat(80)}`);

  for (const user of users) {
    const name = (user.name || 'No name').substring(0, 19);
    const email = user.email.substring(0, 34);
    const created = user.createdAt.toISOString().split('T')[0];
    const accountCount = user.emailAccounts.length;
    
    console.log(`${name.padEnd(20)} ${email.padEnd(35)} ${created.padEnd(20)} ${accountCount}`);
  }

  // Show users with digest schedules
  console.log(`\n🔍 Users with digest schedules:`);
  
  // Get all schedules first
  const allSchedules = await prisma.schedule.findMany({
    include: {
      emailAccount: {
        include: {
          user: true,
        },
      },
    },
  });

  if (allSchedules.length === 0) {
    console.log(`   ⚠️  No digest schedules found in database`);
  } else {
    // Group schedules by user
    const userSchedules: Record<string, any[]> = {};
    
    for (const schedule of allSchedules) {
      const userId = schedule.emailAccount.user.id;
      if (!userSchedules[userId]) {
        userSchedules[userId] = [];
      }
      userSchedules[userId].push(schedule);
    }
    
    console.log(`   ✅ Found ${Object.keys(userSchedules).length} user(s) with digest schedules:`);
    
    for (const [userId, schedules] of Object.entries(userSchedules)) {
      const user = schedules[0].emailAccount.user;
      
      console.log(`\n   👤 ${user.name} (${user.email})`);
      console.log(`      📅 Total schedules: ${schedules.length}`);
      
      for (const schedule of schedules) {
        const timeOfDay = schedule.timeOfDay;
        const hour = timeOfDay?.getUTCHours() || 0;
        const minute = timeOfDay?.getUTCMinutes() || 0;
        const pstHour = (hour - 8 + 24) % 24;
        
        console.log(`         ⏰ ${pstHour}:${minute.toString().padStart(2, '0')} PST - Next: ${schedule.nextOccurrenceAt?.toISOString() || 'Not set'}`);
      }
    }
  }
}

async function main() {
  try {
    await listAllUsers();
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
