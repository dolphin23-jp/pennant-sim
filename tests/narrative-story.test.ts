import assert from 'node:assert/strict';
import test from 'node:test';
import {
  articleFromChampionship,
  articleFromFutureEvent,
  articleFromGameBoxScore,
  type NarrativeSource,
} from '../src/narrative/generate';
import { buildNarrativeStoryContext, planNarrativeStory } from '../src/narrative/story';

const emptySource = (): NarrativeSource => ({
  gameBoxScores: {},
  achievementHistory: [],
  championHistory: [],
  awardHistory: [],
  narrativeEvents: {},
});

function game(walkoff = false, comeback = false) {
  return {
    gameId: walkoff ? 'walkoff' : 'routine',
    date: '2034-06-01',
    seasonYear: 2034,
    homeKey: 'giants' as const,
    awayKey: 'tigers' as const,
    homeScore: walkoff ? 4 : 6,
    awayScore: 3,
    homeHits: 9,
    awayHits: 7,
    homeErrors: 0,
    awayErrors: 0,
    innings: [{ home: walkoff ? 4 : 6, away: 3 }],
    extraInnings: false,
    tie: false,
    walkoff,
    shutoutTeam: null,
    decisions: {
      winnerId: null,
      winnerText: null,
      loserId: null,
      loserText: null,
      saveId: null,
      saveText: null,
    },
    headline: null,
    hasBoxScore: true,
    batterLines: [],
    pitcherLines: [],
    notableEvents: comeback
      ? [{ type: 'comeback' as const, description: '巨人が逆転した。', playerId: null }]
      : [],
  };
}

test('director keeps all game recaps deterministic even when the game is dramatic', () => {
  const routine = game();
  const routineSource = emptySource();
  routineSource.gameBoxScores[routine.gameId] = routine;
  const routinePlan = planNarrativeStory(articleFromGameBoxScore(routine), routineSource);
  assert.equal(routinePlan.depth, 'brief');
  assert.equal(routinePlan.autoGenerate, false);

  const dramatic = game(true, true);
  const dramaticSource = emptySource();
  dramaticSource.gameBoxScores[dramatic.gameId] = dramatic;
  const dramaticPlan = planNarrativeStory(articleFromGameBoxScore(dramatic), dramaticSource);
  assert.ok(dramaticPlan.score >= 50, 'dramatic scoring remains available for editorial diagnostics');
  assert.equal(dramaticPlan.depth, 'brief');
  assert.equal(dramaticPlan.autoGenerate, false);
  assert.ok(dramaticPlan.reasons.includes('deterministic-game-recap'));
});

test('first-round draft is feature-worthy while later routine selections stay as notices', () => {
  const first = {
    type: 'draft' as const,
    id: 'draft:2034:giants:1:p1',
    year: 2034,
    date: '2034年オフ',
    teamKey: 'giants' as const,
    playerId: 'p1',
    playerName: '新人一郎',
    round: 1,
    origin: '高卒',
  };
  const third = { ...first, id: 'draft:2034:giants:3:p2', playerId: 'p2', round: 3 };
  const source = emptySource();
  source.narrativeEvents = { '2034': [first, third] };
  assert.equal(planNarrativeStory(articleFromFutureEvent(first), source).depth, 'feature');
  assert.equal(planNarrativeStory(articleFromFutureEvent(third), source).depth, 'brief');
});

test('cover stories receive sparse grounded history without same-day or future leakage', () => {
  const oldChampion = { year: 2030, champion: 'giants' as const, runnerUp: 'hawks' as const };
  const currentChampion = {
    year: 2034,
    champion: 'giants' as const,
    runnerUp: 'tigers' as const,
    record: { w: 82, l: 55, d: 6 },
  };
  const source = emptySource();
  source.championHistory = [oldChampion, currentChampion];
  const article = articleFromChampionship(currentChampion);
  const plan = planNarrativeStory(article, source);
  assert.equal(plan.depth, 'cover');
  assert.equal(plan.autoGenerate, true);

  const context = buildNarrativeStoryContext(article, source);
  assert.ok(context.some((claim) => claim.sourceArticleId === 'championship:2030'));
  assert.ok(context.every((claim) => claim.asOfDate < article.asOfDate));
  assert.ok(context.every((claim) => claim.factRefs.length > 0));
});
