import { calcOVR } from './ratings';
import type {
  DraftOrigin,
  Player,
  PreProHighlight,
  PreProHistory,
  PreProProfileTier,
} from './types';

export interface PreProHistoryOptions {
  entryYear: number;
  origin?: DraftOrigin;
  entryAge?: number;
  prospectQuality?: number;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let output = value;
    output = Math.imul(output ^ (output >>> 15), output | 1);
    output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random: () => number, minimum: number, maximum: number): number {
  return Math.floor(random() * (maximum - minimum + 1)) + minimum;
}

function inferOrigin(entryAge: number): DraftOrigin {
  if (entryAge <= 20) return '高卒';
  if (entryAge <= 22) return '大卒';
  return '社会人';
}

function maxPotential(player: Player): number {
  const values = Object.entries(player.pot)
    .filter(([, value]) => typeof value === 'number')
    .map(([, value]) => Number(value));
  return values.length ? Math.max(...values) : 0;
}

function profileScore(player: Player, quality?: number): number {
  const current = player.isP ? calcOVR(player) : calcOVR(player, player.pos);
  const potential = maxPotential(player);
  return Math.max(
    current,
    potential * 0.72,
    quality ?? 0,
    player.generationalTalent ? 104 : 0,
    player.potentialClass === 'elite' ? 88 : 0,
  );
}

function profileTier(score: number): PreProProfileTier {
  if (score >= 92) return 'national-elite';
  if (score >= 76) return 'national';
  if (score >= 60) return 'regional';
  return 'developmental';
}

function hitterPowerSignal(player: Player): number {
  return Math.max(Number(player.p.pw ?? 0), Number(player.pot.pw ?? 0));
}

function pitcherSignal(player: Player): number {
  return Math.max(
    Number(player.p.vel ?? 0),
    Number(player.p.ctrl ?? 0),
    Number(player.p.nobi ?? 0),
    Number(player.pot.vel ?? 0),
    Number(player.pot.ctrl ?? 0),
    Number(player.pot.nobi ?? 0),
  );
}

function highSchoolHighlights(
  player: Player,
  tier: PreProProfileTier,
  random: () => number,
): PreProHighlight[] {
  const highlights: PreProHighlight[] = [];
  if (tier === 'national' || tier === 'national-elite') {
    const result =
      tier === 'national-elite'
        ? ['ベスト8', 'ベスト4', '準優勝'][randomInt(random, 0, 2)]
        : random() < 0.45
          ? 'ベスト8'
          : '出場';
    highlights.push({
      kind: 'national-tournament',
      text: `夏の全国大会${result}`,
      competition: '夏の全国大会',
      result,
    });
  } else if (tier === 'regional') {
    highlights.push({ kind: 'regional-standout', text: '高校野球の地区大会で注目選手となった' });
  }

  if (!player.isP && hitterPowerSignal(player) >= 58) {
    const power = hitterPowerSignal(player);
    const total = Math.max(12, Math.min(68, Math.round(10 + power * 0.38 + randomInt(random, -4, 5))));
    highlights.push({
      kind: 'career-home-runs',
      text: `高校通算${total}本塁打`,
      value: total,
      unit: '本塁打',
    });
  }
  if (player.isP && pitcherSignal(player) >= 72) {
    highlights.push({ kind: 'featured-pitcher', text: '高校球界の注目投手として評価された' });
  }
  if ((tier === 'national' || tier === 'national-elite') && random() < 0.35) {
    highlights.push({ kind: 'captain', text: '高校では主将を務めた' });
  }
  return highlights;
}

function universityHighlights(
  player: Player,
  tier: PreProProfileTier,
  random: () => number,
): PreProHighlight[] {
  const highlights: PreProHighlight[] = [
    { kind: 'university-regular', text: '大学リーグで主力としてプレーした' },
  ];
  if (tier === 'national' || tier === 'national-elite') {
    highlights.push({ kind: 'university-award', text: '大学リーグのベストナインに選出された' });
  }
  if (tier === 'national-elite' || (tier === 'national' && random() < 0.3)) {
    highlights.push({ kind: 'national-team', text: '大学日本代表に選出された' });
  }
  if (!player.isP && hitterPowerSignal(player) >= 72) {
    highlights.push({ kind: 'power-hitter', text: '大学球界で長打力を評価された' });
  }
  if (player.isP && pitcherSignal(player) >= 76) {
    highlights.push({ kind: 'featured-pitcher', text: '大学球界を代表する投手の一人として注目された' });
  }
  return highlights;
}

function corporateHighlights(
  player: Player,
  tier: PreProProfileTier,
  random: () => number,
): PreProHighlight[] {
  const highlights: PreProHighlight[] = [
    { kind: 'corporate-regular', text: '社会人野球で主力としてプレーした' },
  ];
  if (tier === 'national' || tier === 'national-elite') {
    const result = tier === 'national-elite' && random() < 0.55 ? 'ベスト8' : '出場';
    highlights.push({
      kind: 'corporate-tournament',
      text: `都市対抗大会${result}`,
      competition: '都市対抗大会',
      result,
    });
  }
  if (tier === 'national-elite') {
    highlights.push({ kind: 'immediate-impact', text: '社会人屈指の即戦力候補として評価された' });
  } else if (tier === 'national' || tier === 'regional') {
    highlights.push({ kind: 'immediate-impact', text: '即戦力候補として注目された' });
  }
  return highlights;
}

export function createPreProHistory(player: Player, options: PreProHistoryOptions): PreProHistory {
  const entryAge = Math.max(18, Math.round(options.entryAge ?? player.age));
  const origin = options.origin ?? inferOrigin(entryAge);
  const score = profileScore(player, options.prospectQuality);
  const tier = profileTier(score);
  const random = mulberry32(
    hashString(`${player.id}|${origin}|${options.entryYear}|pre-pro-v1`),
  );
  const highlights =
    origin === '高卒'
      ? highSchoolHighlights(player, tier, random)
      : origin === '大卒'
        ? universityHighlights(player, tier, random)
        : corporateHighlights(player, tier, random);
  return {
    schemaVersion: 1,
    source: 'generated-v1',
    origin,
    entryYear: options.entryYear,
    entryAge,
    profileTier: tier,
    highlights,
  };
}

export function preProSummary(history: PreProHistory | undefined): string {
  if (!history) return '';
  const lead = `${history.origin}・${history.entryYear}年プロ入り`;
  return [lead, ...history.highlights.slice(0, 2).map((highlight) => highlight.text)].join(' / ');
}
