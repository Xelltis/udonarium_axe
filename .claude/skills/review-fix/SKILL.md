---
name: review-fix
description: How to fix code review findings. Report every finding to the user in Japanese, group the findings by area, and fix each area by putting its rule in one place. Use before starting to fix the results of /code-review, and on every round of a "review and fix until clean" loop.
---

# Fixing code review findings

Patching only the line a finding points at leaves the same problem on every other path that goes through the same rule, and it comes back as the next round's finding. This procedure exists to prevent that. The authoritative text is the section 「修正の進め方」 of [docs/coding-guidelines.md](../../../docs/coding-guidelines.md); where the two disagree, that document is right.

## 1. Report (before fixing anything)

Show every finding of the review to the user, in Japanese. The user cannot see the raw output of the review (English JSON).

- For each finding, write where it is and **which operation leads to which result**, without leaving anything out. Do not shrink a finding to one line
- Rate each finding by the scale below, and say that the rating is your own
- Write the count of the round as 「N件（Critical a・High b・Middle c・Low d・Out of scope e）」, and add a table of the counts per round when looping

### Severity scale

There are four levels, Critical, High, Middle and Low. Rate by how bad the effect is and how likely it is to happen.

| Effect \ Likelihood                                                                  | Happens in ordinary use                   | Happens under a specific condition | Rare or a guess (not reproduced) |
| ------------------------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------- | -------------------------------- |
| Cannot be undone (data lost or leaked, a hole in permissions, charges, cannot start) | Critical                                  | High                               | Middle                           |
| Visible to the user (wrong behaviour, slower than before, a feature unusable)        | Middle (High where it blocks a main flow) | Middle                             | Low (write the reason)           |
| Invisible to the user (duplication, maintainability, weak tests, small looks)        | Low                                       | Low                                | Low                              |

Rules that come before the table:

- A finding that stops the tests or CI from noticing something is Middle at least, even where the user sees nothing
- A finding born of your own fix is Middle or higher
- A finding raised again against a rule you already fixed, because the fix did not hold, is raised one level. A new and different finding in the same area is not raised. Raise once only, never again in later rounds, and leave a Low as Low

## 2. Group

Fix in order of severity: Critical first, then High, Middle and Low. A finding that needs a decision from the user is not put off for that: ask at once, and fix it in its turn.

Gather the findings by area (for example "which lines an AI is shown", "handing the turn over"). Count the findings and the deferrals of earlier rounds in the same area too. **Where an area gets a finding for the second time, rebuild it rather than patching it again.**

## 3. For each area, write three things before fixing

1. The rule that is broken
2. Every path that goes through that rule (find them with grep; also check whether a feature outside the change uses the same part)
3. The one place the rule is to be kept

Do not start fixing until the third is settled as one place. Where it is not, either the rule has not been put into words yet, or a shared part is needed.

## 4. Fix

- Do not copy an existing mechanism and bend the copy. Make the shared portion a part first, and have both use it
- Do not list exceptions. Narrow down only what is known to be safe, and give everything else the safe treatment
- Attach the tests to the rule. Shape them to hold on every path that goes through the rule, so that a path left out fails. Confirm that the tests fail with the fix taken out

## 5. Doubt your own fix (before committing)

Write out what the next review would say about the fix, features outside the change that use the same rule included. Where anything written out stands as a finding, fix it first.

## 6. Verify

- On every commit: the related unit specs the hook picks, and lint
- When the fix of an area reaches a stopping point: the type check, and the unit specs of that area
- **Do not run e2e or visual on each round of the loop.** Once the loop is over, run `npm run e2e:related` once, and `npm run e2e:related -- --visual` once where a change touches drawing
- Heavy work runs one at a time over the whole machine (`flock ~/.claude/plans/fx-heavy.lock`)

## 7. Report after fixing

For each finding, write one of these, in Japanese.

- Fixed in full (where the rule was put)
- Fixed in part (what is left)
- Deferred (why)

Keep the deferrals as one list across the rounds, and show it every round. Repeat until no Critical, High or Middle is left, and fix the Low too rather than deferring them.
