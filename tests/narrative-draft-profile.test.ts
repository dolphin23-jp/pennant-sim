import assert from 'node:assert/strict';
import test from 'node:test';

import type { Player } from '../src/engine';
import { buildDraftNarrativeProfile } from '../src/narrative/draftProfile';
import { validateProse, type Prose } from '../src/narrative/protocol';

function prospect(
  id: string,
  name: string,
  power: number,
  origin: '高卒' | '大卒' | '社会人' = '高卒',
): Player {
  return {
    id,
    name,
    age: origin === '高卒' ? 18 : origin === '大卒' ? 22 : 24,
    tk: 'giants',
    isP: false,
    pos: '右翼手',
    positions: [{ pos: '右翼手', apt: 100 }],
    mat: '通常',
    hand: { th: '右', bat: '右' },
    p: {
      stam: 45,
      cf: 50,
      cb: 48,
      pw: power,
      dc: 51,
      sp: 47,
      df: 46,
      arm: 49,
      bnt: 30,
    },
    pot: { pw: power + 15, cf: 62 },
    trainPolicy: 'balanced',
    draftOrigin: origin,
    preProHistory: {
      schemaVersion: 1,
      source: 'generated-v1',
      origin,
      entryYear: 0,
      entryAge: origin === '高卒' ? 18 : origin === '大卒' ? 22 : 24,
      profileTier: power >= 75 ? 'national' : 'regional',
      highlights:
        origin === '高卒'
          ? [
              {
                kind: 'career-home-runs',
                text: `高校通算${Math.round(power / 2)}本塁打`,
                value: Math.round(power / 2),
                unit: '本塁打',
              },
            ]
          : [{ kind: 'university-regular', text: '大学リーグで主力としてプレーした' }],
    },
  };
}

test('draft profile keeps canonical pre-pro history separate from derived draft-pool analysis', () => {
  const selected = prospect('draft-a', '候補 一郎', 78);
  const pool = [selected, prospect('draft-b', '候補 二郎', 64), prospect('draft-c', '候補 三郎', 55)];
  const before = structuredClone(selected);

  const profile = buildDraftNarrativeProfile({
    player: selected,
    prospects: pool,
    year: 2026,
    asOfDate: '2026-11-01',
  });

  assert.ok(profile);
  assert.equal(profile.article.id, 'draft-profile:2026:draft-a');
  assert.equal(profile.article.kind, 'draftProfile');
  assert.equal(profile.article.viewMode, 'archival');
  assert.ok(profile.article.factRefs.some((factRef) => factRef.kind === 'PLAYER_PRE_PRO'));
  assert.ok(
    profile.editorialInputs.some(
      (input) => input.id === 'pre-pro-history' && input.sourceClass === 'canonical',
    ),
  );
  assert.ok(
    profile.editorialInputs.some(
      (input) => input.id === 'draft-pool-standing' && input.sourceClass === 'derived',
    ),
  );
  assert.match(profile.article.segments.map((segment) => segment.text).join(' '), /高校通算39本塁打/);
  assert.deepEqual(selected, before);
});

test('draft profile rank is anchored to the full supplied draft pool', () => {
  const selected = prospect('draft-a', '候補 一郎', 62);
  const pool = [prospect('draft-b', '候補 二郎', 82), selected, prospect('draft-c', '候補 三郎', 50)];
  const profile = buildDraftNarrativeProfile({
    player: selected,
    prospects: pool,
    year: 2026,
    asOfDate: '2026-11-01',
  });

  assert.ok(profile);
  const standing = profile.editorialInputs.find((input) => input.id === 'draft-pool-standing');
  assert.ok(standing);
  assert.match(standing.text, /3人中2位/);
});

test('rich draft profiles require grounded multi-claim analytical prose', () => {
  const selected = prospect('draft-a', '候補 一郎', 78);
  const profile = buildDraftNarrativeProfile({
    player: selected,
    prospects: [selected, prospect('draft-b', '候補 二郎', 64)],
    year: 2026,
    asOfDate: '2026-11-01',
  });
  assert.ok(profile);

  const primary = profile.packet.claims.filter((claim) => claim.role === 'primary');
  const context = profile.packet.claims.filter((claim) => claim.role === 'context');
  const factual = (claim: (typeof primary)[number]) => ({
    class: 'FACTUAL' as const,
    text: claim.text,
    claimIds: [claim.id],
  });
  const prose: Prose = {
    headline: factual(primary.find((claim) => claim.id === 'headline')!),
    dek: null,
    segments: primary.filter((claim) => claim.id !== 'headline').map(factual),
  };
  assert.equal(validateProse(prose, profile.packet), null);

  prose.segments.push({
    class: 'ANALYTICAL',
    text: '候補内の現在評価と能力上の強みを合わせると、現時点での候補内の位置づけを整理できる。',
    claimIds: context.slice(0, 2).map((claim) => claim.id),
  });
  assert.ok(validateProse(prose, profile.packet));
});
