import { adminActionClient } from "@/utils/actions/safe-action";
import { z } from "zod";
import {
  migrateUsersToDigestDefaults,
  getMigrationStatus,
} from "@/scripts/migrate-digest-defaults";

const runDigestMigrationBody = z.object({
  dryRun: z.boolean().default(false),
});

export const runDigestMigrationAction = adminActionClient
  .metadata({ name: "runDigestMigration" })
  .schema(runDigestMigrationBody)
  .action(async ({ parsedInput }: { parsedInput: { dryRun: boolean } }) => {
    const result = await migrateUsersToDigestDefaults(parsedInput.dryRun);
    return result;
  });

export const getDigestMigrationStatusAction = adminActionClient
  .metadata({ name: "getDigestMigrationStatus" })
  .schema(z.object({}))
  .action(async () => {
    const status = await getMigrationStatus();
    return status;
  });
