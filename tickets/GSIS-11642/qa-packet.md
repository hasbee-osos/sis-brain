**GSIS-11642 — Application attachment expire notification — questions before the fix can be finished**

We found the root cause: the notification job silently skips every application attachment (it only looks for a business entity value that is never actually stored), so it has never fired for anyone. Fixing that alone isn't enough — two behaviour questions need an answer first, because they change what the fix actually does.

**Q1. When should the applicant be notified, and how many times?**
The current code and the notification's own wording disagree with each other, so we can't tell which was intended:

| Option | Behaviour |
|---|---|
| A | Remind the applicant **every day** for the 7 days before an attachment expires (so up to 7 emails for the same document) |
| B | Send **exactly one** reminder, a fixed number of days before expiry (e.g. 7 days before) |
| C | Send **exactly one** notification **on the expiry date itself** |
| Other | describe it in one line |

Please answer with the letter (and, for B, how many days before).

**Q2. What about attachments that are already expired or expiring soon, once this goes live?**
This notification has never sent a single email before, so the first run after the fix ships would notify for every attachment across every campus that currently falls in the window above — a large batch of applicants all at once.

| Option | Behaviour |
|---|---|
| A | Send that catch-up batch — it's fine for everyone currently in the window to be notified once the fix ships |
| B | Only notify for attachments whose expiry date is **after** the fix goes live; skip the existing backlog |
| Other | describe it in one line |

Please answer with the letter.

---
*Paste your answers as a comment on this ticket, referencing Q1 and Q2 by number. Once posted, re-run `/work GSIS-11642` to continue.*
