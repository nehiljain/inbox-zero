#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
import { createCanonicalTimeOfDay } from "../utils/schedule";
import { calculateNextScheduleDate } from "../utils/schedule";
import { subHours } from "date-fns";

const prisma = new PrismaClient();

async function setupTestSchedule() {
  console.log("🧪 Setting up test digest schedule\n");

  const testEmail = process.argv[2] || "jain.nehil@gmail.com";

  // Find the user
  const emailAccount = await prisma.emailAccount.findFirst({
    where: { email: testEmail },
    include: { digestSchedules: true },
  });

  if (!emailAccount) {
    console.log(`❌ Email account not found: ${testEmail}`);
    return;
  }

  console.log(`📧 Email Account: ${emailAccount.email}`);
  console.log(`   Current Schedules: ${emailAccount.digestSchedules.length}\n`);

  // Option 1: Set existing schedule to be "due now"
  if (emailAccount.digestSchedules.length > 0) {
    const schedule = emailAccount.digestSchedules[0];

    console.log("📅 Updating existing schedule to be due now...");
    const updatedSchedule = await prisma.schedule.update({
      where: { id: schedule.id },
      data: {
        nextOccurrenceAt: subHours(new Date(), 1), // 1 hour ago (past due)
        lastOccurrenceAt: subHours(new Date(), 25), // 25 hours ago
      },
    });

    console.log("   ✅ Schedule updated:");
    console.log(
      `      Next Occurrence: ${updatedSchedule.nextOccurrenceAt?.toISOString()}`,
    );
    console.log("      (This is in the PAST, so cron will pick it up)\n");
  }

  console.log("📋 How to Test Digest Sending:\n");
  console.log("Option 1: Use Admin Digest Tester UI");
  console.log("   1. Go to: http://localhost:3000/admin/digest-tester");
  console.log("   2. Enter your email account ID");
  console.log("   3. Click 'Send Digest' button");
  console.log("   4. View preview in the UI\n");

  console.log("Option 2: Call the API directly");
  console.log(
    "   curl -X POST http://localhost:3000/api/admin/digest-tester/send \\",
  );
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"emailAccountId": "${emailAccount.id}"}'\n`);

  console.log("Option 3: Run the cron job locally");
  console.log(
    "   curl http://localhost:3000/api/resend/digest/all?secret=YOUR_CRON_SECRET\n",
  );

  console.log("Option 4: Test with digest preview endpoint");
  console.log(
    `   Open: http://localhost:3000/api/digest-preview?categories=["Calendar","Receipt","Marketing","Notification","Newsletter","To Reply","Cold Emails"]\n`,
  );

  console.log("\n📊 Current Schedule State:");
  emailAccount.digestSchedules.forEach((schedule, idx) => {
    console.log(`\n   Schedule ${idx + 1}:`);
    console.log(`     ID: ${schedule.id}`);
    console.log(`     Time: ${schedule.timeOfDay?.toISOString()}`);
    console.log(
      `     Next Due: ${schedule.nextOccurrenceAt?.toISOString() || "Not calculated"}`,
    );
    console.log(
      `     Is Due: ${schedule.nextOccurrenceAt && schedule.nextOccurrenceAt < new Date() ? "✅ YES" : "❌ NO"}`,
    );
  });

  console.log("\n\n✅ Setup complete!");
  console.log("💡 Tip: Use the Digest Tester UI for easiest testing");
}

async function main() {
  try {
    await setupTestSchedule();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
