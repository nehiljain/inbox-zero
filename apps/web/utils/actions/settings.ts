"use server";

import { z } from "zod";
import { actionClient } from "@/utils/actions/safe-action";
import { NEEDS_REPLY_LABEL_NAME } from "@/utils/reply-tracker/consts";
import {
  saveAiSettingsBody,
  saveEmailUpdateSettingsBody,
  saveDigestScheduleBody,
  updateDigestItemsBody,
  updateSystemLabelsBody,
} from "@/utils/actions/settings.validation";
import { DEFAULT_PROVIDER } from "@/utils/llms/config";
import prisma from "@/utils/prisma";
import { calculateNextScheduleDate } from "@/utils/schedule";
import { actionClientUser } from "@/utils/actions/safe-action";
import { ActionType, type Prisma } from "@prisma/client";

export const updateEmailSettingsAction = actionClient
  .metadata({ name: "updateEmailSettings" })
  .schema(saveEmailUpdateSettingsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { statsEmailFrequency, summaryEmailFrequency },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          statsEmailFrequency,
          summaryEmailFrequency,
        },
      });
    },
  );

export const updateAiSettingsAction = actionClientUser
  .metadata({ name: "updateAiSettings" })
  .schema(saveAiSettingsBody)
  .action(
    async ({
      ctx: { userId },
      parsedInput: { aiProvider, aiModel, aiApiKey },
    }) => {
      await prisma.user.update({
        where: { id: userId },
        data:
          aiProvider === DEFAULT_PROVIDER
            ? { aiProvider: null, aiModel: null, aiApiKey: null }
            : { aiProvider, aiModel, aiApiKey },
      });
    },
  );

export const updateDigestScheduleAction = actionClient
  .metadata({ name: "updateDigestSchedule" })
  .schema(saveDigestScheduleBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const { intervalDays, daysOfWeek, timeOfDay, occurrences } = parsedInput;

    const create: Prisma.ScheduleUpsertArgs["create"] = {
      emailAccountId,
      intervalDays,
      daysOfWeek,
      timeOfDay,
      occurrences,
      lastOccurrenceAt: new Date(),
      nextOccurrenceAt: calculateNextScheduleDate({
        ...parsedInput,
        lastOccurrenceAt: null,
      }),
    };

    // First, try to find an existing schedule for this email account
    const existingSchedule = await prisma.schedule.findFirst({
      where: { emailAccountId },
    });

    if (existingSchedule) {
      // Update existing schedule
      await prisma.schedule.update({
        where: { id: existingSchedule.id },
        data: {
          intervalDays,
          daysOfWeek,
          timeOfDay,
          occurrences,
          lastOccurrenceAt: new Date(),
          nextOccurrenceAt: calculateNextScheduleDate({
            ...parsedInput,
            lastOccurrenceAt: null,
          }),
        },
      });
    } else {
      // Create new schedule
      await prisma.schedule.create({
        data: create,
      });
    }

    return { success: true };
  });

export const updateReplyTrackingAction = actionClient
  .metadata({ name: "updateReplyTracking" })
  .schema(z.object({ enabled: z.boolean() }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { enabled } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { needsReplyLabelId: true },
    });

    // Find all rules with "To Reply" label (by labelId or legacy label name)
    const toReplyRules = await prisma.rule.findMany({
      where: {
        emailAccountId,
        actions: {
          some: {
            type: ActionType.LABEL,
            OR: [
              ...(emailAccount?.needsReplyLabelId
                ? [{ labelId: emailAccount.needsReplyLabelId }]
                : []),
              { label: NEEDS_REPLY_LABEL_NAME },
            ],
          },
        },
      },
      include: { actions: true },
    });

    // Prepare the operations
    const rulesToAddTrackThread = toReplyRules.filter(
      (rule) =>
        enabled &&
        !rule.actions.some((action) => action.type === ActionType.TRACK_THREAD),
    );

    const rulesToRemoveTrackThread = toReplyRules.filter(
      (rule) =>
        !enabled &&
        rule.actions.some((action) => action.type === ActionType.TRACK_THREAD),
    );

    // Execute all updates atomically
    await prisma.$transaction([
      // Update email account setting
      prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { outboundReplyTracking: enabled },
      }),
      // Add TRACK_THREAD actions
      ...rulesToAddTrackThread.map((rule) =>
        prisma.action.create({
          data: {
            type: ActionType.TRACK_THREAD,
            ruleId: rule.id,
          },
        }),
      ),
      // Remove TRACK_THREAD actions
      ...rulesToRemoveTrackThread.map((rule) =>
        prisma.action.deleteMany({
          where: {
            ruleId: rule.id,
            type: ActionType.TRACK_THREAD,
          },
        }),
      ),
    ]);

    return { success: true };
  });

export const updateDigestItemsAction = actionClient
  .metadata({ name: "updateDigestItems" })
  .schema(updateDigestItemsBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { ruleDigestPreferences, coldEmailDigest },
    }) => {
      const promises = Object.entries(ruleDigestPreferences).map(
        async ([ruleId, enabled]) => {
          // Verify the rule belongs to this email account
          const rule = await prisma.rule.findUnique({
            where: {
              id: ruleId,
              emailAccountId,
            },
            select: { id: true, actions: true },
          });

          if (!rule) {
            logger.error("Rule not found", { ruleId });
            return;
          }

          const hasDigestAction = rule.actions.some(
            (action) => action.type === ActionType.DIGEST,
          );

          if (enabled && !hasDigestAction) {
            // Add DIGEST action
            await prisma.action.create({
              data: {
                ruleId: rule.id,
                type: ActionType.DIGEST,
              },
            });
          } else if (!enabled && hasDigestAction) {
            // Remove DIGEST action
            await prisma.action.deleteMany({
              where: {
                ruleId: rule.id,
                type: ActionType.DIGEST,
              },
            });
          }
        },
      );

      // Handle cold email digest setting separately
      if (coldEmailDigest !== undefined) {
        promises.push(
          prisma.emailAccount
            .update({
              where: { id: emailAccountId },
              data: { coldEmailDigest },
            })
            .then(() => {}),
        );
      }

      await Promise.all(promises);
      return { success: true };
    },
  );

export const updateSystemLabelsAction = actionClient
  .metadata({ name: "updateSystemLabels" })
  .schema(updateSystemLabelsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: {
        needsReplyLabelId,
        awaitingReplyLabelId,
        coldEmailLabelId,
      },
    }) => {
      // Get the old label IDs before updating
      const oldConfig = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          needsReplyLabelId: true,
          awaitingReplyLabelId: true,
          coldEmailLabelId: true,
        },
      });

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          needsReplyLabelId: needsReplyLabelId ?? null,
          awaitingReplyLabelId: awaitingReplyLabelId ?? null,
          coldEmailLabelId: coldEmailLabelId ?? null,
        },
      });

      // Update all LABEL actions that match the old needs reply label
      if (needsReplyLabelId) {
        await prisma.action.updateMany({
          where: {
            rule: { emailAccountId },
            type: ActionType.LABEL,
            OR: [
              ...(oldConfig?.needsReplyLabelId
                ? [{ labelId: oldConfig.needsReplyLabelId }]
                : []),
              { label: NEEDS_REPLY_LABEL_NAME },
            ],
          },
          data: {
            labelId: needsReplyLabelId,
            label: null, // Clear the label name since we're using labelId now
          },
        });
      }

      return { success: true };
    },
  );
