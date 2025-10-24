import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export const DELETE = withEmailAccount(async (request, { params }) => {
  const { id } = await params;
  const emailAccountId = request.auth.emailAccountId;

  // Verify ownership
  const schedule = await prisma.schedule.findUnique({
    where: { id },
    select: { emailAccountId: true },
  });

  if (!schedule || schedule.emailAccountId !== emailAccountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.schedule.delete({ where: { id } });
  return NextResponse.json({ success: true });
});
