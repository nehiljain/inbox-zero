import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { z } from "zod";

export type GetDigestScheduleResponse = Awaited<
  ReturnType<typeof getDigestSchedule>
>;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const result = await getDigestSchedule({ emailAccountId });
  return NextResponse.json(result);
});

const createScheduleSchema = z.object({
  timeOfDay: z.string(), // ISO string
  intervalDays: z.number().int().positive().optional(),
  occurrences: z.number().int().positive().optional(),
  daysOfWeek: z.number().int().min(0).max(127).optional().nullable(),
});

export const POST = withEmailAccount(async (request) => {
  try {
    const emailAccountId = request.auth.emailAccountId;
    const body = await request.json();

    console.log("Creating schedule:", { emailAccountId, body });

    const parsed = createScheduleSchema.parse(body);

    const schedule = await prisma.schedule.create({
      data: {
        emailAccountId,
        timeOfDay: new Date(parsed.timeOfDay), // Convert from ISO string
        intervalDays: parsed.intervalDays || 1,
        occurrences: parsed.occurrences || 1,
        daysOfWeek: parsed.daysOfWeek,
      },
    });

    console.log("Schedule created successfully:", schedule.id);
    return NextResponse.json(schedule);
  } catch (error) {
    console.error("Error creating schedule:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create schedule",
      },
      { status: 500 },
    );
  }
});

async function getDigestSchedule({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const schedules = await prisma.schedule.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      intervalDays: true,
      occurrences: true,
      daysOfWeek: true,
      timeOfDay: true,
      lastOccurrenceAt: true,
      nextOccurrenceAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return schedules;
}
