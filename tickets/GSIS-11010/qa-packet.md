**Dev analysis: retest needed before any fix**

**Summary**
Both notifications failed for the reason given in the June 2025 comment: no recipients were passed when the notification was sent. The send stopped with an error before the email step, so neither the in-app notification nor the email went out. The screen recordings attached here match this: the "schedule" and "status update by student" emails arrive, but the cancel and applicant-deleted emails don't, for any recipient.

Since then, three fixes under other tickets have corrected this code:
* GSIS-17509 (Jun 2026): applicant deleted
* GSIS-25660 (Jul 2026): schedule cancelled
* GSIS-26324 (Jul 2026): notification service, empty recipient list

All three are deployed to **base-qa, gcet-qa and gutech-qa**, so the bug may already be fixed. Please retest on the current build before we change any code.

**Retest steps** (on any one of base-qa / gcet-qa / gutech-qa)
1. As HOD, create an Evaluation Schedule with an examiner, add one applicant, and Submit.
2. As the applicant, accept the schedule.
3. **Issue 1:** as HOD, cancel the schedule.
4. **Issue 2:** on a second schedule (steps 1–2 again), Edit, then delete the accepted applicant, then Update.
5. After each action, check the **applicant's** and the **examiner's** email and in-app notifications.

**Check email first.** In the recordings, the applicant didn't get *any* in-app notification from these schedules, not even the "schedule" one whose email arrived. So the in-app channel for applicants fails on every event, and a missing in-app notification alone doesn't prove this bug. See question 5.

**Please reply with**
1. **Result on the current build** (environment + date/time of the test):
   * Issue 1, cancel: email received by applicant Y/N · by examiner Y/N · in-app Y/N
   * Issue 2, delete applicant: email received by applicant Y/N · by examiner Y/N · in-app Y/N
2. **Who should get the "applicant deleted" notification?** The original requirement (GSIS-2701) says only the removed applicant. This ticket expects the student and the supervisor.
   * (a) removed applicant only
   * (b) removed applicant + the schedule's examiners
   * (c) other: ______
3. **"Supervisors" means the schedule's examiners**, i.e. the faculty members assigned on the schedule. In the recordings, the inbox checked was the examiner's. Correct? Y/N. If not, who: HOD / schedule creator / other?
4. **Cancel recipients:** today, cancel notifies every applicant on the schedule, including those who rejected it. Should it notify only applicants who accepted or are still pending? Y/N
5. **In-app for applicants:** is it known that applicants don't receive in-app notifications at all (for any event)? Is there a ticket for it? We plan to keep that out of this ticket.

If the retest still fails, please note the exact time of the cancel and delete actions, so we can match them against the backend logs.
