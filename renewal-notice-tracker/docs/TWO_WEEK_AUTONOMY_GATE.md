# Two-Week Autonomy Gate

Phase 1 is not release-ready if a normal customer workflow still depends on hidden founder rescue.

## Pass criteria

Over two consecutive weeks, a normal operator team can:

- upload/import
- review P0
- assign owner
- see trusted reminders
- acknowledge
- record decision
- close/reopen
- export if needed
- recover from ordinary failure states without founder interpretation

## Ordinary failure states that must stay operator-supportable

- partial import success with row-level cleanup needed
- reminders blocked by review
- reminders blocked by missing owner
- reminder delivery retries or visible failures
- manual invoice exception routing through support-led billing paths

## Hidden rescue that fails release

- founder manually fixing import silently
- founder triggering reminders manually
- founder interpreting review states live
- founder editing DB/admin data outside audited rescue

## Rule

If the workflow only passes because a founder privately interprets state, edits data, or manually triggers reminders, Phase 1 is not done even if technical tests are green.
