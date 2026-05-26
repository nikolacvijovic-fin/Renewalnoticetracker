import { Badge } from "@/components/ui/badge";
import {
  formatReminderRuntimeStatusLabel,
  formatReminderTypeLabel
} from "@/lib/contracts/shipped-reminder-policy";
import { formatDate } from "@/lib/utils";

type Reminder = {
  id: string;
  reminder_type: string;
  remind_at: string;
  recipient_email: string;
  recipient_emails?: string[];
  status: string;
  source: string;
};

function getStatusTone(status: string) {
  if (status === "sent") return "success" as const;
  if (status === "retry_pending" || status === "processing" || status === "pending") {
    return "warning" as const;
  }
  if (status === "failed_terminal") return "danger" as const;
  return "default" as const;
}

export function ReminderTimeline({
  reminders,
  blockedReason
}: {
  reminders: Reminder[];
  blockedReason?: "blocked_by_review" | "blocked_by_missing_owner" | "blocked_by_missing_p0" | null;
}) {
  const ordered = [...reminders].sort((a, b) => a.remind_at.localeCompare(b.remind_at));

  return (
    <div className="panel p-6">
      <h3 className="text-base font-semibold">Reminder timeline</h3>
      <div className="mt-4 space-y-4">
        {ordered.length > 0 ? (
          ordered.map((reminder) => (
            <div key={reminder.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium capitalize">{formatReminderTypeLabel(reminder.reminder_type)}</p>
                  <p className="text-sm text-slate-500">{formatDate(reminder.remind_at)}</p>
                </div>
                <div className="flex gap-2">
                  <Badge tone={getStatusTone(reminder.status)}>
                    {formatReminderRuntimeStatusLabel(reminder.status)}
                  </Badge>
                  <Badge>{reminder.source}</Badge>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {(reminder.recipient_emails ?? [reminder.recipient_email]).join(", ")}
              </p>
            </div>
          ))
        ) : blockedReason ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {blockedReason === "blocked_by_review"
              ? "Trusted reminders are blocked until the P0 review is completed."
              : blockedReason === "blocked_by_missing_owner"
                ? "Trusted reminders are blocked until an owner is assigned."
                : "Trusted reminders are blocked until a reminder-driving date is confirmed."}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No reminders scheduled yet.</p>
        )}
      </div>
    </div>
  );
}
