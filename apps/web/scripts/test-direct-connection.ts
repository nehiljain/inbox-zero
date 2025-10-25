#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import path from "path";

// Load production environment variables
config({ path: path.join(__dirname, '.env.prod') });

console.log(`🌍 Environment: PRODUCTION (from .env.prod)`);
console.log(`🔗 Using DIRECT_URL: ${process.env.DIRECT_URL ? 'SET' : 'NOT SET'}`);

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL,
    },
  },
});

async function testDirectConnection() {
  console.log(`🔍 Testing DIRECT_URL database connection...`);
  
  try {
    const userCount = await prisma.user.count();
    console.log(`✅ Connection successful! Found ${userCount} users in database.`);
    
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    console.log(`\n📊 All users in DIRECT_URL database:`);
    allUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.name} (${user.email}) - Created: ${user.createdAt.toISOString().split('T')[0]}`);
    });
    
    // Test specific user search
    const rameel = await prisma.user.findUnique({
      where: { email: 'rameel@thebottleneck.io' },
    });
    
    if (rameel) {
      console.log(`\n✅ Found Rameel: ${rameel.name} (${rameel.email})`);
    } else {
      console.log(`\n❌ Rameel not found with exact email match`);
    }
    
  } catch (error) {
    console.error(`❌ Database connection failed:`, error);
  }
}

async function main() {
  try {
    await testDirectConnection();
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
