import type { FieldPosition, PitcherRole, PlayerParams, TrainPolicyId } from '../engine/types';

export const DISPLAY_OVR_NORMAL_SPECIAL_MULTIPLIER = 10;
export const DISPLAY_OVR_GOLD_SPECIAL_MULTIPLIER = 150;
export const DISPLAY_OVR_SPECIAL_ADJUSTMENT_MIN = -10;
export const DISPLAY_OVR_SPECIAL_ADJUSTMENT_MAX = 10;
export const NEGATIVE_SPECIAL_IDS = ['px', 'ldx', 'cx', 'fbx'] as const;

export const OVR_W: Record<
  FieldPosition,
  Required<Pick<PlayerParams, 'cf' | 'cb' | 'pw' | 'dc' | 'sp' | 'df' | 'arm' | 'ld' | 'stam'>>
> = {
  捕手: {
    cf: 0.18,
    cb: 0.17,
    pw: 0.08,
    dc: 0.07,
    sp: 0.05,
    df: 0.2,
    arm: 0.12,
    ld: 0.18,
    stam: 0.05,
  },
  一塁手: {
    cf: 0.18,
    cb: 0.17,
    pw: 0.28,
    dc: 0.1,
    sp: 0.05,
    df: 0.08,
    arm: 0.05,
    ld: 0,
    stam: 0.09,
  },
  二塁手: {
    cf: 0.2,
    cb: 0.18,
    pw: 0.12,
    dc: 0.1,
    sp: 0.12,
    df: 0.15,
    arm: 0.05,
    ld: 0,
    stam: 0.08,
  },
  三塁手: {
    cf: 0.2,
    cb: 0.18,
    pw: 0.22,
    dc: 0.08,
    sp: 0.08,
    df: 0.12,
    arm: 0.07,
    ld: 0,
    stam: 0.05,
  },
  遊撃手: {
    cf: 0.2,
    cb: 0.18,
    pw: 0.1,
    dc: 0.08,
    sp: 0.12,
    df: 0.18,
    arm: 0.09,
    ld: 0,
    stam: 0.05,
  },
  左翼手: {
    cf: 0.22,
    cb: 0.2,
    pw: 0.25,
    dc: 0.1,
    sp: 0.08,
    df: 0.08,
    arm: 0.04,
    ld: 0,
    stam: 0.03,
  },
  中堅手: {
    cf: 0.2,
    cb: 0.18,
    pw: 0.18,
    dc: 0.1,
    sp: 0.15,
    df: 0.12,
    arm: 0.05,
    ld: 0,
    stam: 0.02,
  },
  右翼手: {
    cf: 0.22,
    cb: 0.2,
    pw: 0.25,
    dc: 0.1,
    sp: 0.08,
    df: 0.08,
    arm: 0.04,
    ld: 0,
    stam: 0.03,
  },
};
/**
 * `brk` is the pitcher's best breaking ball. It drives roughly a quarter of the pitcher's
 * strikeout edge in the at-bat model, so an OVR that left it out misjudged which pitchers
 * actually prevent runs, and every OVR-based CPU decision (rotation, cuts, draft, trades)
 * with it.
 */
export const OVR_W_PIT: Record<
  PitcherRole,
  Required<Pick<PlayerParams, 'vel' | 'ctrl' | 'stam' | 'nobi' | 'fld'>> & { brk: number }
> = {
  先発: { vel: 0.19, ctrl: 0.27, stam: 0.2, nobi: 0.15, brk: 0.14, fld: 0.05 },
  リリーフ: { vel: 0.26, ctrl: 0.25, stam: 0.1, nobi: 0.18, brk: 0.15, fld: 0.06 },
  クローザー: { vel: 0.28, ctrl: 0.24, stam: 0.06, nobi: 0.2, brk: 0.16, fld: 0.06 },
};
export const GROW_P: Partial<Record<keyof PlayerParams, { c: number }>> = {
  vel: { c: 0.9 },
  sp: { c: 0.9 },
  stam: { c: 0.8 },
  pw: { c: 0.8 },
  arm: { c: 0.8 },
  cf: { c: 0.7 },
  cb: { c: 0.7 },
  nobi: { c: 0.6 },
  df: { c: 0.7 },
  ctrl: { c: 0.6 },
  dc: { c: 0.6 },
  ld: { c: 0.4 },
};
export const TRAIN_POLICIES: Array<{
  id: TrainPolicyId;
  n: string;
  forBat?: boolean;
  forPit?: boolean;
}> = [
  { id: 'balanced', n: 'バランス', forBat: true, forPit: true },
  { id: 'power', n: '長打特化', forBat: true },
  { id: 'contact', n: 'ミート重視', forBat: true },
  { id: 'speed', n: '走力重視', forBat: true },
  { id: 'defense', n: '守備特化', forBat: true },
  { id: 'velocity', n: '球速重視', forPit: true },
  { id: 'control', n: '制球重視', forPit: true },
  { id: 'stamina_t', n: 'スタミナ重視', forPit: true },
];
