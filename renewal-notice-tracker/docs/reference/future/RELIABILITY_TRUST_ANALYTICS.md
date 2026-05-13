# Reliability And Trust Analytics

## Reminder Delivery KPIs
- Reminder delivery success rate
- Reminder duplicate suppression rate

## Cron Processing KPIs
- Cron job success rate
- Cron lag

## Retry KPIs
- Retry recovery rate
- Mean retries per successful delivery

## Extraction KPIs
- Extraction failure rate
- Low-confidence extraction rate

## Review And Trust KPIs
- Review completion rate for extracted contracts
- Time to reviewed contract
- Review correction rate
- Wrong-behavior incident rate

## Admin/Debug KPIs
- Admin/debug rescue rate
- Manual rescue volume

## Visibility KPI
- Visibility of failed work rate

## Dashboards
- Reminder reliability
- Cron and retry operations
- Extraction and review trust
- Admin and incident response

## Warning Thresholds
- Reminder delivery success rate: warning below 98%, critical below 95%
- Cron success: warning below 99%, critical below 97%
- Cron lag: warning when lag exceeds one run interval
- Low-confidence or extraction failure spikes on common docs: escalate
- Review completion backlog aging beyond SLA: investigate
- Manual rescue volume rising multiple weeks: prioritize root-cause work

## Operational Escalation Rules
- Escalate reminder delivery failures immediately when critical thresholds hit
- Escalate duplicate or wrong-behavior incidents as critical trust issues
- Escalate cron lag and cron success deterioration as high-severity ops issues
- Escalate extraction quality spikes to product and engineering
- Escalate repeated manual rescue dependence as systemic reliability debt
