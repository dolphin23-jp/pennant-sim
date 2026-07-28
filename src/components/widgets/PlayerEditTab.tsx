import { useEffect, useState } from 'react';

import {
  BS,
  CATCH_SP,
  CS2,
  FIELD_POSITIONS,
  MATURITY_TYPES,
  PLAYER_DEVELOPMENT_BALANCE,
  PS,
  SPECIAL_INDEX,
} from '../../data';
import { hasPositionAptitude, kmhToVelocity, syncSpecialsFromLevels, velocityToKmh } from '../../engine';
import type { FieldPosition, Player, PlayerParams, SpecialAbility } from '../../engine';
import { Button, Card, SectionTitle } from '../ui';

const BATTER_PARAM_FIELDS: Array<{ key: keyof PlayerParams; label: string }> = [
  { key: 'cf', label: '直球対応' },
  { key: 'cb', label: '変化対応' },
  { key: 'pw', label: '長打力' },
  { key: 'dc', label: '選球眼' },
  { key: 'sp', label: '走力' },
  { key: 'df', label: '守備力' },
  { key: 'arm', label: '肩力' },
  { key: 'bnt', label: 'バント' },
  { key: 'stam', label: 'スタミナ' },
];
const CATCHER_FIELD: { key: keyof PlayerParams; label: string } = { key: 'ld', label: 'リード' };
const PITCHER_PARAM_FIELDS: Array<{ key: keyof PlayerParams; label: string }> = [
  { key: 'vel', label: '球速' },
  { key: 'ctrl', label: '制球' },
  { key: 'stam', label: 'スタミナ' },
  { key: 'nobi', label: 'ノビ' },
  { key: 'fld', label: '守備' },
];

// リード is otherwise only shown for a player's primary position - but a batter partway
// (or fully) through catcher conversion can carry catcher aptitude without '捕手' ever
// becoming their primary pos, and debug mode is exactly where you'd want to reach in and
// fix/inspect that value by hand, so the gate matches hasPositionAptitude, not pos alone.
function paramFieldsFor(player: Player): Array<{ key: keyof PlayerParams; label: string }> {
  if (player.isP) return PITCHER_PARAM_FIELDS;
  return hasPositionAptitude(player, '捕手') ? [...BATTER_PARAM_FIELDS, CATCHER_FIELD] : BATTER_PARAM_FIELDS;
}

/** Which special-ability pool applies to this player, mirroring how the engine reads them
 * (pitcher specials + 鉄人 for pitchers; batter specials + 勝負強さ/対エース○ for hitters;
 * catcher-only specials for anyone with catcher aptitude, born or converted). */
function specialPoolFor(player: Player): SpecialAbility[] {
  if (player.isP) return [...PS, ...CS2.filter((special) => special.id === 'iron')];
  const pool = [...BS, ...CS2.filter((special) => special.id !== 'iron')];
  if (hasPositionAptitude(player, '捕手')) pool.push(...CATCH_SP);
  return pool;
}

function clampInt(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(next: number): void;
}) {
  return (
    <div className="debug-field">
      <label>{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(clampInt(event.target.value, min, max, value))}
      />
    </div>
  );
}

const RATING_MIN = 1;
const RATING_MAX = PLAYER_DEVELOPMENT_BALANCE.annualRandomVariation.maximumRating;
const potentialMax = (potentialClass: Player['potentialClass']): number =>
  potentialClass === 'elite'
    ? PLAYER_DEVELOPMENT_BALANCE.potentialCeiling.elite
    : PLAYER_DEVELOPMENT_BALANCE.potentialCeiling.standard;

/** 球速 is displayed everywhere else in km/h now, so editing it as a raw 1-130ish rating
 * here would force guessing the conversion by hand. Shows/accepts km/h directly and
 * converts back to the underlying rating at the boundary; the rating itself is still what
 * gets stored and clamped. */
function VelocityField({
  label,
  rawValue,
  rawMax,
  onChangeRaw,
}: {
  label: string;
  rawValue: number;
  rawMax: number;
  onChangeRaw(nextRaw: number): void;
}) {
  const kmhMin = velocityToKmh(RATING_MIN);
  const kmhMax = velocityToKmh(rawMax);
  return (
    <div className="debug-field">
      <label>{`${label}（km/h）`}</label>
      <input
        type="number"
        min={kmhMin}
        max={kmhMax}
        value={velocityToKmh(rawValue)}
        onChange={(event) => {
          const kmh = clampInt(event.target.value, kmhMin, kmhMax, velocityToKmh(rawValue));
          onChangeRaw(clampInt(String(kmhToVelocity(kmh)), RATING_MIN, rawMax, rawValue));
        }}
      />
    </div>
  );
}

export function PlayerEditTab({
  player,
  onSave,
}: {
  player: Player;
  onSave(next: Player): void;
}) {
  const [draft, setDraft] = useState<Player>(player);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setDraft(player);
    setSavedNotice(false);
    // Reset the draft whenever a different player is opened, not on every prop refresh of
    // the same player (a save round-trips through the parent and would otherwise stomp
    // in-progress edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id]);

  const setParam = (key: keyof PlayerParams, value: number) =>
    setDraft((current) => ({ ...current, p: { ...current.p, [key]: value } }));
  const setPotential = (key: keyof PlayerParams, value: number) =>
    setDraft((current) => ({ ...current, pot: { ...current.pot, [key]: value } }));
  const setAptitude = (pos: FieldPosition, apt: number) =>
    setDraft((current) => {
      const existing = current.positions ?? [];
      const next = existing.some((entry) => entry.pos === pos)
        ? existing.map((entry) => (entry.pos === pos ? { ...entry, apt } : entry))
        : [...existing, { pos, apt }];
      return { ...current, positions: next };
    });
  const setSpecialLevel = (id: string, level: number) =>
    setDraft((current) => {
      const specialLevels = { ...(current.specialLevels ?? {}) };
      if (level <= 0) delete specialLevels[id];
      else specialLevels[id] = level;
      return { ...current, specialLevels };
    });

  const paramFields = paramFieldsFor(draft);
  const specialPool = specialPoolFor(draft);

  const handleSave = () => {
    onSave(syncSpecialsFromLevels(draft));
    setSavedNotice(true);
  };

  return (
    <div className="detail-grid">
      <div className="debug-banner detail-card--wide">
        デバッグ専用の編集画面です。ここでの変更は保存と同時にゲーム内へ即反映され、通常の育成・成績システムを経由しません。バランス調整の検証以外での使用は推奨しません。
      </div>

      <Card className="detail-card" ariaLabel="基本情報の編集">
        <SectionTitle>Profile</SectionTitle>
        <div className="debug-field-grid">
          <div className="debug-field">
            <label htmlFor="debug-age">年齢</label>
            <input
              id="debug-age"
              type="number"
              min={15}
              max={50}
              value={draft.age}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  age: clampInt(event.target.value, 15, 50, current.age),
                }))
              }
            />
          </div>
          <div className="debug-field">
            <label htmlFor="debug-maturity">成長タイプ</label>
            <select
              id="debug-maturity"
              value={draft.mat}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  mat: event.target.value as Player['mat'],
                }))
              }
            >
              {MATURITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="debug-field">
            <label htmlFor="debug-potential-class">潜在クラス</label>
            <select
              id="debug-potential-class"
              value={draft.potentialClass ?? 'standard'}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  potentialClass: event.target.value as Player['potentialClass'],
                }))
              }
            >
              <option value="standard">standard</option>
              <option value="elite">elite</option>
            </select>
          </div>
          <div className="debug-field">
            <label htmlFor="debug-generational">規格外素材</label>
            <select
              id="debug-generational"
              value={draft.generationalTalent ? '1' : '0'}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  generationalTalent: event.target.value === '1',
                }))
              }
            >
              <option value="0">なし</option>
              <option value="1">あり</option>
            </select>
          </div>
        </div>
      </Card>

      <Card className="detail-card detail-card--wide" ariaLabel="能力値と潜在能力の編集">
        <SectionTitle>Parameters（現在値 / 潜在上限）</SectionTitle>
        <div className="debug-field-grid">
          {paramFields.map(({ key, label }) => {
            const potMax = potentialMax(draft.potentialClass);
            if (key === 'vel')
              return (
                <div key={key} style={{ display: 'grid', gap: 6 }}>
                  <VelocityField
                    label={label}
                    rawValue={Number(draft.p.vel ?? 50)}
                    rawMax={RATING_MAX}
                    onChangeRaw={(value) => setParam('vel', value)}
                  />
                  <VelocityField
                    label={`${label}（潜在）`}
                    rawValue={Number(draft.pot.vel ?? draft.p.vel ?? 50)}
                    rawMax={potMax}
                    onChangeRaw={(value) => setPotential('vel', value)}
                  />
                </div>
              );
            return (
              <div key={key} style={{ display: 'grid', gap: 6 }}>
                <NumberField
                  label={label}
                  value={Number(draft.p[key] ?? 50)}
                  min={RATING_MIN}
                  max={RATING_MAX}
                  onChange={(value) => setParam(key, value)}
                />
                <NumberField
                  label={`${label}（潜在）`}
                  value={Number(draft.pot[key] ?? draft.p[key] ?? 50)}
                  min={RATING_MIN}
                  max={potMax}
                  onChange={(value) => setPotential(key, value)}
                />
              </div>
            );
          })}
        </div>
      </Card>

      {!draft.isP && (
        <Card className="detail-card detail-card--wide" ariaLabel="守備適性の編集">
          <SectionTitle>Position Aptitude</SectionTitle>
          <div className="debug-field-grid">
            {FIELD_POSITIONS.map((pos) => {
              const current = draft.positions?.find((entry) => entry.pos === pos)?.apt ?? 0;
              return (
                <NumberField
                  key={pos}
                  label={pos === draft.pos ? `${pos}（本職）` : pos}
                  value={current}
                  min={0}
                  max={100}
                  onChange={(value) => setAptitude(pos, value)}
                />
              );
            })}
          </div>
        </Card>
      )}

      <Card className="detail-card detail-card--wide" ariaLabel="特殊能力の編集">
        <SectionTitle>Special Abilities</SectionTitle>
        <div className="debug-field-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {specialPool.map((special) => {
            const level = draft.specialLevels?.[special.id] ?? 0;
            const maxLevel = SPECIAL_INDEX[special.id]?.tierMax ?? special.tierMax;
            return (
              <div className="debug-special-row" key={special.id}>
                <span>
                  {special.n}
                  {special.rarity === 'gold' && (
                    <span className="special-badge special-badge--gold" style={{ marginLeft: 6 }}>
                      ★
                    </span>
                  )}
                </span>
                <span className="debug-special-row__level">
                  <button
                    type="button"
                    aria-label={`${special.n}のレベルを下げる`}
                    onClick={() => setSpecialLevel(special.id, Math.max(0, level - 1))}
                    disabled={level <= 0}
                  >
                    −
                  </button>
                  <strong style={{ minWidth: 14, textAlign: 'center' }}>{level}</strong>
                  <button
                    type="button"
                    aria-label={`${special.n}のレベルを上げる`}
                    onClick={() => setSpecialLevel(special.id, Math.min(maxLevel, level + 1))}
                    disabled={level >= maxLevel}
                  >
                    ＋
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <div
        className="detail-card--wide"
        style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Button onClick={handleSave} ariaLabel="編集内容を保存して反映">
          保存して反映
        </Button>
        <Button
          onClick={() => {
            setDraft(player);
            setSavedNotice(false);
          }}
          color="var(--color-surface-muted)"
          ariaLabel="編集内容を破棄"
        >
          変更を破棄
        </Button>
        {savedNotice && (
          <span role="status" style={{ color: 'var(--color-success)', fontSize: 12 }}>
            ✓ 反映しました。
          </span>
        )}
      </div>
    </div>
  );
}
