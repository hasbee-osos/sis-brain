**Dev analysis for QA: we need one business decision and one record check before fixing**

**Summary**
We found why Configure Fee shows the old Credit Point. When a module is added to a Module Offering, its Credit Points are copied onto that offering. Configure Fee (Tuition Fee) fills Credit Points from that offering copy, not from the Module. Editing the Module later (1 → 0) does not update the copy, so new fee rows still get 1. We also found that a Credit Point of 0 would currently fill in as blank rather than 0, and we will fix that in any case.

**Record check** (on the environment where the bug was reproduced)
1. Super Admin: Administration > Master > **Module Offering**, then open the offering that contains the module used in the recording (Dept of Mechanical Engineering).
2. Open that module's line in the offering and note the **Credit Points** shown there.

Note: the recording shows 0 in the Configure Fee field with the cursor in it. We could not see the 1 in the recording, so please confirm what the field auto-fills before you type anything.

**Please reply with**
1. **Record check result** (environment + date/time of the test):
   * Credit Points on the Module Offering line: ____
   * Was the offering created before the Module was changed from 1 to 0? Y/N/unknown
   * On Configure Fee > Tuition Fee > new row, selecting that module auto-fills: ____ (before typing anything)
2. **Which Credit Point should Configure Fee use?** This decides the fix and how far it reaches.
   * (a) Always the **Module's** Credit Points. Any different value set on a Module Offering is ignored for fees.
   * (b) The **Module Offering's** Credit Points, but editing a Module also updates all its offerings. This also changes the credits used in course registration for those offerings.
   * (c) Working as designed. Users must update Credit Points on the Module Offering too. We only fix the 0-shown-as-blank issue.
   * (d) other: ______
3. **Scope:** should the same fix apply to the other Configure Fee grids that pick a module (Appeal, Resit, Repeat, Review fees), or only Tuition Fee? All / Tuition only

If the auto-fill in step 1 shows 0 rather than 1, please attach a screenshot and the exact time of the check.
