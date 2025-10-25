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

async function listAllUsers() {
  console.log(`🔍 Listing all users in production database...`);
  
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
        completedOnboardingAt: true,
        completedAppOnboardingAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`\n📊 Found ${users.length} users:`);
    console.log(`\n${'Name'.padEnd(20)} ${'Email'.padEnd(35)} ${'Created'.padEnd(20)} ${'Onboarding'}`);
    console.log(`${'-'.repeat(80)}`);

    for (const user of users) {
      const name = (user.name || 'No name').substring(0, 19);
      const email = user.email.substring(0, 34);
      const created = user.createdAt.toISOString().split('T')[0];
      const onboarding = user.completedOnboardingAt ? '✅' : '❌';
      
      console.log(`${name.padEnd(20)} ${email.padEnd(35)} ${created.padEnd(20)} ${onboarding}`);
    }

    // Check for Rameel specifically
    console.log(`\n🔍 Searching for Rameel specifically:`);
    
    const rameelExact = await prisma.user.findUnique({
      where: { email: 'rameel@thebottleneck.io' },
    });
    
    if (rameelExact) {
      console.log(`✅ Found Rameel with exact match: ${rameelExact.name} (${rameelExact.email})`);
    } else {
      console.log(`❌ Rameel not found with exact email match`);
    }

    // Search for any user with "rameel" in email
    const rameelPattern = await prisma.user.findMany({
      where: {
        email: {
          contains: 'rameel',
          mode: 'insensitive',
        },
      },
    });

    if (rameelPattern.length > 0) {
      console.log(`✅ Found users with "rameel" in email:`);
      rameelPattern.forEach(user => {
        console.log(`   - ${user.name} (${user.email})`);
      });
    } else {
      console.log(`❌ No users found with "rameel" in email`);
    }

    // Search for any user with "bottleneck" in email
    const bottleneckPattern = await prisma.user.findMany({
      where: {
        email: {
          contains: 'bottleneck',
          mode: 'insensitive',
        },
      },
    });

    if (bottleneckPattern.length > 0) {
      console.log(`✅ Found users with "bottleneck" in email:`);
      bottleneckPattern.forEach(user => {
        console.log(`   - ${user.name} (${user.email})`);
      });
    } else {
      console.log(`❌ No users found with "bottleneck" in email`);
    }

  } catch (error) {
    console.error(`❌ Error:`, error);
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
