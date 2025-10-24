import { NextResponse } from "next/server";
import subDays from "date-fns/subDays";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { publishToQstashQueue } from "@/utils/upstash";

const logger = createScopedLogger("cron/resend/digest/all");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function sendDigestAllUpdate() {
  logger.info("Sending digest all update");

  const now = new Date();

  // Get all schedules that are due
  const dueSchedules = await prisma.schedule.findMany({
    where: {
      nextOccurrenceAt: { lte: now },
    },
    include: {
      emailAccount: {
        include: {
          user: {
            include: {
              premium: true,
            },
          },
        },
      },
    },
  });

  // Filter for premium users and accounts created more than 1 day ago
  const eligibleSchedules = dueSchedules.filter((schedule) => {
    const { emailAccount } = schedule;
    const isPremium =
      emailAccount.user.premium &&
      ((emailAccount.user.premium.lemonSqueezyRenewsAt &&
        emailAccount.user.premium.lemonSqueezyRenewsAt > now) ||
        ["active", "trialing"].includes(
          emailAccount.user.premium.stripeSubscriptionStatus || "",
        ));
    const isOldEnough = emailAccount.createdAt < subDays(now, 1);
    return isPremium && isOldEnough;
  });

  // Group by emailAccountId to avoid sending duplicate digests
  const emailAccountIds = new Set(
    eligibleSchedules.map((s) => s.emailAccount.id),
  );
  const emailAccounts = Array.from(emailAccountIds).map((id) => {
    const schedule = eligibleSchedules.find((s) => s.emailAccount.id === id);
    return {
      id,
      email: schedule!.emailAccount.email,
    };
  });

  logger.info("Sending digest to users", {
    eligibleAccounts: emailAccounts.length,
  });

  const url = `${env.NEXT_PUBLIC_BASE_URL}/api/resend/digest`;

  for (const emailAccount of emailAccounts) {
    try {
      await publishToQstashQueue({
        queueName: "email-digest-all",
        parallelism: 3, // Allow up to 3 concurrent jobs from this queue
        url,
        body: { emailAccountId: emailAccount.id },
      });
    } catch (error) {
      logger.error("Failed to publish to Qstash", {
        email: emailAccount.email,
        error,
      });
    }
  }

  logger.info("All requests initiated", { count: emailAccounts.length });
  return { count: emailAccounts.length };
}

export const GET = withError(async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/resend/digest/all"));
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendDigestAllUpdate();

  return NextResponse.json(result);
});

export const POST = withError(async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/resend/digest/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendDigestAllUpdate();

  return NextResponse.json(result);
});
