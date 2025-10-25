import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { withError } from "@/utils/middleware";
import { sendEmail } from "@/utils/digest/send-digest-email";

const schema = z.object({
  emailAccountId: z.string(),
});

export const POST = withError(async (request) => {
  const session = await auth();
  if (!isAdmin({ email: session?.user.email })) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  const body = schema.parse(await request.json());
  const { emailAccountId } = body;

  // Call PRODUCTION sendEmail() function directly with force=true and testMode=false
  // This uses the EXACT same sendEmail() function as production cron
  // testMode=false sends emails to actual recipient and marks digests as SENT
  const result = await sendEmail({
    emailAccountId,
    force: true, // Force send even if schedule says not ready
    testMode: false, // Send to actual recipient
  });

  return NextResponse.json({
    success: true,
    message:
      "Digest sent to actual recipient via production sendEmail() function",
    result,
  });
});
