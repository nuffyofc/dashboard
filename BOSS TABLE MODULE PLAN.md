# Boss Table Module — architecture plan (v1, search/sort/group over the shared ticket store)

This is a new module layered on top of the online dashboard already planned in `online_dashboard_architecture_plan.md` (cloud Postgres, Streamlit, MVP-first). It does not replace that plan — it answers a new, more specific ask: "build this like a SaaS," clarified through a Q&A round into a concrete, scoped v1. This doc records those decisions and the resulting build.

**Status: v1 shipped — see Part 7. The architecture below (Parts 0–6) is what was planned before a second Q&A round changed the delivery target to a static GitHub Pages site; Part 7 records what that changed and what stayed the same. Kept in full because Parts 2–4's data model (categories, overrides, auto-categorizer) is exactly what shipped, just on localStorage instead of Postgres — re-pointing it at a real backend later is a small change, not a rebuild.**

---

## Part 0 — Decisions locked in from the Q&A round

- **Audience:** internal only — you, your boss, the support team. Single tenant. "SaaS" here means *a real cloud web app instead of Excel*, not a multi-customer product with signup/billing. No auth complexity beyond what's already planned (shared password); per-user accounts stay a flagged future option, not a v1 requirement.
- **Data source:** both — manual CSV/Excel upload (like `Ticket Ledger`, already built) *and* the live Jira pull already planned in `ticket_dashboard_architecture_plan.md` (`dashboard.py` → `kb.db` → `push_to_cloud.py` → Postgres). Both paths land in the same Postgres tables; the web app doesn't care which one populated a row.
- **Category taxonomy:** your Excel's own list (`Tickets_Miha_1_jul_aug.xlsx`, sheet `LISTS`) — *UI Bug, Game Issue, Bet Settlement, Win Calculation, Bonus, Payment* — not the Boss View prototype's five categories. You expect this list to grow as more real data comes in, so it's a lookup table you can extend, not a hardcoded enum.
- **Manual corrections (category, partner, "Next Action"):** saved only in this app's own database. Jira and Zendesk are never written back to — no write-API access needed, no risk of clobbering source data on a re-sync.
- **v1 scope:** explicitly *just the ticket table, done well* — advanced keyword search, sorting on any column, and grouping by partner, by category, and by date. The Boss View prototype's other panels (root-cause hotspots, team workload/SLA, AI triage, the weekly email) are real, useful ideas but are **deferred**, not built now. The data model below is shaped so none of them require rework later.

---

## Part 1 — What "Tickets_Miha_1_jul_aug.xlsx" actually is

Worth naming plainly since it shaped a decision above: the main sheet (958 rows) turned out, on closer inspection while building the importer, to be a **real, mostly-complete export of 952 tickets** — `URL JIRA`, `Customer`, and a subject-like string (landed in the `Product` column) are populated for nearly every row; only `Summary` and `Next Action` are consistently empty. (An earlier, shallower read of just the first few rows made this look like a half-started manual tracker — it isn't; it's a genuine historical SUP dataset, just with the ticket subject sitting in an oddly-named column.) The `LISTS` sheet is a set of dropdown value lists prepared for data-validation columns that were never wired up (Category, Priority, Status, Workflow stage, Role) — the category list from it is real intent, and is what seeds the `categories` table/list. The `DASHBOARD` sheet is five KPI labels with `Manual/Formula` placeholders — a sketch of what you wanted computed, not a working formula sheet.

This also explains why the shipped v1's auto-categorizer leaves a large share of this file's rows "Uncategorized": a lot of the real volume is setup/onboarding tickets (`SOFTSWISS ... new brand ...`, `REF [GAS-...]`) and administrative/verification requests that don't fit cleanly into the six gameplay/bug-oriented categories from the `LISTS` sheet. That's expected, not a bug — it's the concrete evidence for "categories will need to grow as more data comes in," and the next real category to add is almost certainly something like *Setup/Onboarding*.

---

## Part 2 — Data model additions (as planned; see Part 7 for what actually shipped)

The schema already designed in `ticket_dashboard_architecture_plan.md` / `schema_postgres.sql` (`tickets`, `comments`, `status_history`, `attachments`, `issue_links`, `sync_log`, `zendesk_import`, `block_events`) stays as-is — this module adds two new tables rather than touching it, which is what makes "corrections never touch Jira/Zendesk" true by construction:

```sql
-- Extensible category list, seeded from Tickets_Miha_1_jul_aug.xlsx's LISTS sheet.
-- A real table (not an enum) because you told us this list will grow.
CREATE TABLE categories (
    id          SERIAL PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO categories (name) VALUES
    ('UI Bug'), ('Game Issue'), ('Bet Settlement'),
    ('Win Calculation'), ('Bonus'), ('Payment');

-- One row per ticket, layered on top of the read-only tickets table.
-- This is the ONLY place manual edits live — re-syncing tickets from
-- Jira/Zendesk never touches this table, so a correction is never lost
-- or overwritten by a fresh pull.
CREATE TABLE ticket_overrides (
    ticket_key       TEXT PRIMARY KEY REFERENCES tickets(ticket_key),
    category_id      INTEGER REFERENCES categories(id),
    category_source  TEXT NOT NULL DEFAULT 'auto' CHECK (category_source IN ('auto','manual')),
    category_confidence REAL,              -- 0..1, set by the auto-categorizer; NULL if set manually
    partner_override TEXT,                 -- overrides tickets.requester when set
    next_action      TEXT,
    updated_by       TEXT,                 -- free-text name, see Part 5 on auth
    updated_at       TIMESTAMPTZ
);
```

Every read the dashboard does is `tickets LEFT JOIN ticket_overrides` — a ticket with no override row yet just shows as uncategorized, no special-casing needed in the queries.

---

## Part 3 — Auto-categorization

A small rule-based classifier runs once per ticket, at ingest time (both the CSV-upload path and the Jira-sync path call it), and writes a suggested `category_id` + `category_confidence` into `ticket_overrides` when there's no existing manual override:

- Keyword/regex rules against the ticket's subject + description text — e.g. "bet limit", "min/default stake" → *Bet Settlement*; "RTP", "multiplier", "symbol" → *Win Calculation*; "currency", "enable ... currency", "GAS-" (SOFTSWISS setup refs) → closer to *Bonus/Payment* or a new category once you see the real spread; layout/rendering complaints → *UI Bug*.
- Confidence is deliberately simple at first — a match count / keyword-weight score, not ML — because the immediate need is "don't leave everything uncategorized," not precision. Low-confidence guesses are still shown (so the table isn't half-empty), but visually distinguished (e.g. a muted "auto: Payment?" badge vs. a solid "Payment" badge) so a human knows which ones are worth a second look.
- Because you flagged that the category list itself will grow, the ruleset is a small config table/file (`category_rules`) mapping patterns → category name, not buried in application code — adding a new category and its rules should be a data change, not a deploy.
- The very first real run against a decent-sized batch (a few hundred real tickets) should be checked by eye before trusting it further, same "small batch first" discipline used everywhere else in this project.

---

## Part 4 — The table itself (the actual v1 deliverable)

One page, one table, built for the three things you asked for by name:

**Advanced keyword search.** A single search box that matches across subject, customer/partner, category, and next-action text — not just a naive substring scan: a Postgres trigram index (`pg_trgm` + `GIN`) on the searchable columns, so "contains" search stays fast as the table grows toward the tens of thousands of rows the full historical pull will eventually produce. Supports simple multi-term queries (space-separated terms all must match, like a normal search box) — full boolean/quoted-phrase query syntax is a nice-to-have, not required for v1.

**Sorting.** Click any column header — ticket ID, status, customer, category, created, updated, resolution time — ascending/descending, same interaction as `Ticket Ledger` already has.

**Grouping.** A "Group by" selector with three options — **Partner** (customer/requester), **Category**, **Date** (bucketed by day/week/month, your choice via a toggle). Chosen grouping renders as a collapsed summary (group name, ticket count, and a couple of useful aggregates — e.g. avg./median resolution time, oldest open ticket in the group) with each row expandable/clickable to drill into the full flat table filtered to just that group. This is a real pivot-style view, not just a sorted column — grouping by "sorting" alone loses the count/aggregate value groups are for.

**Inline editing.** Category, Partner (when you want to override a messy `Customer` value), and Next Action are editable directly in the table (Streamlit's `st.data_editor` covers this without a custom frontend). Saving a row writes to `ticket_overrides` with `updated_by` and `updated_at` set — see Part 5 for what `updated_by` actually is without building real accounts.

Deliberately still out of v1, per your answer: no hotspot/root-cause panel, no team workload/SLA KPIs, no AI triage, no weekly email digest. All four fit cleanly on top of this data model later — hotspot detection and SLA are just different aggregate queries over `tickets`/`ticket_overrides`, and AI triage/weekly email are consumers of the same category data, not a different foundation.

---

## Part 5 — Auth and "who edited this"

Per the existing plan, a single shared password still gates the whole app — no change there. But inline editing means it's worth knowing *who* changed a category or wrote a Next Action, without building real per-user login for an internal team of a few people. The lightweight middle ground: on first use in a browser session, the app asks for a name (a plain text field, stored in Streamlit session state, not a login) and stamps every edit's `updated_by` with it. It's an honor system, not access control — fine for a few trusted internal users, and upgrading to real per-person logins later (flagged as deferred in the original plan too) doesn't require touching this column, just how it gets populated.

---

## Part 6 — Ingestion paths, both feeding the same tables

1. **Manual upload**, extended from what `Ticket Ledger` already does: the importer needs to recognize *two* shapes now — the Zendesk CSV shape (`ID, Ticket status, Subject, Requester, Requested, Priority, Updated`) and the Jira export shape seen in `Tickets_Miha_1_jul_aug.xlsx` (`URL JIRA, Customer, Product, Summary, Next Action` — ticket key parsed out of the JIRA URL). Both normalize into the same `tickets` row shape; upload runs the auto-categorizer on any newly-seen ticket before writing.
2. **Live Jira sync**, unchanged from `ticket_dashboard_architecture_plan.md` / `online_dashboard_architecture_plan.md` — `dashboard.py`'s pulls write to local `kb.db`, `push_to_cloud.py` upserts into the same cloud Postgres this module reads from. The auto-categorizer runs there too, at push time, so a ticket gets a category suggestion regardless of which path brought it in.

---

## Build order (as originally planned)

1. **Schema migration** — add `categories` (seeded from your Excel's list) and `ticket_overrides` to the existing Postgres schema. Small, additive, no change to existing tables.
2. **Auto-categorizer** — the rule table + matching function, run against a real batch and checked by eye before trusting it, same discipline as every other "first run" in this project.
3. **Importer update** — teach the CSV/Excel upload path to recognize the Jira-export shape alongside the Zendesk shape, both writing to the same `tickets` rows and triggering categorization.
4. **The table page** — search (with the trigram index), sort, group-by-with-drilldown, and inline editing wired to `ticket_overrides`, plus the name-stamp for `updated_by`.
5. **Wire the existing Jira push (`push_to_cloud.py`) to also run the categorizer** so both ingestion paths stay in sync on this behavior.
6. **End-to-end test** with real data from both paths (a manual CSV/Excel upload and a real `push_to_cloud.py` run), same as the existing plan's step 6.

---

## Part 7 — What actually shipped (v1, real build)

A second Q&A round, right before building, changed the delivery target: you asked for a **GitHub repo deployed as a static site on GitHub Pages, on a custom domain (once you have one)**. GitHub Pages serves static files only — no Python, no Streamlit, no server-side code — which rules out Part 4's original Streamlit/`st.data_editor` plan and Part 0's Postgres data source outright (a static page can't hold database credentials safely). Rather than reopen the whole plan, the follow-up questions narrowed it to what was actually needed: no shared backend for v1 ("Brez deljene baze - samo lokalno v brskalniku" — no domain yet either, default `*.github.io` URL is fine for now).

**What this changed:** Parts 2's two Postgres tables became two `localStorage` structures instead (`bossTable.overrides.v1`, `bossTable.categories.v1`) — same shape, same rule ("corrections never touch Jira/Zendesk," now true because there's no write path to them at all, not just by policy). Part 5's auth question disappeared — there's no shared state to gate. Part 6's "live Jira sync" stays exactly what it always was structurally (a separate local pull, `dashboard.py`, unaffected by this decision) but no longer pushes to a database this app reads from directly; its output is just another export the static page can be handed, same as a Zendesk CSV.

**What didn't change:** the category taxonomy (your Excel's `LISTS` sheet — see Part 1's note on why a lot of this real data lands "Uncategorized" for now), the auto-categorizer's design (Part 3 — same weighted-keyword-rule approach, now in `assets/rules.js`), and the table itself (Part 4's search/sort/group/inline-edit feature set — all shipped, just reading/writing browser storage instead of Postgres).

**Repo:** `ticket-boss-dashboard/` (delivered to you as a zip with git history intact, since this session has no push access to your GitHub account — see the repo's own `README.md` for the exact `git remote add` / `git push` and GitHub Pages "Settings → Pages" steps). Files: `index.html`, `assets/app.js` (state, import, filter/sort/group, editing), `assets/rules.js` (category list + rules — the file to edit as the taxonomy grows), `assets/style.css` (navy/gold theme, matching your `boss_view_prototip.html` palette rather than inventing a new one), `assets/vendor/xlsx.full.min.js` (SheetJS, vendored into the repo rather than loaded from a CDN — parses both `.csv` and `.xlsx` with one library, and keeps the page's "nothing leaves your browser" claim true with zero external network calls).

**Verified before delivery:** imported both real files with a headless browser and no console/runtime errors — the Zendesk CSV (79 tickets, 47 uncategorized, 35 partners) and `Tickets_Miha_1_jul_aug.xlsx` (952 real tickets, not the ~5-row stub it first looked like — see Part 1); checked flat view, grouped-by-partner (with per-group count + avg idle days), and category-editing interactions render correctly.

**Upgrade path, unchanged from Part 5/6's spirit:** if shared team editing becomes worth the added complexity, the repo's `README.md` points at swapping the `localStorage` calls in `app.js` for a Supabase client (hosted Postgres + auto REST API) — the closest thing to Part 2's original schema without hand-building a backend server, and the natural next step if this plan's original Postgres-backed vision is revisited later.