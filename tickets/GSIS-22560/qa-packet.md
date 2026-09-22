## GSIS-22560 — a couple of questions before we fix this

We found the cause of the out-of-order Component ID, but the recording alone can't tell us which of two situations actually happened, and the right fix differs slightly for each. Answers below will take a couple of minutes.

**1. Before the test in the recording, was a Component Type deleted in that same context (Exam Controller → Masters → Component Type, same campus/programme selection), even one from an earlier session?**
- ( ) Yes
- ( ) No
- ( ) Not sure / can't tell

**2. Please retest and tell us which of these still happens:**

 a) Add one new Component Type, enter the name, and click **Save** several times quickly on that one row. Does the new ID still skip a number (e.g. list ends at CMP-0063 but the new row shows CMP-0065)?
 - ( ) Yes, still skips  ( ) No, correct now  ( ) Didn't test

 b) Add a new row, then use **Edit All** and click **Save All** several times quickly. Does the new ID skip a number?
 - ( ) Yes, still skips  ( ) No, correct now  ( ) Didn't test

For each, please note: the environment (e.g. QA / GUtech QA / etc.), the date and time you tested, and attach a screenshot or short recording if the result is unexpected.

**3. If a Component Type is deleted, is it acceptable that its number is never reused afterwards (the list keeps a permanent gap where it used to be)?**
- ( ) Yes, that's fine
- ( ) No, the number should be reused

**4. Do the Component IDs that are already out of order or duplicated in QA (from past testing) need to be corrected now, or is it enough that new ones are created correctly going forward?**
- ( ) Fine to leave the existing ones as they are
- ( ) They need to be corrected

Thank you — please answer inline by number when you reply on this ticket.
