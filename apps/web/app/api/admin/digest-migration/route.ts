import { type NextRequest, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import {
  runDigestMigrationAction,
  getDigestMigrationStatusAction,
} from "@/utils/actions/digest-migration";

export const GET = withError(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "true";

  const result = await runDigestMigrationAction({ dryRun });
  if (!result) {
    return NextResponse.json({ error: "No result returned" }, { status: 500 });
  }
  if (result.serverError) {
    return NextResponse.json({ error: result.serverError }, { status: 500 });
  }
  return NextResponse.json(result.data);
});

export const POST = withError(async (request: NextRequest) => {
  const body = await request.json();
  const { dryRun = false } = body;

  const result = await runDigestMigrationAction({ dryRun });
  if (!result) {
    return NextResponse.json({ error: "No result returned" }, { status: 500 });
  }
  if (result.serverError) {
    return NextResponse.json({ error: result.serverError }, { status: 500 });
  }
  return NextResponse.json(result.data);
});

export const PUT = withError(async () => {
  const status = await getDigestMigrationStatusAction({});
  if (!status) {
    return NextResponse.json({ error: "No status returned" }, { status: 500 });
  }
  if (status.serverError) {
    return NextResponse.json({ error: status.serverError }, { status: 500 });
  }
  return NextResponse.json(status.data);
});
