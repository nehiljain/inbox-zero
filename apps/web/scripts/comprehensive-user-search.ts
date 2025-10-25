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

async function comprehensiveUserSearch() {
  console.log(`🔍 Comprehensive user search...`);
  
  // Get ALL users with their exact emails
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

  console.log(`\n📊 ALL USERS IN DATABASE (${allUsers.length} total):`);
  console.log(`\n${'ID'.padEnd(25)} ${'Name'.padEnd(20)} ${'Email'.padEnd(40)} ${'Created'}`);
  console.log(`${'-'.repeat(100)}`);

  for (const user of allUsers) {
    const id = user.id.substring(0, 24);
    const name = (user.name || 'No name').substring(0, 19);
    const email = user.email.substring(0, 39);
    const created = user.createdAt.toISOString().split('T')[0];
    
    console.log(`${id.padEnd(25)} ${name.padEnd(20)} ${email.padEnd(40)} ${created}`);
  }

  // Search for specific patterns
  const searchPatterns = [
    'rameel',
    'bottleneck', 
    'thebottleneck',
    'bottelneck', // Common typo
    'bottleneck.io',
    'thebottleneck.io'
  ];

  console.log(`\n🔍 Searching for specific patterns:`);
  
  for (const pattern of searchPatterns) {
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: pattern,
          mode: 'insensitive',
        },
      },
      select: {
        email: true,
        name: true,
      },
    });
    
    if (users.length > 0) {
      console.log(`\n✅ Found users with "${pattern}":`);
      users.forEach(user => {
        console.log(`   - ${user.name} (${user.email})`);
      });
    } else {
      console.log(`❌ No users found with "${pattern}"`);
    }
  }

  // Also check email accounts table
  console.log(`\n🔍 Checking EmailAccount table for thebottleneck.io:`);
  
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      email: {
        contains: 'thebottleneck.io',
        mode: 'insensitive',
      },
    },
    include: {
      user: true,
    },
  });

  if (emailAccounts.length > 0) {
    console.log(`✅ Found ${emailAccounts.length} email account(s) with thebottleneck.io:`);
    emailAccounts.forEach(account => {
      console.log(`   - ${account.user.name} (${account.user.email}) -> EmailAccount: ${account.email}`);
    });
  } else {
    console.log(`❌ No email accounts found with thebottleneck.io`);
  }

  // Check if there are any users with similar domains
  console.log(`\n🔍 Checking for users with .io domains:`);
  
  const ioUsers = await prisma.user.findMany({
    where: {
      email: {
        endsWith: '.io',
      },
    },
    select: {
      email: true,
      name: true,
    },
  });

  if (ioUsers.length > 0) {
    console.log(`✅ Found ${ioUsers.length} user(s) with .io domains:`);
    ioUsers.forEach(user => {
      console.log(`   - ${user.name} (${user.email})`);
    });
  } else {
    console.log(`❌ No users found with .io domains`);
  }
}

async function main() {
  try {
    await comprehensiveUserSearch();
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
