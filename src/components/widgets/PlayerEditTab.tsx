import { useEffect, useState } from 'react';

import {
  BS,
  CATCH_SP,
  CS2,
  FIELD_POSITIONS,
  MATURITY_TYPES,
  PITCH_TYPES,
  PS,
  SPECIAL_INDEX,
} from '../../data';
import {
  formatManYen,
  hasPositionAptitude,
  kmhToVelocity,
  popularityOf,
  salaryOf,
  specialLevel,
  syncSpecialsFromLevels,
  TEMPERAMENT_LABEL,
  temperamentOf,
  velocityToKmh,
} from '../../engine';
import type {
  FieldPosition,
  PitchDefinition,
  PitcherRole,
  Player,
  PlayerParams,
  SpecialAbility,
} from '../../engine';
import { Button, Card, SectionTitle } from '../ui';
import {
  DEBUG_POTENTIAL_MAX,
  DEBUG_RATING_MAX,
  DEBUG_RATING_MIN,
  parseBoundedInt,
  withAptitude,
  withSpecialLevel,
} from './playerEdit';

const PITCHER_ROLES: PitcherRole[] = ['先発', 'リリーフ', 'クローザー'];

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
  return hasPositionAptitude(player, '捕手')
    ? [...BATTER_PARAM_FIELDS, CATCHER_FIELD]
    : BATTER_PARAM_FIELDS;
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

/**
 * A number typed freely and committed on blur or Enter (Esc restores the stored value).
 * The old field clamped on every keystroke, so typing "25" into age became 15 at the "2".
 */
function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  unit,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(next: number): void;
  unit?: string;
  hint?: string;
}) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const shown = editing ? text : String(value);
  const commit = () => {
    setEditing(false);
    const parsed = parseBoundedInt(text, min, max);
    if (parsed !== null && parsed !== value) onChange(parsed);
  };
  return (
    <div className="debug-field">
      <label>
        {label}
        {unit ? `（${unit}）` : ''}
      </label>
      <input
        type="text"
        inputMode="numeric"
        value={shown}
        aria-label={label}
        onFocus={() => {
          setText(String(value));
          setEditing(true);
        }}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setText(String(value));
            setEditing(false);
            event.currentTarget.blur();
          }
        }}
      />
      <span className="debug-field__hint">{hint ?? `${min}〜${max}`}</span>
    </div>
  );
}

/** 球速 is edited in km/h, the unit shown everywhere else, and stored as the rating. */
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
  return (
    <NumberField
      label={label}
      unit="km/h"
      value={velocityToKmh(rawValue)}
      min={100}
      max={180}
      hint={`100〜180km/h（能力値 ${rawValue}）`}
      onChange={(kmh) =>
        onChangeRaw(Math.min(rawMax, Math.max(DEBUG_RATING_MIN, kmhToVelocity(kmh))))
      }
    />
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(next: string): void;
}) {
  return (
    <div className="debug-field">
      <label>{label}</label>
      <input
        type="text"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange(next: T): void;
}) {
  return (
    <div className="debug-field">
      <label>{label}</label>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PlayerEditTab({ player, onSave }: { player: Player; onSave(next: Player): void }) {
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

  const update = (patch: Partial<Player>) => setDraft((current) => ({ ...current, ...patch }));
  const setParam = (key: keyof PlayerParams, value: number) =>
    setDraft((current) => ({ ...current, p: { ...current.p, [key]: value } }));
  const setPotential = (key: keyof PlayerParams, value: number) =>
    setDraft((current) => ({ ...current, pot: { ...current.pot, [key]: value } }));
  const setPitch = (index: number, patch: Partial<PitchDefinition>) =>
    setDraft((current) => ({
      ...current,
      p: {
        ...current.p,
        pitches: (current.p.pitches ?? []).map((pitch, at) =>
          at === index ? { ...pitch, ...patch } : pitch,
        ),
      },
    }));

  const paramFields = paramFieldsFor(draft);
  const specialPool = specialPoolFor(draft);
  const pitches = draft.p.pitches ?? [];
  const unusedPitchTypes = PITCH_TYPES.filter(
    (type) => !pitches.some((pitch) => pitch.type === type),
  );

  const handleSave = () => {
    onSave(syncSpecialsFromLevels(draft));
    setSavedNotice(true);
  };

  return (
    <div className="detail-grid">
      <div className="debug-banner detail-card--wide">
        デバッグ専用の編集画面です。数値は入力欄を離れるかEnterで確定し（Escで元に戻す）、「保存して反映」でゲームに反映・自動保存されます。通常の育成・成績システムを経由しません。
      </div>

      <Card className="detail-card detail-card--wide" ariaLabel="基本情報の編集">
        <SectionTitle>プロフィール</SectionTitle>
        <div className="debug-field-grid">
          <TextField label="名前" value={draft.name} onChange={(name) => update({ name })} />
          <NumberField
            label="年齢"
            value={draft.age}
            min={15}
            max={50}
            onChange={(age) => update({ age })}
          />
          {draft.isP ? (
            <SelectField
              label="役割"
              value={draft.role ?? '先発'}
              options={PITCHER_ROLES.map((role) => ({ value: role, label: role }))}
              onChange={(role) => update({ role })}
            />
          ) : (
            <SelectField
              label="本職の守備位置"
              value={draft.pos as FieldPosition}
              options={FIELD_POSITIONS.map((pos) => ({ value: pos, label: pos }))}
              onChange={(pos) => setDraft((current) => withAptitude({ ...current, pos }, pos, 100))}
            />
          )}
          <SelectField
            label="投"
            value={draft.hand?.th ?? '右'}
            options={[
              { value: '右', label: '右' },
              { value: '左', label: '左' },
            ]}
            onChange={(th) => update({ hand: { ...draft.hand, th } })}
          />
          <SelectField
            label="打"
            value={draft.hand?.bat ?? '右'}
            options={[
              { value: '右', label: '右' },
              { value: '左', label: '左' },
              { value: '両', label: '両' },
            ]}
            onChange={(bat) => update({ hand: { ...draft.hand, bat } })}
          />
          <SelectField
            label="成長タイプ"
            value={draft.mat}
            options={MATURITY_TYPES.map((type) => ({ value: type, label: type }))}
            onChange={(mat) => update({ mat })}
          />
          <SelectField
            label="潜在クラス"
            value={draft.potentialClass ?? 'standard'}
            options={[
              { value: 'standard', label: 'standard' },
              { value: 'elite', label: 'elite' },
            ]}
            onChange={(potentialClass) => update({ potentialClass })}
          />
          <SelectField
            label="規格外素材"
            value={draft.generationalTalent ? '1' : '0'}
            options={[
              { value: '0', label: 'なし' },
              { value: '1', label: 'あり' },
            ]}
            onChange={(value) => update({ generationalTalent: value === '1' })}
          />
        </div>
      </Card>

      <Card className="detail-card detail-card--wide" ariaLabel="人気・契約・状態の編集">
        <SectionTitle>人気・契約・状態</SectionTitle>
        <div className="debug-field-grid">
          <NumberField
            label="人気"
            value={popularityOf(draft)}
            min={0}
            max={100}
            onChange={(popularity) => update({ popularity })}
          />
          <NumberField
            label="年俸"
            unit="万円"
            value={Math.round(salaryOf(draft))}
            min={0}
            max={1_000_000}
            hint={formatManYen(salaryOf(draft))}
            onChange={(salary) => update({ salary })}
          />
          <NumberField
            label="契約年数"
            value={draft.contractYears ?? 0}
            min={0}
            max={10}
            onChange={(contractYears) => update({ contractYears })}
          />
          <NumberField
            label="FA年数（在籍）"
            value={draft.serviceYears ?? 0}
            min={0}
            max={30}
            onChange={(serviceYears) => update({ serviceYears })}
          />
          <NumberField
            label="故障日数"
            value={draft.injuryDays ?? 0}
            min={0}
            max={365}
            onChange={(injuryDays) => update({ injuryDays })}
          />
          <NumberField
            label="疲労"
            value={Math.round(draft.fatigue ?? 0)}
            min={0}
            max={100}
            onChange={(fatigue) => update({ fatigue })}
          />
          <SelectField
            label="気質"
            value={temperamentOf(draft)}
            options={(['bigStage', 'steady', 'pressure'] as const).map((value) => ({
              value,
              label: TEMPERAMENT_LABEL[value],
            }))}
            onChange={(temperament) => update({ temperament })}
          />
          <SelectField
            label="登録"
            value={draft.activeRoster === false ? 'farm' : 'active'}
            options={[
              { value: 'active', label: '一軍' },
              { value: 'farm', label: '二軍' },
            ]}
            onChange={(value) => update({ activeRoster: value === 'active' })}
          />
        </div>
      </Card>

      <Card className="detail-card detail-card--wide" ariaLabel="能力値と潜在能力の編集">
        <SectionTitle>能力値（現在値 / 潜在上限）</SectionTitle>
        <div className="debug-field-grid">
          {paramFields.map(({ key, label }) => {
            if (key === 'vel')
              return (
                <div key={key} className="debug-field-pair">
                  <VelocityField
                    label={label}
                    rawValue={Number(draft.p.vel ?? 50)}
                    rawMax={DEBUG_RATING_MAX}
                    onChangeRaw={(value) => setParam('vel', value)}
                  />
                  <VelocityField
                    label={`${label}（潜在）`}
                    rawValue={Number(draft.pot.vel ?? draft.p.vel ?? 50)}
                    rawMax={DEBUG_POTENTIAL_MAX}
                    onChangeRaw={(value) => setPotential('vel', value)}
                  />
                </div>
              );
            return (
              <div key={key} className="debug-field-pair">
                <NumberField
                  label={label}
                  value={Number(draft.p[key] ?? 50)}
                  min={DEBUG_RATING_MIN}
                  max={DEBUG_RATING_MAX}
                  onChange={(value) => setParam(key, value)}
                />
                <NumberField
                  label={`${label}（潜在）`}
                  value={Number(draft.pot[key] ?? draft.p[key] ?? 50)}
                  min={DEBUG_RATING_MIN}
                  max={DEBUG_POTENTIAL_MAX}
                  onChange={(value) => setPotential(key, value)}
                />
              </div>
            );
          })}
        </div>
      </Card>

      {draft.isP && (
        <Card className="detail-card detail-card--wide" ariaLabel="球種の編集">
          <SectionTitle>球種</SectionTitle>
          <div className="debug-pitch-list">
            {pitches.map((pitch, index) => (
              <div className="debug-pitch-row" key={`${pitch.type}:${index}`}>
                <SelectField
                  label="球種"
                  value={pitch.type as (typeof PITCH_TYPES)[number]}
                  options={[pitch.type, ...unusedPitchTypes].map((type) => ({
                    value: type as (typeof PITCH_TYPES)[number],
                    label: type,
                  }))}
                  onChange={(type) => setPitch(index, { type })}
                />
                <NumberField
                  label="球威"
                  value={pitch.shr}
                  min={0}
                  max={DEBUG_POTENTIAL_MAX}
                  onChange={(shr) => setPitch(index, { shr })}
                />
                <NumberField
                  label="変化量"
                  value={pitch.brk}
                  min={0}
                  max={DEBUG_POTENTIAL_MAX}
                  onChange={(brk) => setPitch(index, { brk })}
                />
                <NumberField
                  label="制球"
                  value={pitch.ctl}
                  min={0}
                  max={DEBUG_POTENTIAL_MAX}
                  onChange={(ctl) => setPitch(index, { ctl })}
                />
                <Button
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      p: {
                        ...current.p,
                        pitches: (current.p.pitches ?? []).filter((_, at) => at !== index),
                      },
                    }))
                  }
                  color="var(--color-surface-muted)"
                  ariaLabel={`${pitch.type}を削除`}
                  disabled={pitches.length <= 1}
                >
                  削除
                </Button>
              </div>
            ))}
          </div>
          {unusedPitchTypes.length > 0 && (
            <Button
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  p: {
                    ...current.p,
                    pitches: [
                      ...(current.p.pitches ?? []),
                      { type: unusedPitchTypes[0]!, shr: 50, brk: 50, ctl: 50 },
                    ],
                  },
                }))
              }
              color="var(--color-surface-muted)"
              ariaLabel="球種を追加"
            >
              球種を追加
            </Button>
          )}
        </Card>
      )}

      {!draft.isP && (
        <Card className="detail-card detail-card--wide" ariaLabel="守備適性の編集">
          <SectionTitle>守備適性（0で外す）</SectionTitle>
          <div className="debug-field-grid">
            {FIELD_POSITIONS.map((pos) => {
              const current = draft.positions?.find((entry) => entry.pos === pos)?.apt ?? 0;
              return (
                <NumberField
                  key={pos}
                  label={pos === draft.pos ? `${pos}（本職）` : pos}
                  value={current}
                  min={pos === draft.pos ? 1 : 0}
                  max={100}
                  onChange={(value) => setDraft((player) => withAptitude(player, pos, value))}
                />
              );
            })}
          </div>
        </Card>
      )}

      <Card className="detail-card detail-card--wide" ariaLabel="特殊能力の編集">
        <SectionTitle>特殊能力</SectionTitle>
        <div className="debug-field-grid debug-special-grid">
          {specialPool.map((special) => {
            const level = specialLevel(draft, special.id);
            const maxLevel = SPECIAL_INDEX[special.id]?.tierMax ?? special.tierMax;
            return (
              <div className="debug-special-row" key={special.id}>
                <span>
                  {special.n}
                  {special.rarity === 'gold' && (
                    <span className="special-badge special-badge--gold debug-special-row__gold">
                      ★
                    </span>
                  )}
                </span>
                <span className="debug-special-row__level">
                  <button
                    type="button"
                    aria-label={`${special.n}のレベルを下げる`}
                    onClick={() =>
                      setDraft((player) =>
                        withSpecialLevel(player, special.id, Math.max(0, level - 1)),
                      )
                    }
                    disabled={level <= 0}
                  >
                    −
                  </button>
                  <strong className="debug-special-row__value">{level}</strong>
                  <button
                    type="button"
                    aria-label={`${special.n}のレベルを上げる`}
                    onClick={() =>
                      setDraft((player) =>
                        withSpecialLevel(player, special.id, Math.min(maxLevel, level + 1)),
                      )
                    }
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

      <div className="detail-card--wide debug-actions">
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
          <span role="status" className="debug-actions__saved">
            ✓ 反映しました（自動保存されます）。
          </span>
        )}
      </div>
    </div>
  );
}
