import { useCallback, useEffect, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import useSWR from "swr";
import { z } from "zod";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TimePicker } from "@/components/TimePicker";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { useRules } from "@/hooks/useRules";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import {
  updateDigestItemsAction,
  updateDigestScheduleAction,
} from "@/utils/actions/settings";
import type { UpdateDigestItemsBody } from "@/utils/actions/settings.validation";
import { ActionType } from "@prisma/client";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { GetDigestSettingsResponse } from "@/app/api/user/digest-settings/route";
import type { GetDigestScheduleResponse } from "@/app/api/user/digest-schedule/route";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
} from "@/components/ui/select";
import { FormItem } from "@/components/ui/form";
import {
  createCanonicalTimeOfDay,
  dayOfWeekToBitmask,
  bitmaskToDayOfWeek,
} from "@/utils/schedule";
import { Trash2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const digestSettingsSchema = z.object({
  selectedItems: z.set(z.string()),
  // Schedule
  schedule: z.string().min(1, "Please select a frequency"),
  dayOfWeek: z.string().min(1, "Please select a day"),
  time: z.string().min(1, "Please select a time"),
});

type DigestSettingsFormValues = z.infer<typeof digestSettingsSchema>;

const frequencies = [
  { value: "daily", label: "Day" },
  { value: "weekly", label: "Week" },
];

const daysOfWeek = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

export function DigestSettingsForm() {
  const { emailAccountId } = useAccount();
  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
    mutate: mutateRules,
  } = useRules();

  const {
    data: digestSettings,
    isLoading: digestLoading,
    error: digestError,
    mutate: mutateDigestSettings,
  } = useSWR<GetDigestSettingsResponse>("/api/user/digest-settings", {
    revalidateOnMount: true, // Always fetch fresh data when component mounts
    revalidateOnFocus: false,
  });

  const {
    data: scheduleData,
    isLoading: scheduleLoading,
    error: scheduleError,
    mutate: mutateSchedule,
  } = useSWR<GetDigestScheduleResponse>("/api/user/digest-schedule", {
    revalidateOnMount: true, // Always fetch fresh data when component mounts
    revalidateOnFocus: false,
  });

  const isLoading = rulesLoading || digestLoading || scheduleLoading;
  const error = rulesError || digestError || scheduleError;

  const [selectedDigestItems, setSelectedDigestItems] = useState<Set<string>>(
    new Set(),
  );
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showAddScheduleForm, setShowAddScheduleForm] = useState(false);

  const schedules = Array.isArray(scheduleData) ? scheduleData : [];

  // Format time in user's local timezone
  const formatScheduleTime = (timeOfDay: Date | null | undefined) => {
    if (!timeOfDay) return "Not set";
    const date = new Date(timeOfDay);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzAbbr = new Date()
      .toLocaleTimeString("en-US", {
        timeZone: timezone,
        timeZoneName: "short",
      })
      .split(" ")
      .pop();

    return `${displayHour}:${minutes.toString().padStart(2, "0")} ${ampm} ${tzAbbr}`;
  };

  const deleteSchedule = async (scheduleId: string) => {
    setIsDeleting(scheduleId);
    try {
      const response = await fetch(`/api/user/digest-schedule/${scheduleId}`, {
        method: "DELETE",
        headers: {
          "X-Email-Account-ID": emailAccountId,
        },
      });

      if (response.ok) {
        toastSuccess({ description: "Schedule deleted successfully" });
        mutateSchedule();
      } else {
        toastError({ description: "Failed to delete schedule" });
      }
    } catch (error) {
      toastError({
        description: "An error occurred while deleting the schedule",
      });
    } finally {
      setIsDeleting(null);
    }
  };

  const {
    handleSubmit,
    formState: { isSubmitting },
    watch,
    setValue,
    reset,
  } = useForm<DigestSettingsFormValues>({
    resolver: zodResolver(digestSettingsSchema),
    defaultValues: {
      selectedItems: new Set(),
      schedule: "daily",
      dayOfWeek: "1",
      time: "09:00",
    },
  });

  const watchedValues = watch();

  const { execute: executeItems } = useAction(
    updateDigestItemsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutateRules();
        mutateDigestSettings();
      },
      onError: (error) => {
        toastError({
          title: "Error updating digest items",
          description: error.error.serverError || "An error occurred",
        });
      },
    },
  );

  const { execute: executeSchedule } = useAction(
    updateDigestScheduleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutateSchedule();
      },
      onError: (error) => {
        toastError({
          title: "Error updating digest schedule",
          description: error.error.serverError || "An error occurred",
        });
      },
    },
  );

  // Initialize selected items and form data from API responses
  useEffect(() => {
    // We need rules and digestSettings, but scheduleData can be null (user hasn't set up schedule yet)
    if (rules && digestSettings) {
      const selectedItems = new Set<string>();

      // Add rules that have digest actions
      rules.forEach((rule) => {
        const hasDigest = rule.actions.some(
          (action) => action.type === ActionType.DIGEST,
        );
        if (hasDigest) {
          selectedItems.add(rule.id);
        }
      });

      // Add cold email if enabled
      if (digestSettings.coldEmail) {
        selectedItems.add("cold-emails");
      }

      setSelectedDigestItems(selectedItems);

      // Initialize schedule form data (use defaults if scheduleData is null)
      const initialScheduleProps = scheduleData
        ? getInitialScheduleProps(scheduleData)
        : {
            schedule: "daily",
            dayOfWeek: "1",
            time: "09:00",
          };

      reset({
        selectedItems,
        ...initialScheduleProps,
      });
    }
  }, [rules, digestSettings, scheduleData, reset]);

  // Update form when selectedDigestItems changes
  useEffect(() => {
    setValue("selectedItems", selectedDigestItems);
  }, [selectedDigestItems, setValue]);

  const onSubmit: SubmitHandler<DigestSettingsFormValues> = useCallback(
    async (data) => {
      // Handle items update
      const ruleDigestPreferences: Record<string, boolean> = {};
      const coldEmailDigest = data.selectedItems.has("cold-emails");

      // Set all rules to false first
      rules?.forEach((rule) => {
        ruleDigestPreferences[rule.id] = false;
      });

      // Then set selected rules to true
      data.selectedItems.forEach((itemId) => {
        if (itemId !== "cold-emails") {
          ruleDigestPreferences[itemId] = true;
        }
      });

      const itemsData: UpdateDigestItemsBody = {
        ruleDigestPreferences,
        coldEmailDigest,
      };

      // Execute items update
      try {
        await executeItems(itemsData);

        // Handle schedule creation (only if form is visible and being submitted)
        if (showAddScheduleForm || schedules.length === 0) {
          const { schedule, dayOfWeek, time } = data;

          let intervalDays: number;
          switch (schedule) {
            case "daily":
              intervalDays = 1;
              break;
            case "weekly":
              intervalDays = 7;
              break;
            default:
              intervalDays = 1;
          }

          const [hourStr, minuteStr] = time.split(":");
          const hour24 = Number.parseInt(hourStr, 10);
          const minute = Number.parseInt(minuteStr, 10);

          const timeOfDay = createCanonicalTimeOfDay(hour24, minute);

          const scheduleCreateData = {
            intervalDays,
            occurrences: 1,
            daysOfWeek: dayOfWeekToBitmask(Number.parseInt(dayOfWeek, 10)),
            timeOfDay: timeOfDay.toISOString(),
          };

          const response = await fetch("/api/user/digest-schedule", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Email-Account-ID": emailAccountId,
            },
            body: JSON.stringify(scheduleCreateData),
          });

          if (!response.ok) {
            throw new Error("Failed to create schedule");
          }

          mutateSchedule();
          setShowAddScheduleForm(false);
        }

        toastSuccess({
          description: "Your digest settings have been updated!",
        });
      } catch {
        toastError({
          title: "Error updating digest settings",
          description: "An error occurred while saving your settings",
        });
      }
    },
    [
      rules,
      executeItems,
      executeSchedule,
      showAddScheduleForm,
      schedules.length,
      mutateSchedule,
    ],
  );

  // Create options for MultiSelectFilter
  const digestOptions = [
    ...(rules?.map((rule) => ({
      label: rule.name,
      value: rule.id,
    })) || []),
    {
      label: "Cold Emails",
      value: "cold-emails",
    },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-8 h-full">
      <div className="space-y-6">
        <LoadingContent
          loading={isLoading}
          error={
            error as { error?: string; info?: { error: string } } | undefined
          }
          loadingComponent={<Skeleton className="min-h-[200px] w-full" />}
        >
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <Label>What to include in the digest email</Label>
              <div className="mt-3">
                <MultiSelectFilter
                  title="Digest Items"
                  options={digestOptions}
                  selectedValues={selectedDigestItems}
                  setSelectedValues={setSelectedDigestItems}
                  maxDisplayedValues={3}
                />
              </div>
            </div>

            <div>
              <Label>Send the digest email</Label>

              {/* Existing Schedules */}
              {schedules.length > 0 && (
                <div className="mt-3 space-y-2">
                  {schedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className="flex items-center justify-between p-3 border rounded-md bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">Daily</Badge>
                        <span className="font-medium">
                          {formatScheduleTime(schedule.timeOfDay)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteSchedule(schedule.id)}
                        disabled={isDeleting === schedule.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Schedule Button */}
              {!showAddScheduleForm && schedules.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddScheduleForm(true)}
                  className="w-full mt-3"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Schedule Time
                </Button>
              )}

              {/* Schedule Form (show if adding or no schedules exist) */}
              {(showAddScheduleForm || schedules.length === 0) && (
                <>
                  <div className="grid lg:grid-cols-3 gap-3 mt-3">
                    <FormItem>
                      <Label htmlFor="frequency-select">Every</Label>
                      <Select
                        value={watchedValues.schedule}
                        onValueChange={(val) => setValue("schedule", val)}
                      >
                        <SelectTrigger id="frequency-select">
                          {watchedValues.schedule
                            ? frequencies.find(
                                (f) => f.value === watchedValues.schedule,
                              )?.label
                            : "Select..."}
                        </SelectTrigger>
                        <SelectContent>
                          {frequencies.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>

                    {watchedValues.schedule !== "daily" && (
                      <FormItem>
                        <Label htmlFor="dayofweek-select">on</Label>
                        <Select
                          value={watchedValues.dayOfWeek}
                          onValueChange={(val) => setValue("dayOfWeek", val)}
                        >
                          <SelectTrigger id="dayofweek-select">
                            {watchedValues.dayOfWeek
                              ? daysOfWeek.find(
                                  (d) => d.value === watchedValues.dayOfWeek,
                                )?.label
                              : "Select..."}
                          </SelectTrigger>
                          <SelectContent>
                            {daysOfWeek.map((d) => (
                              <SelectItem key={d.value} value={d.value}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}

                    <TimePicker
                      id="time-picker"
                      label="at"
                      value={watchedValues.time}
                      onChange={(value) => setValue("time", value)}
                    />
                  </div>
                  {showAddScheduleForm && schedules.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddScheduleForm(false)}
                      className="mt-3"
                    >
                      Cancel
                    </Button>
                  )}
                </>
              )}
            </div>

            <Button type="submit" loading={isSubmitting} className="mt-4">
              Save
            </Button>
          </form>
        </LoadingContent>
      </div>

      <EmailPreview selectedDigestItems={selectedDigestItems} />
    </div>
  );
}

function EmailPreview({
  selectedDigestItems,
}: {
  selectedDigestItems: Set<string>;
}) {
  const { data: rules } = useRules();

  const selectedDigestNames = Array.from(selectedDigestItems).map((itemId) => {
    if (itemId === "cold-emails") return "Cold Emails";
    return rules?.find((rule) => rule.id === itemId)?.name || itemId;
  });

  const { data: htmlContent } = useSWR<string>(
    selectedDigestNames.length > 0
      ? `/api/digest-preview?categories=${encodeURIComponent(JSON.stringify(selectedDigestNames))}`
      : null,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch preview");
      return response.text();
    },
    { keepPreviousData: true },
  );

  return (
    <div>
      <Label>Preview</Label>
      <div className="mt-3 border rounded-lg overflow-hidden bg-slate-50">
        {selectedDigestNames.length > 0 && htmlContent ? (
          <iframe
            title="Digest preview"
            sandbox=""
            className="w-full min-h-[700px] max-h-[700px] bg-white"
            srcDoc={htmlContent}
          />
        ) : (
          <div className="text-center text-slate-500 py-8">
            <p>Select digest items to see a preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getInitialScheduleProps(
  digestSchedules?: GetDigestScheduleResponse | null,
) {
  // Use the first schedule if multiple exist
  const digestSchedule =
    Array.isArray(digestSchedules) && digestSchedules.length > 0
      ? digestSchedules[0]
      : null;

  const initialSchedule = (() => {
    if (!digestSchedule) return "daily";
    switch (digestSchedule.intervalDays) {
      case 1:
        return "daily";
      case 7:
        return "weekly";
      case 14:
        return "biweekly";
      case 30:
        return "monthly";
      default:
        return "daily";
    }
  })();

  const initialDayOfWeek = (() => {
    if (!digestSchedule || digestSchedule.daysOfWeek == null) return "1";
    const dayOfWeek = bitmaskToDayOfWeek(digestSchedule.daysOfWeek);
    return dayOfWeek !== null ? dayOfWeek.toString() : "1";
  })();

  const initialTime = digestSchedule?.timeOfDay
    ? (() => {
        const hours = new Date(digestSchedule.timeOfDay)
          .getHours()
          .toString()
          .padStart(2, "0");
        const minutes = new Date(digestSchedule.timeOfDay)
          .getMinutes()
          .toString()
          .padStart(2, "0");
        return `${hours}:${minutes}`;
      })()
    : "09:00";

  return {
    schedule: initialSchedule,
    dayOfWeek: initialDayOfWeek,
    time: initialTime,
  };
}
