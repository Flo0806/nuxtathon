# Nuxtathon Leaderboard

![Nuxtathon](./public/og.png)

A live leaderboard for Nuxtathon, the community hackathon on the `nuxt/nuxt`
repository ([announcement](https://github.com/nuxt/nuxt/issues/35561)). During
the event it ranks contributors by the number of qualifying issues their merged
pull requests closed, and reshuffles in real time. When the event is over an
admin freezes the result and the winner is revealed.

Built with Nuxt 4, Nitro, Pinia, and UnoCSS.

## How scoring works

A pull request counts toward a contributor's score when all of these hold:

- It was **created** inside the event window (`startsAt` to `endsAt`). Submission
  time is the rule, not merge time, so a PR opened during the event still counts
  if it is merged later.
- It has been **merged**.
- It **closes at least one issue** created before `qualifyingBefore`.

**Who gets credit.** Every contributor to a qualifying PR, not just the opener:
the commit authors and any `Co-authored-by` names that resolve to a GitHub
account each get full credit. Issues are deduped per person, so the same issue
counts once even if it shows up on more than one of their PRs.

**Who is excluded.** Bots (GitHub Apps, `[bot]` accounts like `renovate[bot]`,
and AI co-author attributions such as `claude`) and the core team listed in
`coreTeam`. Core team contributions are still tallied and archived, just kept out
of the prize ranking.

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
| `displayTimeZone`  | IANA zone for rendering dates, e.g. "UTC"          |

Dates are absolute UTC instants; the timezone only affects display.

## Environment

Copy `.env.example` to `.env` and fill it in:

```
NUXT_GITHUB_TOKEN=      # read access to public repos is enough
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

GitHub is queried at most once every 5 minutes (cached, stale-while-revalidate).
Open pages poll every 2 minutes during `live`, so the board reshuffles without a
reload.

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
- **Archive**: past finalized events, downloadable as JSON per event or all at
  once. Each entry carries the full config it ran with.

The **Settings** tab overrides `config/event.json` at runtime. Empty fields
use the committed default. Texts are editable at any time; the event window
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

| Endpoint                 | What it answers                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/v1/summary`        | Everything a teaser needs in one request: title, window, stats, top 3, winner. `?top=N` widens the list.                             |
| `/api/v1/event`          | The current event in full: description (Markdown and plain), rule lines, point rules as structured data, issue cutoff, core team.    |
| `/api/v1/leaderboard`    | The whole ranking plus the core team. `?limit=N` trims it, `?include=contributions` adds the issue and PR numbers behind each score. |
| `/api/v1/archive`        | Every finished event with its winner and award count.                                                                                |
| `/api/v1/archive/{slug}` | One finished event: standings, awards, and ready-made certificate URLs.                                                              |
| `/api/v1/users/{login}`  | One contributor across all finished events, with totals and awards. `?logins=a,b,c` returns several.                                 |

Every response carries a `meta` block (`generatedAt`, `nextUpdateAt`, `phase`).
Caching is the point: the ranking is recomputed at most every five minutes, and
the `ETag` is built from the payload **without** `meta`, so a conditional
request keeps getting `304 Not Modified` for as long as the data itself is
unchanged. Nothing here ever triggers a GitHub call of its own; it reads the
same cache the site does.

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
