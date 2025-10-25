import { NextResponse } from "next/server";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { withError } from "@/utils/middleware";
import { env } from "@/env";

export const GET = withError(async (_request) => {
  const session = await auth();
  if (!isAdmin({ email: session?.user.email })) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  return NextResponse.json({
    RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL,
    NEXT_PUBLIC_BASE_URL: env.NEXT_PUBLIC_BASE_URL,
    NODE_ENV: env.NODE_ENV,
  });
});

export const dynamic = "force-dynamic";
