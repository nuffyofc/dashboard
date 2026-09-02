# GA Support · Boss Table

A single-page, no-backend web app that turns a Zendesk or Jira ticket export
(`.csv` or `.xlsx`) into a searchable, sortable, groupable table — auto-tagged
by category, with room to correct things by hand.

**Live data, zero server.** Everything — parsing the file, guessing
categories, remembering your edits — runs in your browser. Nothing is
uploaded anywhere, which is also the main tradeoff to know going in: your
categorizations and Next Action notes live in *your* browser's local
storage, not a shared database. If two people open this page in two
different browsers, they don't see each other's edits. See
["Why no shared database, and how to add one later"](#why-no-shared-database-and-how-to-add-one-later)
if that becomes a problem worth solving.

## Using it

1. Open `index.html` directly in a browser (or visit the GitHub Pages URL
   once this repo is published — see below).
2. Click **"Naloži izvoz"** or drag a `.csv`/`.xlsx` file anywhere onto the
   page. It recognizes:
   - a Zendesk unsolved-ticket export (`ID, Ticket status, Subject,
     Requester, Requested, Priority, Updated`)
   - a Jira export like `Tickets_Miha_1_jul_aug.xlsx` (`URL JIRA, Customer,
     Product, Summary, Next Action`, ticket key parsed out of the Jira URL)
   - most other reasonably-named ticket exports — column matching is
     alias-based (see `assets/app.js`, `ALIASES`), not a rigid fixed format
3. Every ticket gets an automatic category guess (see next section). Click
   any category cell to correct it, click a Partner or Next Action cell to
   edit it — changes save immediately to your browser.
4. Search, sort by clicking column headers, or group by Partner / Category
   / Date (day, week, or month) using the toolbar. Grouped view shows a
   count and an average resolution/idle time per group, and expands into
   the full row list on click.
5. Re-uploading a fresh export later keeps every manual edit you've made —
   matching is by ticket ID/key, so only genuinely new tickets get a fresh
   auto-guessed category.

## Extending categories

The category list and the rules that auto-suggest them live in
`assets/rules.js`, deliberately separate from the app logic. As you review
real data and find the current six categories (seeded from your Excel's
`LISTS` sheet) aren't enough, or a rule is mis-firing:

- **Add a category from the app itself** — the "+ Dodaj" box next to the
  Group-by selector adds a category to your browser's list immediately, no
  file editing needed. (It won't have auto-matching rules yet — tickets in
  it will need manual tagging until you add a rule for it.)
- **Add or tune a matching rule** — edit the `RULES` array in
  `assets/rules.js` (a regex pattern plus a weight per category) and
  commit. This is a plain data change, not a rewrite — every existing
  "auto"-tagged ticket gets re-scored against the updated rules the next
  time you import a file, without touching anything you've tagged by hand.

## Deploying to GitHub Pages

This is a plain static site — no build step, no dependencies to install.

1. Create a new repository on GitHub and push this folder to it:
   ```
   git remote add origin https://github.com/<you>/<repo>.git
   git branch -M main
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: "Deploy
   from a branch"**, branch `main`, folder `/ (root)`. Save.
3. GitHub gives you a URL like `https://<you>.github.io/<repo>/` within a
   minute or two.

### Adding a custom domain later

Once you have a domain:

1. At your domain's DNS provider, add a `CNAME` record pointing your chosen
   subdomain (e.g. `tickets.yourdomain.com`) at `<you>.github.io`. (For an
   apex/root domain instead of a subdomain, GitHub's docs list the A
   records to use instead of a CNAME.)
2. In this repo, create a file named exactly `CNAME` (no extension) at the
   root, containing just your domain, e.g.:
   ```
   tickets.yourdomain.com
   ```
3. In **Settings → Pages**, enter the same domain under "Custom domain" and
   save — GitHub verifies it and can auto-provision HTTPS for it.

This repo is also plain enough to deploy as-is on Vercel, Netlify, or
Railway's static hosting if you'd rather use one of those instead of GitHub
Pages — there's no GitHub-specific dependency in the code.

## Why no shared database, and how to add one later

This was a deliberate v1 choice: no backend means no hosting bill, no
credentials to secure, and a page that works the moment it's opened. The
real cost is that categorization and Next Action notes are personal to
each browser, not shared across the team.

If that starts to matter — e.g. your boss and support team need to see the
same corrected categories — the data model here (a `tickets` array plus an
`overrides` map keyed by ticket ID, see `assets/app.js`) maps directly onto
a small hosted Postgres table plus a `ticket_overrides` table, exactly as
sketched in this project's `boss_table_module_plan.md`. Supabase (hosted
Postgres with an auto-generated REST API) is the lowest-effort way to add
that without hand-building a backend server — swap the `localStorage`
calls in `app.js` for calls to Supabase's JS client, and the rest of the
app (rendering, filtering, grouping) barely changes.

## Live Jira sync

This app only ever reads a file you give it — it never talks to Jira or
Zendesk directly (a static page can't safely hold API credentials). The
live-sync half of this project — `dashboard.py` pulling from Jira's API
into a local database — is a separate tool, already planned in
`ticket_dashboard_architecture_plan.md`. The bridge between the two is
simple: export from that tool (or from Jira/Zendesk directly) whenever you
want fresh data, and drop the export onto this page.
