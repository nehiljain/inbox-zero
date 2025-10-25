import { NextResponse } from "next/server";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { withError } from "@/utils/middleware";
import fs from "node:fs/promises";
import path from "node:path";

export const GET = withError(async (_request) => {
  const session = await auth();
  if (!isAdmin({ email: session?.user.email })) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  // Read prompt from production file
  // Try multiple possible paths for different deployment environments
  const possiblePaths = [
    path.join(
      process.cwd(),
      "apps/web/utils/ai/digest/summarize-email-for-digest.ts",
    ),
    path.join(process.cwd(), "utils/ai/digest/summarize-email-for-digest.ts"),
    path.join(
      process.cwd(),
      "apps/web/apps/web/utils/ai/digest/summarize-email-for-digest.ts",
    ),
  ];

  let content = "";
  let filePath = "";

  for (const testPath of possiblePaths) {
    try {
      content = await fs.readFile(testPath, "utf-8");
      filePath = testPath;
      break;
    } catch (_error) {
      // Continue to next path
    }
  }

  if (!content) {
    return NextResponse.json(
      { error: "Could not find summarize-email-for-digest.ts file" },
      { status: 500 },
    );
  }

  // Extract system prompt (find text between const system = ` and next `)
  const startMarker = "const system = `";
  const endMarker = "`;";
  const startIndex = content.indexOf(startMarker);

  let prompt = "Prompt not found";
  if (startIndex !== -1) {
    const promptStart = startIndex + startMarker.length;
    const promptEnd = content.indexOf(endMarker, promptStart);
    if (promptEnd !== -1) {
      prompt = content.substring(promptStart, promptEnd);
    }
  }

  return NextResponse.json({
    prompt,
    file: filePath,
  });
});

export const dynamic = "force-dynamic";
