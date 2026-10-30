# Stay on Supabase or move to Cloud SQL — 2026-10-30

Short version: **moving is the better long-term setup, but there is no urgency.** The shop works today. Flip when you have a quiet evening, not before.

## Staying as it is (Supabase)

**Pros**
- Nothing to do. Login, Google sign-in, password reset all keep working as they do today.
- Supabase Auth is a managed service: password hashing, sessions and reset emails are their problem.
- Zero risk of a bad cutover evening.

**Cons**
- Free tier pauses the database after ~7 idle days. We run a keep-awake cron just to stop that. If it ever pauses, the whole shop is down until someone clicks "restore".
- Two clouds, two bills, two consoles: Cookie Doh on Supabase, the back office and TBS on Google Cloud.
- Cookie Doh data and TBS data can never be joined in one query (members, orders, rewards). Every cross-link goes through the partner API.
- Backups: free tier has daily backups only, no point-in-time restore.
- Supabase region is Singapore; your customers and the ERP are in Jakarta. Small, but real.

## Moving to Cloud SQL (already built, loaded 28 Oct)

**Pros**
- One cloud, one bill, one set of backups (30 daily + 7-day point-in-time restore, already on).
- Never pauses. The keep-awake cron goes away.
- Same Google project as the ERP: Cookie Doh and TBS tables sit next to each other, so unified rewards and reporting become normal SQL instead of API hops.
- Jakarta region (asia-southeast2), closer to customers and the ERP.
- Rollback is instant: remove the 3 switches and you are back on Supabase with nothing lost.

**Cons**
- Login becomes our own code instead of Supabase's. It is built and tested, but it is now ours to maintain.
- Your 8 members: password users carry over as-is; the 6 Google users sign in again once (Google client is already set up).
- Costs money: a small Cloud SQL instance is roughly USD 10 to 15 a month more than Supabase free. It shares the project with the ERP, so it is one invoice.
- One cutover evening with a short write freeze (about an hour). The shop is quiet, so low impact.
- Two code bits still to finish before the flip: move /tbs onto the shared data client, and reload today's TBS content into Cloud SQL. Half a day.

## Recommendation

Move, but not this week. Order of events:
1. I finish the two code bits (half a day).
2. You paste the 8 variables from OWNER-STEPS.md on a quiet evening.
3. I do the final data refresh, flip, and test every login path. If anything is off, switches out, back to today.

If you decide to stay, delete nothing: the Cloud SQL instance can sit idle, and we revisit when unified rewards needs the shared database.
