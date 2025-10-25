import { z } from "zod";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useCallback, useState } from "react";
import useSWR from "swr";
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FormItem } from "@/components/ui/form";
import {
  createCanonicalTimeOfDay,
  dayOfWeekToBitmask,
  bitmaskToDayOfWeek,
} from "@/utils/schedule";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { updateDigestScheduleAction } from "@/utils/actions/settings";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import type { GetDigestScheduleResponse } from "@/app/api/user/digest-schedule/route";
import { LoadingContent } from "@/components/LoadingContent";
import { ErrorMessage } from "@/components/Input";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const digestScheduleFormSchema = z.object({
  schedule: z.string().min(1, "Please select a frequency"),
  dayOfWeek: z.string().min(1, "Please select a day"),
  hour: z.string().min(1, "Please select an hour"),
  minute: z.string().min(1, "Please select minutes"),
  ampm: z.enum(["AM", "PM"], { required_error: "Please select AM or PM" }),
});

type DigestScheduleFormValues = z.infer<typeof digestScheduleFormSchema>;

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

const hours = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString().padStart(2, "0"),
  label: (i + 1).toString(),
}));

const minutes = ["00", "15", "30", "45"].map((m) => ({
  value: m,
  label: m,
}));

const ampmOptions = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

export function DigestScheduleForm({
  showSaveButton,
}: {
  showSaveButton: boolean;
}) {
  const { data, isLoading, error, mutate } = useSWR<GetDigestScheduleResponse>(
    "/api/user/digest-schedule",
  );

  return (
    <LoadingContent
      loading={isLoading}
      error={error as { error?: string; info?: { error: string } } | undefined}
      loadingComponent={<Skeleton className="min-h-[200px] w-full" />}
    >
      <DigestScheduleFormInner
        data={data}
        mutate={mutate}
        showSaveButton={showSaveButton}
      />
    </LoadingContent>
  );
}

function DigestScheduleFormInner({
  data,
  mutate,
  showSaveButton,
}: {
  data: GetDigestScheduleResponse | undefined;
  mutate: () => void;
  showSaveButton: boolean;
}) {
  const { emailAccountId } = useAccount();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const schedules = Array.isArray(data) ? data : [];

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
        mutate();
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
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DigestScheduleFormValues>({
    resolver: zodResolver(digestScheduleFormSchema),
    defaultValues: getInitialScheduleProps(data),
  });

  const watchedValues = watch();

  const { execute, isExecuting } = useAction(
    updateDigestScheduleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Your digest settings have been updated!",
        });
        mutate();
      },
      onError: (error) => {
        toastError({
          description:
            error.error.serverError ??
            "An unknown error occurred while updating your settings",
        });
      },
    },
  );

  const onSubmit: SubmitHandler<DigestScheduleFormValues> = useCallback(
    async (data) => {
      const { schedule, dayOfWeek, hour, minute, ampm } = data;

      let intervalDays: number;
      switch (schedule) {
        case "daily":
          intervalDays = 1;
          break;
        case "weekly":
          intervalDays = 7;
          break;
        case "biweekly":
          intervalDays = 14;
          break;
        case "monthly":
          intervalDays = 30;
          break;
        default:
          intervalDays = 1;
      }

      let hour24 = Number.parseInt(hour, 10);
      if (ampm === "AM" && hour24 === 12) hour24 = 0;
      else if (ampm === "PM" && hour24 !== 12) hour24 += 12;

      // Use canonical date (1970-01-01) to store only time information
      const timeOfDay = createCanonicalTimeOfDay(
        hour24,
        Number.parseInt(minute, 10),
      );

      const scheduleData = {
        intervalDays,
        occurrences: 1,
        daysOfWeek: dayOfWeekToBitmask(Number.parseInt(dayOfWeek, 10)),
        timeOfDay: timeOfDay.toISOString(),
      };

      try {
        const response = await fetch("/api/user/digest-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(scheduleData),
        });

        if (response.ok) {
          toastSuccess({ description: "Schedule created successfully!" });
          mutate();
          setShowAddForm(false);
        } else {
          const error = await response.json();
          toastError({
            description: error.error || "Failed to create schedule",
          });
        }
      } catch (error) {
        toastError({
          description: "An error occurred while creating the schedule",
        });
      }
    },
    [mutate],
  );

  return (
    <div className="space-y-6">
      {/* Existing Schedules */}
      {schedules.length > 0 && (
        <div>
          <Label>Current Digest Schedules</Label>
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
        </div>
      )}

      {/* Add Schedule Button */}
      {!showAddForm && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAddForm(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Schedule Time
        </Button>
      )}

      {/* Add/Edit Schedule Form */}
      {(showAddForm || schedules.length === 0) && (
        <form onSubmit={handleSubmit(onSubmit)}>
          <Label className="mb-2 mt-4">
            {schedules.length === 0
              ? "Set up digest schedule"
              : "Add new schedule"}
          </Label>

          <div className="grid grid-cols-3 gap-2">
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
              {errors.schedule && (
                <ErrorMessage
                  message={errors.schedule.message || "This field is required"}
                />
              )}
            </FormItem>

            {watchedValues.schedule !== "daily" && (
              <FormItem>
                <Label htmlFor="dayofweek-select">
                  {watchedValues.schedule === "monthly" ||
                  watchedValues.schedule === "biweekly"
                    ? "on the first"
                    : "on"}
                </Label>
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
                {errors.dayOfWeek && (
                  <ErrorMessage
                    message={errors.dayOfWeek.message || "Please select a day"}
                  />
                )}
              </FormItem>
            )}

            <div className="space-y-2">
              <Label>at</Label>
              <div className="flex items-end gap-2">
                <FormItem>
                  <Select
                    value={watchedValues.hour}
                    onValueChange={(val) => setValue("hour", val)}
                  >
                    <SelectTrigger id="hour-select">
                      {watchedValues.hour}
                    </SelectTrigger>
                    <SelectContent>
                      {hours.map((h) => (
                        <SelectItem key={h.value} value={h.value}>
                          {h.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
                <span className="pb-2">:</span>
                <FormItem>
                  <Select
                    value={watchedValues.minute}
                    onValueChange={(val) => setValue("minute", val)}
                  >
                    <SelectTrigger id="minute-select">
                      {watchedValues.minute}
                    </SelectTrigger>
                    <SelectContent>
                      {minutes.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
                <FormItem>
                  <Select
                    value={watchedValues.ampm}
                    onValueChange={(val) =>
                      setValue("ampm", val as "AM" | "PM")
                    }
                  >
                    <SelectTrigger id="ampm-select">
                      {watchedValues.ampm}
                    </SelectTrigger>
                    <SelectContent>
                      {ampmOptions.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              </div>
              {(errors.hour || errors.minute || errors.ampm) && (
                <div className="space-y-1">
                  {errors.hour && (
                    <ErrorMessage
                      message={errors.hour.message || "Please select an hour"}
                    />
                  )}
                  {errors.minute && (
                    <ErrorMessage
                      message={errors.minute.message || "Please select minutes"}
                    />
                  )}
                  {errors.ampm && (
                    <ErrorMessage
                      message={errors.ampm.message || "Please select AM or PM"}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
          {showSaveButton && (
            <div className="flex gap-2 mt-4">
              <Button type="submit" loading={isExecuting || isSubmitting}>
                {schedules.length === 0 ? "Save" : "Add Schedule"}
              </Button>
              {showAddForm && schedules.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
        </form>
      )}
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

  const initialTimeOfDay = digestSchedule?.timeOfDay
    ? (() => {
        // Extract time from canonical date (1970-01-01T00:00:00Z + time)
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

  const [initHour24, initMinute] = initialTimeOfDay.split(":");
  const hour12 = (Number.parseInt(initHour24, 10) % 12 || 12)
    .toString()
    .padStart(2, "0");
  const ampm = (Number.parseInt(initHour24, 10) < 12 ? "AM" : "PM") as
    | "AM"
    | "PM";

  return {
    schedule: initialSchedule,
    dayOfWeek: initialDayOfWeek,
    hour: hour12,
    minute: initMinute || "00",
    ampm,
  };
}
