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
  console.log(`🔗 Database URL: ${databaseUrl ? 'SET' : 'NOT SET'}`);
} else {
  databaseUrl = process.env.DATABASE_URL;
  console.log("🔗 Connecting to LOCAL database");
  console.log(`🔗 Database URL: ${databaseUrl ? 'SET' : 'NOT SET'}`);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

async function testConnection() {
  console.log(`🔍 Testing database connection...`);
  
  try {
    // Test basic connection
    const userCount = await prisma.user.count();
    console.log(`✅ Connection successful! Found ${userCount} users in database.`);
    
    // List all users
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
    
    console.log(`\n📊 All users in database:`);
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
      
      // Try case-insensitive search
      const rameelCaseInsensitive = await prisma.user.findFirst({
        where: {
          email: {
            equals: 'rameel@thebottleneck.io',
            mode: 'insensitive',
          },
        },
      });
      
      if (rameelCaseInsensitive) {
        console.log(`✅ Found Rameel with case-insensitive search: ${rameelCaseInsensitive.name} (${rameelCaseInsensitive.email})`);
      } else {
        console.log(`❌ Rameel not found even with case-insensitive search`);
      }
    }
    
  } catch (error) {
    console.error(`❌ Database connection failed:`, error);
  }
}

async function main() {
  try {
    await testConnection();
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
