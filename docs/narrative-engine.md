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
