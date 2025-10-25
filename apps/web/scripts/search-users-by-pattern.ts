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

async function searchUsersByPattern(searchPattern: string) {
  console.log(`🔍 Searching users with pattern: ${searchPattern}`);
  
  // Search for users with email containing the pattern
  const users = await prisma.user.findMany({
    where: {
      email: {
        contains: searchPattern,
        mode: 'insensitive',
      },
    },
    include: {
      emailAccounts: true,
    },
  });

  if (users.length === 0) {
    console.log(`❌ No users found matching pattern: ${searchPattern}`);
    
    // Try searching for similar patterns
    console.log(`\n🔍 Searching for similar patterns...`);
    
    // Search for users with "bottleneck" in email
    const bottleneckUsers = await prisma.user.findMany({
      where: {
        email: {
          contains: "bottleneck",
          mode: 'insensitive',
        },
      },
      select: {
        email: true,
        name: true,
      },
    });
    
    if (bottleneckUsers.length > 0) {
      console.log(`\n📧 Found users with "bottleneck" in email:`);
      bottleneckUsers.forEach(user => {
        console.log(`   - ${user.name} (${user.email})`);
      });
    }
    
    // Search for users with "rameel" in email
    const rameelUsers = await prisma.user.findMany({
      where: {
        email: {
          contains: "rameel",
          mode: 'insensitive',
        },
      },
      select: {
        email: true,
        name: true,
      },
    });
    
    if (rameelUsers.length > 0) {
      console.log(`\n👤 Found users with "rameel" in email:`);
      rameelUsers.forEach(user => {
        console.log(`   - ${user.name} (${user.email})`);
      });
    }
    
    return;
  }

  console.log(`✅ Found ${users.length} user(s) matching pattern:`);

  for (const user of users) {
    console.log(`\n👤 User: ${user.name} (${user.email})`);
    console.log(`📧 Email accounts: ${user.emailAccounts.length}`);
    
    let totalSchedules = 0;
    
    for (const emailAccount of user.emailAccounts) {
      console.log(`\n📬 Email account: ${emailAccount.email}`);
      
      // Find schedules for this email account
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
        
        const timeOfDay = schedule.timeOfDay;
        const hour = timeOfDay?.getUTCHours() || 0;
        const minute = timeOfDay?.getUTCMinutes() || 0;
        const pstHour = (hour - 8 + 24) % 24;
        
        console.log(`\n   📋 Schedule ID: ${schedule.id}`);
        console.log(`      ⏰ Time: ${pstHour}:${minute.toString().padStart(2, '0')} PST (${hour}:${minute.toString().padStart(2, '0')} UTC)`);
        console.log(`      🔄 Interval: Every ${schedule.intervalDays || 1} day(s)`);
        console.log(`      ⏭️  Next digest: ${schedule.nextOccurrenceAt?.toISOString() || 'Not set'}`);
        console.log(`      ⏮️  Last digest: ${schedule.lastOccurrenceAt?.toISOString() || 'Never sent'}`);
        
        if (schedule.nextOccurrenceAt) {
          const now = new Date();
          const nextDigest = new Date(schedule.nextOccurrenceAt);
          if (nextDigest <= now) {
            console.log(`      🟡 Status: DUE NOW`);
          } else {
            console.log(`      🟢 Status: Active`);
          }
        } else {
          console.log(`      🔴 Status: INACTIVE`);
        }
      }
    }
    
    console.log(`\n📊 Summary for ${user.name}:`);
    console.log(`   📅 Total schedules: ${totalSchedules}`);
  }
}

async function main() {
  const searchPattern = process.argv[3];
  
  if (!searchPattern) {
    console.error("❌ Please provide a search pattern as an argument");
    console.log("Usage: tsx scripts/search-users-by-pattern.ts [environment] <search-pattern>");
    console.log("Examples:");
    console.log("  Local:    tsx scripts/search-users-by-pattern.ts local bottleneck");
    console.log("  Prod:     tsx scripts/search-users-by-pattern.ts production rameel");
    console.log("  Prod:     tsx scripts/search-users-by-pattern.ts prod thebottleneck");
    process.exit(1);
  }

  try {
    await searchUsersByPattern(searchPattern);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();