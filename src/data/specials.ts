import type { SpecialAbility } from '../engine/types';
const defineSpecial = (
  id: string,
  n: string,
  c: string,
  p: number,
  tierMax = 5,
  rarity: 'normal' | 'gold' = 'normal',
): SpecialAbility => ({ id, n, c, p, tierMax, rarity });
export const PS = [
  defineSpecial('nobi', 'ノビ○', '#4CAF50', 0.12),
  defineSpecial('heavy', '重い球', '#78909C', 0.1),
  defineSpecial('kire', 'キレ○', '#29B6F6', 0.1),
  defineSpecial('po', 'ピンチ◎', '#66BB6A', 0.08),
  defineSpecial('px', 'ピンチ×', '#EF5350', 0.08),
  defineSpecial('low', '低め○', '#26A69A', 0.09),
  defineSpecial('cnr', 'コーナー○', '#7E57C2', 0.08),
  defineSpecial('ldo', '先頭打者○', '#66BB6A', 0.07),
  defineSpecial('ldx', '先頭打者×', '#EF5350', 0.07),
  defineSpecial('gb', 'ゴロ打たせ○', '#8D6E63', 0.09),
  defineSpecial('kk', '奪三振', '#29B6F6', 0.08),
  defineSpecial('tough', '疲れにくい', '#66BB6A', 0.07),
  defineSpecial('kk_gold', 'ドクターK', '#FFD54F', 0.02, 1, 'gold'),
  defineSpecial('kire_gold', '怪童', '#FFD54F', 0.015, 1, 'gold'),
  defineSpecial('heavy_gold', '怪物球威', '#FFD54F', 0.015, 1, 'gold'),
  defineSpecial('cnr_gold', '精密機械', '#FFD54F', 0.015, 1, 'gold'),
  defineSpecial('po_gold', '魂のエース', '#FFD54F', 0.012, 1, 'gold'),
];
export const BS = [
  defineSpecial('avg', 'アベレージ', '#4CAF50', 0.1),
  defineSpecial('spray', '広角打法', '#4CAF50', 0.09),
  defineSpecial('co', 'チャンス◎', '#66BB6A', 0.09),
  defineSpecial('cx', 'チャンス×', '#EF5350', 0.08),
  defineSpecial('eye', '選球眼○', '#42A5F5', 0.09),
  defineSpecial('pull', 'プルヒッター', '#FF7043', 0.08),
  defineSpecial('run', '走塁センス', '#FF9800', 0.08),
  defineSpecial('sb', '盗塁○', '#FF9800', 0.07),
  defineSpecial('bnt', 'バント○', '#90A4AE', 0.08),
  defineSpecial('oppo', '流し打ち', '#AB47BC', 0.07),
  defineSpecial('fbo', '初球○', '#66BB6A', 0.08),
  defineSpecial('fbx', '初球×', '#EF5350', 0.07),
  defineSpecial('slugger_gold', 'アーチスト', '#FFD54F', 0.02, 1, 'gold'),
  defineSpecial('avg_gold', '安打製造機', '#FFD54F', 0.015, 1, 'gold'),
  defineSpecial('spray_gold', '芸術的流し打ち', '#FFD54F', 0.015, 1, 'gold'),
  defineSpecial('eye_gold', '選球の達人', '#FFD54F', 0.015, 1, 'gold'),
  defineSpecial('sb_gold', '電光石火', '#FFD54F', 0.015, 1, 'gold'),
];
export const CS2 = [
  defineSpecial('iron', '鉄人', '#9E9E9E', 0.06),
  defineSpecial('win', '勝負強さ', '#FF9800', 0.08),
  defineSpecial('ace', '対エース○', '#FFD700', 0.06),
];
export const CATCH_SP = [
  defineSpecial('ld_art', '配球の妙', '#CE93D8', 0.06),
  defineSpecial('strong_arm', '強肩', '#78909C', 0.1),
];
export const ALL_SPECIALS = [...PS, ...BS, ...CS2, ...CATCH_SP];
export const SPECIAL_INDEX = Object.fromEntries(ALL_SPECIALS.map((s) => [s.id, s])) as Record<
  string,
  SpecialAbility
>;
