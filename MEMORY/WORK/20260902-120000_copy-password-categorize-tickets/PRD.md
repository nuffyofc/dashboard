---
task: Copy password-protected code, expand ticket categorization
slug: 20260902-120000_copy-password-categorize-tickets
effort: advanced
phase: observe
progress: 0/25
mode: interactive
started: 2026-09-02T12:00:00Z
updated: 2026-09-02T12:05:00Z
---

## Context

User has a fixed/updated version of the dashboard in boss-table-dashboard_1 that adds password-gated access via auth.js + SHA-256 hashing. They want these files copied to the current repo, committed and pushed. They also want the ticket category system expanded: analyze aug_fromdb.xlsx (100 random rows), read description/comment fields (English text), derive better category definitions, expand the dropdown, and improve auto-categorization accuracy.

### Risks
- xlsx may not have a "Description" or "Comment" column in a standard name — need to inspect actual column headers
- Copying files may overwrite customizations in the current repo's rules.js
- Category expansion must not break existing manual overrides in localStorage
- New regex patterns must be tested against real ticket data

## Criteria

- [ ] ISC-1: auth.js copied from source to assets/auth.js in current repo
- [ ] ISC-2: index.html updated to include auth gate script tag
- [ ] ISC-3: app.js updated from source version
- [ ] ISC-4: rules.js updated from source version as base
- [ ] ISC-5: style.css updated from source version
- [ ] ISC-6: Password displayed to user in response
- [ ] ISC-7: xlsx file opened and column headers identified
- [ ] ISC-8: 100 random rows sampled from xlsx data
- [ ] ISC-9: Description/comment/summary fields read for ticket context
- [ ] ISC-10: Category count expanded beyond 6 (at least 10 categories)
- [ ] ISC-11: New categories derived from patterns found in xlsx data
- [ ] ISC-12: UI Bug category rules preserved and expanded
- [ ] ISC-13: Game Issue category rules preserved and expanded
- [ ] ISC-14: Bet Settlement category rules preserved and expanded
- [ ] ISC-15: Win Calculation category rules preserved and expanded
- [ ] ISC-16: Bonus category rules preserved and expanded
- [ ] ISC-17: Payment/Currency category rules preserved and expanded
- [ ] ISC-18: At least 4 new categories added based on xlsx analysis
- [ ] ISC-19: Each new category has minimum 3 keyword patterns
- [ ] ISC-20: DEFAULT_CATEGORIES array updated in rules.js with new categories
- [ ] ISC-21: Auto-categorization confidence logic unchanged (score/(score+2), threshold 0.34)
- [ ] ISC-22: git commit includes all 5 modified/new files
- [ ] ISC-23: git push to origin/main succeeds
- [ ] ISC-24: localStorage key names unchanged (bossTable.categories.v1 etc)
- [ ] ISC-A1: No existing manual overrides broken by new category structure

## Decisions

## Verification
