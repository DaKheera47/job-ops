import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { ApplicationStage } from "../../shared/types";

const logEventSchema = z.object({
  stage: z.string(),
  title: z.string().min(1, "Title is required"),
  date: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
  reasonCode: z.string().optional(),
  salary: z.string().optional(),
});

export type LogEventFormValues = z.infer<typeof logEventSchema>;

interface LogEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLog: (values: LogEventFormValues) => Promise<void>;
  currentStage: ApplicationStage | null;
}

const STAGE_OPTIONS = [
  { label: "No Stage Change (Keep current status)", value: "no_change" },
  { label: "Applied", value: "applied" },
  { label: "Recruiter Screen", value: "recruiter_screen" },
  { label: "Assessment", value: "assessment" },
  { label: "Interview", value: "technical_interview" },
  { label: "Offer", value: "offer" },
  { label: "Rejected", value: "rejected" },
  { label: "Withdrawn", value: "withdrawn" },
  { label: "Closed", value: "closed" },
];

const REASON_CODES = ["Skills", "Visa", "Timing", "Culture", "Unknown"];

const toDateTimeLocal = (value: Date) => {
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(
    value.getMinutes(),
  )}`;
};

export const LogEventModal: React.FC<LogEventModalProps> = ({
  isOpen,
  onClose,
  onLog,
  currentStage,
}) => {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LogEventFormValues>({
    resolver: zodResolver(logEventSchema),
    defaultValues: {
      stage: "no_change",
      title: "Update",
      date: toDateTimeLocal(new Date()),
      notes: "",
    },
  });

  const selectedStage = watch("stage");

  React.useEffect(() => {
    if (isOpen) {
      reset({
        stage: "no_change",
        title: "Update",
        date: toDateTimeLocal(new Date()),
        notes: "",
      });
    }
  }, [isOpen, reset]);

  React.useEffect(() => {
    if (selectedStage === "no_change") {
      setValue("title", "Update");
    } else {
      const option = STAGE_OPTIONS.find((o) => o.value === selectedStage);
      if (option) {
        setValue("title", option.label);
      }
    }
  }, [selectedStage, setValue]);

  const onSubmit = async (values: LogEventFormValues) => {
    await onLog(values);
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Log Event</AlertDialogTitle>
          <AlertDialogDescription>
            Record a new update or stage change for this application.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field>
            <FieldLabel>New Stage</FieldLabel>
            <Controller
              name="stage"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[errors.stage]} />
          </Field>

          <Field>
            <FieldLabel>Event Title</FieldLabel>
            <Input {...register("title")} placeholder="e.g. Recruiter Screen" />
            <FieldError errors={[errors.title]} />
          </Field>

          <Field>
            <FieldLabel>Date</FieldLabel>
            <Input type="datetime-local" {...register("date")} />
            <FieldError errors={[errors.date]} />
          </Field>

          <Field>
            <FieldLabel>Notes (Optional)</FieldLabel>
            <Textarea {...register("notes")} placeholder="Add details..." />
            <FieldError errors={[errors.notes]} />
          </Field>

          {selectedStage === "rejected" && (
            <Field className="animate-in fade-in slide-in-from-top-1 duration-200">
              <FieldLabel>Reason</FieldLabel>
              <Controller
                name="reasonCode"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {REASON_CODES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}

          {selectedStage === "offer" && (
            <Field className="animate-in fade-in slide-in-from-top-1 duration-200">
              <FieldLabel>Salary / Details</FieldLabel>
              <Input {...register("salary")} placeholder="e.g. £50k + bonus" />
            </Field>
          )}

          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel type="button" onClick={onClose}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Logging..." : "Log Event"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};
