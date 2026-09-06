# Canonical narrative history facts

The Narrative Engine must not ask the language model to infer baseball history from scattered rows. Arithmetic and relationship facts that are safe to say in prose are projected deterministically from the saved archive first.

## Source of truth

History facts are rebuilt from existing canonical data:

- `YearlyPlayerRecords` for completed player seasons;
- `SeasonTitleRecord[]` for individual titles;
- `ChampionRecord[]` for Japan Series history;
- `NarrativeEventLedger` for transactions and other dated events.

They are **derived canonical projections**, not a second mutable history database and not LLM-authored memory. They never affect simulation, roster logic, PRNG, or save authority.

## Facts exposed to prose

The current projection can supply:

- first active major-league season and number of active seasons;
- number of clubs represented in the archived career;
- career batting/pitching totals through the latest eligible completed season;
- objective single-season career bests (home runs for batters, wins for pitchers);
- accumulated individual-title counts;
- years since a club's previous Japan Series championship;
- consecutive championships / dynasty streaks;
- previous Japan Series meetings between the same two clubs;
- a former-team relationship when a player in a game previously moved between the two clubs.

These facts use `CAREER_SUMMARY`, `TEAM_HISTORY`, and `RELATIONSHIP_HISTORY` FactRefs and enter the same writer + deterministic validator + independent verifier pipeline as every other factual claim.

## Time boundary

A final season snapshot for year `Y` is available only when an article's `asOfDate` is `Y-12-31`. An article dated during that season can use only earlier completed seasons. This is the same no-future-leak rule used by CareerMemory.

## Why this exists

Without a derived fact, the writer may see a 2030 championship and a 2034 championship but is not allowed to invent the number `4`; the numeric validator correctly rejects `4年ぶり`. The history-fact layer performs that arithmetic before generation and supplies the exact supported sentence. The same principle applies to career length, career totals, title counts, dynasty streaks and former-team relationships.
