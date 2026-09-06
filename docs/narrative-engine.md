# Narrative Engine

The narrative layer turns existing simulation facts into reusable articles without becoming a second source of truth.

## Editorial classes

Every body segment is tagged as one of:

- `FACTUAL`: may only restate supplied facts.
- `ANALYTICAL`: may only interpret explicitly supplied metrics/rules. The foundation does not infer hidden causes.
- `COLOR`: may change tone, but its `factRefs` must be empty and it must not introduce a factual claim.

Articles retain `factRefs`, `asOfDate`, and `generatorVersion` so prose remains auditable.

## Canonical article ids

The same source event always maps to the same id:

- `game:<gameId>`
- `achievement:<achievementId>`
- `championship:<year>`
- `season-awards:<year>`
- future events use their subsystem id (`transaction:`, `draft:`, `career:`, etc.)

UI surfaces should reuse these canonical articles instead of generating their own conflicting prose.

## Storage model

Save Architecture v4 already archives the factual ledgers used by the first narrative sources: game box scores, achievements, championships, season titles, and year-by-year records. The first narrative layer is therefore a deterministic projection over those immutable/archive facts rather than another copy of every game result.

This keeps ordinary saves bounded and allows a 50- or 100-year world to expose old articles without duplicating the same box score twice. If future prose needs to preserve a literal historical wording across generator upgrades, it can be snapshot into a dedicated article archive keyed by the existing canonical id and generator version.

## Current sources

The first UI feed generates articles for:

- every archived game box score
- milestones and record events
- championships
- season title awards

The event pipeline is already typed for transactions, draft selections, career events, injuries, development events, and team season reviews. Those subsystems should emit their factual event objects at the point where the underlying transaction becomes final; the narrative layer must not infer those events by diffing rosters after the fact.

## Live vs archival

`NarrativeArticle.viewMode` and `asOfDate` are explicit. Current foundation articles are archival snapshots of completed events. Future live previews (race analysis, current standings, pending FA market coverage) must be rendered separately and must never leak facts later than their `asOfDate` into archival views.

## Event ledger (generator v2)

`narrativeEvents: Record<string, NarrativeEvent[]>` is the canonical year-keyed
ledger. It holds facts only: names and affiliations at the event, draft origin and
round, complete trade movements, committed exit reasons, injury severity/duration,
and numeric growth/awakening facts. It contains neither generated articles nor a
second copy of game boxes. `FutureNarrativeEvent` and `articleFromFutureEvent` remain
compatible aliases/entry points for callers of the foundation API.

Owners emit through an optional `NarrativeEventContext` when an operation becomes
final. This observation channel uses no random draws and does not decide outcomes.

| Owner / commit                                                       | Facts emitted                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `applyTrade` / `cpuAutoTradeBetweenTeams`                            | One trade with every movement, plus existing cash terms                                                           |
| `signPlayerToTeam`                                                   | User and CPU FA / foreign signings; refused or duplicate applications emit nothing                                |
| `applyDraftPicks`                                                    | Confirmed picks only; previews and losing bids emit nothing                                                       |
| `retirePlayers`, CPU roster preparation/finalization, foreign review | User retirement, CPU retirement or release according to the explicit exit reason, foreign release / MLB departure |
| `applyPostGamePlayerEvents` and scheduled-game commit                | Injuries, awakenings, and the exact transition to injury eligibility; includes CPU games without retained boxes   |
| `growthPhase`                                                        | Annual OVR change of at least 3 in either direction, and every awakening                                          |
| `completeOffseason`                                                  | Twelve frozen regular-season standings reviews, with the known Japan Series champion                              |

The UI stages offseason rosters and events together and saves them at
`completeOffseason`, matching its existing all-or-nothing offseason behavior.
Closing/reloading midway still discards the staged offseason, including its events.
Draft reconstruction for previews does not emit: the final draft application does.
Postseason events are committed with the championship. Regular-season play, CPU
catch-up, skips, and new-season CPU preparation all append their committed batches.
An injury recovery means **eligible to play**, not an actual appearance or comeback
performance. The existing injury countdown is unchanged.

### Identity and integrity

- IDs include the event year and the owner's stable key. Trade offers carry a
  proposal-batch ordinal; CPU trades use their caller's batch scope and round.
- A multi-player trade is one event/article and includes all `playerIds` and both
  clubs in `teamKeys`. Exact replay is a no-op; conflicting facts for an existing
  canonical ID fail validation rather than overwrite history.
- Already-prefixed event IDs are also the article IDs; legacy unprefixed subsystem
  IDs keep the foundation's prefix mapping. The renderer version is not part of
  identity. Ledger FactRefs point at the saved event ID, including season reviews.
- Migration validates discriminants, teams, years/dates, numeric fields and nested
  facts. Missing legacy ledgers mean empty history; malformed present data is
  reported as corruption. Existing data is never retrospectively inferred from
  rosters, notices or bounded growth logs.
- Feed candidates include metadata only; text is generated for the requested page.
  Team/player/year/category and `asOfDate` filters share the same pipeline. A
  historical rendering cannot consult a mutable player object.

### Dates and limits

Scheduled events use the real simulation date and game ID. The offseason has no
calendar-day model: its publication label is `<year>年オフ` and its `asOfDate` is the
year-end boundary, as with the existing awards/championship articles. This does
not claim a precise real-world signing date or order within that offseason.

The FA market currently generates candidates; it does not release named players
from existing clubs. FA articles therefore record joining a club without inventing
a prior employer, contract payment, or human motives. First appearances, first
hits/wins, origin schools, full CareerMemory/StoryArc, foreign renewal/adaptation
news remain future work. Optional OpenAI prose rendering is described below. Historic synthetic league years are
not backfilled with guessed transactions.

`npm run test:narrative:long` plays 100 full scheduled seasons with roster turnover,
checks every year's counts and replay behavior, verifies old chunk reuse, and
checks full rehydration/export and article identity at both 30 and 100 years. CI
runs this audit alongside the existing unit tests and unchanged balance baseline.

Reload uses an already-saved championship as the postseason commit marker and
resumes at the offseason. This prevents rerolling an event that already has a
canonical article. Repeated offseason completion callbacks from the previous year
are ignored. These guards do not alter simulation outcomes or random draws.

## CareerMemory and StoryArc projection

CareerMemory is a deterministic index over facts that already exist in the save.
It does **not** add another authoritative player-history database. The index uses
yearly player snapshots plus the narrative event ledger, awards and championship
history. It is transient and can be rebuilt from the archive.

For an article about a player, the packet may include a sparse set of archived
season lines: the most recent completed season, title seasons, objectively notable
seasons and the first active season. Newspaper prose never sees the internal OVR
as a career fact. A `PLAYER_SEASON:<year>:<playerId>` FactRef points back to the
exact archived `PlayerSeasonRecord`.

Year boundaries are strict. A final 2034 season line is not available to an article
dated June 2034; same-year final stats become eligible only for a year-end
(`YYYY-12-31`) rendering. This prevents final-season knowledge leaking into
historical in-season coverage.

StoryArcs are also derived, not persisted. Current arc types are:

- `career-origin`: an earlier draft event for the same player
- `club-journey`: a prior recorded transaction
- `injury-recovery`: an archived injury followed by eligibility recovery
- `long-career`: at least eight completed active seasons
- `title-history`: prior individual titles
- `championship-history`: earlier championships for an involved club
- `repeat-final`: the same two clubs previously met in the Japan Series

An arc is an editorial relationship and only affects story selection/context
priority. It is not a new factual claim. Every sentence still has to cite primary
or context claims and pass both factual validators.

## Narrative Director and story context

The renderer does not spend model tokens on every ledger row. A deterministic
Narrative Director scores each canonical article and classifies it as `brief`,
`feature`, or `cover`. **All game recaps are deterministic** even when a game
is dramatic: rewriting a box score is not considered a useful use of model tokens.
Light injuries, ordinary growth, releases and later-round draft notices also stay
template-only by default. Championships, major records, first-round draft stories,
retirements, major trades and awakenings can become AI features when their saved
history provides enough editorial material. Non-game briefs may still be explicitly
expanded by the user.

Before a feature is generated, the packet builder collects a sparse set of prior
canonical articles sharing the same players or clubs. Context is strictly older
than the target article's `asOfDate`; same-day offseason items are deliberately
excluded because the simulation does not model their exact order. Context claims
carry their original FactRefs and never become a new source of truth.

Fact Packet v2 separates `primary` claims from optional historical `context`
claims. The writer may combine several cited claims into a natural paragraph
instead of preserving the old one-claim/one-sentence structure. High-risk
transaction, draft, injury, development and career relations remain locked and
must appear verbatim when cited.

Feature prose is accepted only after two gates: deterministic
entity/number/locked-claim validation, then an independent second Responses API
pass acting as a fact checker over the exact packet and generated prose. `FACTUAL`
units still require direct support. `ANALYTICAL` units are limited to two-or-more
claim synthesis: comparison, chronology and conservative career/franchise
positioning. They may not introduce a new event, number, entity, cause, motive,
emotion or future prediction. Primary facts must still be covered factually.
The verifier rejects unsupported causality, psychology, quotes, future knowledge,
relation swaps and analysis stronger than its cited evidence. Both calls are
charged to the same D1 request budget. Generated prose remains optional
presentation data; failure at either gate falls back to the deterministic article.

## Optional OpenAI rendering

The synchronous feed and canonical ledgers remain unchanged. `packet.ts` resolves
the exact archived source and checks that it matches the template; `protocol.ts`
provides the versioned packet, strict output schema and conservative prose validator.
`NarrativeArticleService` serializes visible requests, coalesces duplicate calls,
validates both cache and network results, and always retains the template fallback.
No engine operations or random draws are performed by this layer.

The independent Worker authenticates a personal proxy token, reserves a durable
model-group daily budget in D1 and calls Responses Structured Outputs. It accepts
no arbitrary model, prompt, tools or upstream URL. An API key exists only in Worker
Secrets. Server publication and live evaluation require external owner setup.

Generated prose is optional year-indexed presentation data, not canonical fact.
World identity and SHA-256 packet fact hashes prevent cross-save collisions.
The existing generator version and canonical article IDs remain intact; snapshots
separately carry renderer, prompt, model, style and validator metadata. Compatible
old snapshots survive renderer upgrades. Manual rewrites create explicit revisions.

The feature-first implementation keeps high-risk factual statements locked while
allowing a narrow analytical layer whose evidence is explicit and independently
verified. It does not claim unrestricted language can be proven true by a JSON
schema or valid FactRefs. See [deployment and editorial scope](openai-narrative-setup.md)
for the exact boundary, setup, usage controls and an opt-in live evaluation.
