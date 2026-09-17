**Dev analysis for QA: a retest and one business-rule answer needed before any fix**

**Summary**
Rule copying from GSIS-20628 exists. When a Module Offering, Programme Study Plan or student study plan is **created**, it takes a copy of the rules from the level above. Saving a rule at Module Master does **not** update offerings or study plans that already exist, so records created before the rule was saved stay empty. We need to confirm this is what you hit. Separately, in the recording the Student Eligibility Forecast does report co-requisite violations for the student, while the study plan PDF shows none. That suggests the student may have rules that the PDF isn't displaying.

**Retest steps** (on the same environment as the recording, OSOS staging, or base-qa)
1. Admin → Master → Module: pick a module with **no** existing offering, and save a Co-Requisite (and a Pre-Requisite) rule.
2. Admin → Master → Module Offering: create a **new** offering for that module and open its requisite tabs.
3. Admin → Master → Study Plan: add that offering's module to a **new or unused** programme study plan and open its requisite tabs.
4. Enrol a **new** student into that study plan → Student Portal → Academics → Study Plan: check the module's rules on screen **and** in Preview Study Plan (PDF).
5. Then, on a module that **already** has an offering and study plans, add a rule at Module Master and repeat the checks in 2–4 without creating anything new.

**Please reply with**
1. **Retest result** (environment + date/time):
   * New records (steps 2–4): Offering shows rule Y/N · Programme Study Plan shows rule Y/N · Student study plan screen shows rule Y/N · Student PDF shows rule Y/N
   * Existing records (step 5): Offering Y/N · Programme Study Plan Y/N · Student study plan Y/N
2. **In the original test, were the offering, programme study plan and student plan created before the rule was saved at Module Master?** It decides whether rule copying is broken or only missing for existing records. Y (before) / N (after) / don't know
3. **What actually went wrong for the student?** It decides which part we fix first.
   * (a) rules not shown on the study plan screens / PDF
   * (b) pre-registration or registration let the student through (or blocked them) wrongly
   * (c) the Eligibility Forecast result was wrong
   * (d) other: ______
4. **Expected rule (please confirm with the product owner):** when a rule is added or changed at Module Master **after** offerings and study plans already exist:
   * (a) update all existing offerings, programme study plans and student study plans, except where that rule type was already overridden at that level
   * (b) update all of them, overwriting any lower-level changes
   * (c) only new offerings/study plans created afterwards get it (existing ones are changed by hand)
   * (d) other: ______

If a check fails, please attach a screenshot of the offering's and programme study plan's requisite tabs (steps 2–3 are not in the current recording), and say which module and rule you used.
