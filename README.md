# Nuxtathon Leaderboard

![Nuxtathon](./public/og.png)

A live leaderboard for Nuxtathon, the Nuxt community hackathon. #1
([announcement](https://github.com/nuxt/nuxt/issues/35561)) ran on `nuxt/nuxt`;
#2 ([announcement](https://github.com/nuxt/nuxt/issues/36438)) spans the
ecosystem: every `nuxt/*` and `nuxt-modules/*` repository plus the modules
listed on [nuxt.com](https://nuxt.com/modules). During the event it ranks
contributors by the qualifying issues their merged pull requests closed, and
reshuffles in real time. When the event is over an admin freezes the result and
the winner is revealed.

Built with Nuxt 4, Nitro, Pinia, and UnoCSS.

## How scoring works

A pull request is considered when all of these hold:

- It was **created** inside the event window (`startsAt` to `endsAt`). Submission
  time is the rule, not merge time, so a PR opened during the event still counts
  if it is merged later, up to the moment the result is frozen.
- It has been **merged**.
- It was opened in a repository the event's [scope](#scope) covers.

From there it takes one of two paths:

- **Automatic**: it **closes at least one issue** created before
  `qualifyingBefore`, in any repository. It scores like every PR in #1 did, and
  nobody has to look at it.
- **Review**: it closes no qualifying issue (a module's migration to Nuxt v5, a
  docs fix, a refactor), or the people behind it maintain that very repository.
  It lands in the organizers' [review queue](#review-queue) and scores only when
  confirmed, with the points the organizer sets.

**Who gets credit.** Every contributor to a qualifying PR, not just the opener:
the commit authors and any `Co-authored-by` names that resolve to a GitHub
account each get full credit. Issues are deduped per person, so the same issue
counts once even if it shows up on more than one of their PRs.

**Who is excluded.** Bots (GitHub Apps, `[bot]` accounts like `renovate[bot]`,
and AI co-author attributions such as `claude`) and the core team listed in
`coreTeam`. Core team contributions are still tallied and archived, just kept out
of the prize ranking. Maintainers of a module (as listed in the nuxt.com
registry) get no automatic points in their own repository, since the rules
exclude self-maintained work; a community co-author on the same PR still does.

Alongside the ranking the board shows **community upvotes**: the thumbs-up
across every issue closed during the event, i.e. how often people had asked for
these fixes. Reactions come from the queries that already fetch the issues, so
the counter costs no extra requests except for issues that only a manual credit
brought in.

Score = one point per qualifying closed issue plus manual credits (see Admin).
Optional rules add points for merged PRs, issue age, labels and thumbs-up; see
[Scoring](#scoring). The board shows the merged-PR count as a secondary stat,
plus window-wide counters for submitted and merged PRs (both bot-free).

## Configuration

Static event config lives in `config/event.json`:

| Field              | Meaning                                            |
| ------------------ | -------------------------------------------------- |
| `title`            | Hero title, e.g. "Nuxtathon"                       |
| `eyebrow`          | Kicker above the title                             |
| `description`      | Short blurb, Markdown                              |
| `startsAt`         | Event start, ISO 8601 UTC                          |
| `endsAt`           | Event end, ISO 8601 UTC                            |
| `qualifyingBefore` | Issues created before this instant qualify         |
| `coreTeam`         | GitHub logins kept out of the ranking (organizers) |
| `scope`            | Where counted PRs may live, see [Scope](#scope)    |
| `displayTimeZone`  | IANA zone for rendering dates, e.g. "UTC"          |

Dates are absolute UTC instants; the timezone only affects display.

## Environment

Copy `.env.example` to `.env` and fill it in:

```
NUXT_GITHUB_TOKEN=      # classic token without scopes: public data only
NUXT_ADMIN_USER=        # admin login
NUXT_ADMIN_PASSWORD=    # use a strong, random password in production
```

## Development

```bash
pnpm install
pnpm dev
```

Lint and format with `pnpm lint` and `pnpm fmt`. Runtime state (frozen result,
credits, snapshots, settings, cache) is written to `.data` via the filesystem
driver.

## Event lifecycle

The public page follows four phases, derived from the config dates and the admin:

1. `upcoming`: before `startsAt`. Intro plus a countdown to the start.
2. `live`: between `startsAt` and `endsAt`. The leaderboard, refreshing itself.
3. `evaluating`: after `endsAt`, before the admin fires. An "evaluation running"
   screen while the last PRs are merged.
4. `results`: after the admin fires. The winner is revealed and the board frozen.

GitHub is queried at most once every 5 minutes. The first visitor after that
waits for the recompute (about 9 seconds with two orgs in scope), everyone else
is served from the cache. There is deliberately no stale-while-revalidate: a
background refresh that finished after an admin save wrote its stale result back
over the change. When GitHub fails, or its budget runs low (see
[GitHub budget](#github-budget)), the board shows its last result instead of an
error. Open pages poll every 2 minutes during `live`, so the board reshuffles
without a reload.

## Admin

Visit `/admin/nuxtathon` and log in with the env credentials. Actions:

- **Fire**: freeze the ranking, release prizes, archive the result, and reveal
  the winner. This stops the count, so late merges no longer move the board. Use
  it during `evaluating`, or earlier if you must end the event before the clock.
- **Unfreeze**: undo a fire and go back to the live leaderboard.
- **Refresh**: drop the cache and recompute from GitHub now.
- **Start new**: close the fired event and open the next one. Asks for the new
  window (start, end, issue cutoff) and optional title/eyebrow, archives the
  result, clears credits and snapshots, and switches the site to `upcoming`.
- **Manual credits**: add points to a contributor for an issue closed without a
  PR, for example a non-reproducible issue you close and credit the reporter. The
  standings preview updates live; Save persists.
- **Close marker**: the same credit, but from GitHub. A comment by an authorized
  organizer ("nuxtathon closed @user") on a closed issue in any repository of
  the scope credits that user. It
  counts when both the comment and the close fall between the event start and
  the moment you fire, so closing the last issues during `evaluating` still
  scores, while a marker left during an earlier Nuxtathon never applies again. A
  new marker reaches the server with the next recompute, at most five minutes
  later, and an already open page adds its own two-minute poll on top. **Refresh**
  makes it immediate.
- **Archive**: past finalized events, downloadable as JSON per event or all at
  once. Each entry carries the full config it ran with.

Next to the Event tab:

- **Review**: the [review queue](#review-queue).
- **Scope check**: runs the saved scope against any past window of up to seven
  days and lists every merged PR with the path it would take (automatic, review,
  ignored) and why, before any of it reaches the board. Useful to try a scope out
  on a quiet weekend.

Every admin page shows the [GitHub budget](#github-budget) counter under the
tabs.

The **Settings** tab overrides `config/event.json` at runtime, including the
[scope](#scope) and the point rules. Empty fields use the committed default. Texts are editable at any time; the event window
locks progressively: the start and issue cutoff once the event is live, the end
once it is over, everything once the event is fired. `danielroe` is always part
of the core team and the marker authors, and the display time zone is fixed to
UTC.

The admin API uses HTTP Basic Auth with a timing-safe comparison and a per-IP
failure throttle. Serve the app over HTTPS, since Basic Auth depends on it.

## Starting a new Nuxtathon

No build needed. In `/admin/nuxtathon`, fire the running event if you have not
yet, then press **Start new** and enter the window. Adjust texts and the rest of
the window in the Settings tab while the event is `upcoming`. The archive
persists.

`config/event.json` stays the committed default that settings override; edit it
only for defaults you want in the repo.

### Upgrading a deployment from before v0.6

The first start of the new build runs a one-off migration that copies the
committed config into every archived result (`FinalResult.config`) and writes a
backup of `.data/state/runtime` next to it. Deploy and let it start **before**
touching Settings or `config/event.json`, since the migration takes the
committed config as the one the archived event ran with.

## Scoring

By default every qualifying closed issue counts one point, plus manual credits,
exactly as the first event was scored. The Settings tab (Event section) can turn
on additional rules, which only ever add up, never multiply:

```
points per issue = base + age bonus + label bonuses + upvote bonus
```

Points per merged PR are added on top of the issues it closed, and manual
credits are taken as given. The active rules are appended to the rules block on
the start page automatically, so they are never written twice. The whole block
locks the moment the event goes live, and it is frozen into the result on fire,
so an archived event keeps the rules it was scored with.

## Scope

`scope` says where a pull request has to be opened to count. The issues it
closes may live anywhere.

```json
"scope": { "orgs": ["nuxt", "nuxt-modules"], "repos": [], "registry": true }
```

- `orgs`: every repository of these organizations, including ones created
  later.
- `repos`: single repositories outside those organizations, as `owner/repo`.
- `registry`: also the third-party modules listed on nuxt.com. Their
  repositories belong to nobody here and are too many to search with every
  recompute, so they are searched once an hour and every PR found goes to the
  review queue. For a module that lives in a monorepo (the registry names a
  folder, such as `packages/nuxt`), only PRs that change that folder are kept.

The scope is edited in Settings (Event) and locks when the event goes live. An
archived result without a scope ran on `nuxt/nuxt` alone and keeps showing that,
whatever the current default says.

## Review queue

The **Review** tab in the admin lists the merged PRs in scope that do not score
on their own: they close no qualifying issue, or their authors maintain that
repository, or they come from a registry module. Each one shows who would get
the points, why it is there, and a suggestion: the PR points from the rules (1
when that rule is off), doubled for the label `nuxtathon-v5` (a module's
migration to Nuxt v5), plus the issue points for any qualifying issue a registry
PR closes.

- **Confirm** grants the points you set to every person listed. They count as
  organizer points, like manual credits, and never twice: a PR that later gets
  linked to a qualifying issue scores automatically and its confirmation is
  ignored.
- **Reject** takes it off the list. Both can be undone until the event is fired.
- **Reject all shown**, together with the repository filter, clears a noisy
  repository in one step.

The list is refreshed with every leaderboard recompute; registry modules have
their own hourly search and a **Search now** button. Fire stores the confirmed
PRs with the result, and Start new clears the queue.

## GitHub budget

Everything the site knows comes from GitHub, and GitHub limits every account:
5000 GraphQL points an hour and 30 searches a minute. GraphQL charges for what a query
could fetch, not for what it returns, so page sizes follow the expected volume.
Measured costs: a leaderboard recompute about 77 points, an hourly registry run
about 180, which puts a live event at roughly 1100 points an hour.

When the budget runs low anyway, the site gives things up in order, and the
board goes last:

| Points left | What pauses                                             |
| ----------- | ------------------------------------------------------- |
| below 1500  | registry search, scope check                            |
| below 800   | Flo's list stops asking GitHub and shows what it stored |
| below 200   | the board shows its last result until the budget resets |

The counter in the admin (and, for the developer's GitHub login, on every page)
shows what is left, each call with its cost and duration, the current tier, and
a red warning when GitHub rejects the token.

## Buttons under the intro

The row of buttons is config, not markup: `links` is a list of
`{ label, url, icon }`, editable in Settings (Content). Two urls are
placeholders the server expands, so no date is ever maintained by hand:

| Placeholder | Expands to                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `{issues}`  | the GitHub search for open issues that still qualify across the scope's orgs and repositories, derived from `qualifyingBefore`       |
| `{random}`  | `/api/pick-issue`, which redirects to a random issue nobody has started (no linked PR, no assignee). `?scope=all` drops that filter. |

`/api/pick-issue` keeps a pool of candidates for five minutes and picks from it
per request, so a burst of clicks costs no extra GitHub calls, and it redirects
to the search page rather than failing when GitHub is unavailable.

## Flo's list

`/issues`, behind the GitHub login: every open issue that still qualifies on the
left, the ones you chose to follow on the right. A star moves an issue between
them; watching is private and reserves nothing, which is deliberate, the event
rules have no reservations.

A dropdown switches between the `nuxt/*` repositories that have open issues;
the watch column always shows everything you follow, each row with its
repository. Each repository's backlog is loaded once, stored, and then kept up
to date by one search for everything that changed across the org, every five
minutes, so the cost is the same whether one person or a hundred are looking,
and however many repositories they browse. A full reload once a day catches what
that search cannot see. The page refetches every five minutes while it is open. An issue you watch lights up when GitHub touched it after you
started watching it (or after your last "mark as seen"), and a watched issue
that gets closed stays in the right column, struck through, until you clear it.

## Archive

Every fired event is kept and shown at `/archive` (linked from the start page
once there is one), each at `/archive/<start-date>` with the texts, rules and
standings it ended with. The data is the `FinalResult` written on fire, so
later settings changes never touch an archived page.

## Discord announcements

Optional, via [nuxt-pigeon](https://github.com/Flo0806/nuxt-pigeon). The
webhook url is an admin setting (Settings tab, Integrations), not an env var,
so the organizer can set it without a deploy; "Send test message" posts a
sample card. What gets posted:

- **Ranking update** whenever the ordered top 3 changes while the event is
  `live` (checked after every GitHub recompute, so at most every 5 minutes),
  with the movement of each entry. Needs "Announce ranking changes" on.
- **Final results** on fire, with the winner and the social preview image.
- **Announcement** on "Start new", when the checkbox in the dialog is ticked.

Posts are fire-and-forget: a Discord failure never affects the board, and a
missed ranking post is retried on the next recompute.

## Public API

Read-only JSON at `/api/v1`, CORS-open so another site (nuxt.com, a dashboard,
a bot) can pull the event without scraping. `GET /api/v1` lists every endpoint.

| Endpoint                 | What it answers                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/v1/summary`        | Everything a teaser needs in one request: title, window, stats, top 3, winner. `?top=N` widens the list.                                   |
| `/api/v1/event`          | The current event in full: description (Markdown and plain), rule lines, buttons, point rules as structured data, issue cutoff, core team. |
| `/api/v1/leaderboard`    | The whole ranking plus the core team. `?limit=N` trims it, `?include=contributions` adds the issue and PR numbers behind each score.       |
| `/api/v1/archive`        | Every finished event with its winner and award count.                                                                                      |
| `/api/v1/archive/{slug}` | One finished event: standings, awards, and ready-made certificate URLs.                                                                    |
| `/api/v1/users/{login}`  | One contributor across all finished events, with totals and awards. `?logins=a,b,c` returns several.                                       |

Every response in the table above carries a `meta` block (`generatedAt`,
`nextUpdateAt`, `phase`); the `/api/v1` index answers with `version`, `docs` and
`endpoints` instead.
Caching is the point: the ranking is recomputed at most every five minutes, and
the `ETag` covers the payload and the phase but not the timestamps, so a
conditional request keeps getting `304 Not Modified` for as long as the data
itself is unchanged. Nothing here ever triggers a GitHub call of its own; it reads the
same cache the site does.

Issues and PRs appear twice: `issues` / `prs` hold the plain numbers v1 always
had, and `issueRefs` / `prRefs` hold the same list as `owner/repo#number`. The
numbers alone are only unambiguous while everything lives in `nuxt/nuxt`; new
consumers should read the refs.

Fields are added, never removed or retyped. A breaking change would ship as
`/api/v2`.

## Social preview

`/og.png` is rendered on the server from the resolved config (eyebrow, title,
event window) with `@resvg/resvg-js` and cached per text variant; the page
links it as `/og.png?v=<hash>` so unfurlers refetch after a settings change.
Fonts (Chakra Petch, JetBrains Mono, both OFL) live in `server/assets/fonts`
and are written to `.data/fonts` on first use. `public/og-fallback.png` is
served if rendering fails.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT (c) [Florian Heuberger](https://heuberger.dev). See [LICENSE](./LICENSE).

## Credit

Made with love by [Flo Heuberger](https://heuberger.dev).
