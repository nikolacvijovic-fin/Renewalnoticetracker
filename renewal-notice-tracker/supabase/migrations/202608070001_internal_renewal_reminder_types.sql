alter table public.reminders
  drop constraint if exists reminders_reminder_type_check;

alter table public.reminders
  add constraint reminders_reminder_type_check
  check (
    reminder_type in (
      'notice_deadline',
      'renewal',
      'expiration',
      'decision_request',
      'acknowledgment_request',
      'internal_review_needed',
      'missed_notice_deadline',
      'custom'
    )
  );
