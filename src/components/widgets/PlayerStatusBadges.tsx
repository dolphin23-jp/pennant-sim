import type { Player } from '../../engine';
import { IconMedicalCross, IconSparkle, IconTarget, IconTrendDown, IconTrendUp } from '../icons';

type StatusTone = 'good' | 'slump' | 'injury' | 'growth' | 'convert';

const TONE_ICONS: Record<StatusTone, typeof IconTrendUp> = {
  good: IconTrendUp,
  slump: IconTrendDown,
  injury: IconMedicalCross,
  growth: IconSparkle,
  convert: IconTarget,
};
interface PlayerStatus {
  tone: StatusTone;
  label: string;
  detail: string;
}

const conditionStatus = (player: Player): PlayerStatus | null => {
  const raw = player.condition ?? player.form;
  if (typeof raw === 'string') {
    const normalized = raw.toLowerCase();
    if (['good', 'hot', '好調'].includes(normalized))
      return { tone: 'good', label: '好調', detail: 'コンディション良好' };
    if (['bad', 'cold', '不調'].includes(normalized))
      return { tone: 'slump', label: '不調', detail: 'コンディション低下' };
  }
  if (typeof raw === 'number') {
    if (raw >= 65) return { tone: 'good', label: '好調', detail: `調子 ${raw}` };
    if (raw <= 35) return { tone: 'slump', label: '不調', detail: `調子 ${raw}` };
  }
  if (typeof player.fatigue === 'number') {
    if (player.fatigue >= 70)
      return { tone: 'slump', label: '不調', detail: `疲労 ${Math.round(player.fatigue)}` };
    if (player.fatigue <= 10)
      return { tone: 'good', label: '好調', detail: `疲労 ${Math.round(player.fatigue)}` };
  }
  return null;
};

export function getPlayerStatuses(player: Player): PlayerStatus[] {
  const statuses: PlayerStatus[] = [];
  if ((player.injuryDays ?? 0) > 0) {
    statuses.push({
      tone: 'injury',
      label: '故障',
      detail: `復帰まで${player.injuryDays}日`,
    });
  } else {
    const condition = conditionStatus(player);
    if (condition) statuses.push(condition);
  }

  const growthLog = player.growthLog ?? [];
  const latestGrowth = growthLog[growthLog.length - 1];
  const growing =
    Boolean(player.seasonAwakenDone) ||
    Boolean(latestGrowth?.isBreakthrough) ||
    (latestGrowth?.delta ?? 0) >= 3;
  if (growing) {
    statuses.push({ tone: 'growth', label: '成長中', detail: '最近大きな能力上昇あり' });
  }

  if (player.conversionTarget) {
    const apt = player.positions?.find((entry) => entry.pos === player.conversionTarget?.pos)?.apt;
    statuses.push({
      tone: 'convert',
      label: 'コンバート中',
      detail: `${player.conversionTarget.pos}への守備適性訓練中${apt === undefined ? '' : `（適性${apt}%）`}`,
    });
  }
  return statuses;
}

export function PlayerStatusBadges({
  player,
  compact = false,
}: {
  player: Player;
  compact?: boolean;
}) {
  const statuses = getPlayerStatuses(player);
  if (!statuses.length) return null;
  return (
    <span
      className={`status-badges${compact ? ' status-badges--compact' : ''}`}
      aria-label={statuses.map((status) => `${status.label}: ${status.detail}`).join('、')}
    >
      {statuses.map((status) => {
        const Icon = TONE_ICONS[status.tone];
        return (
          <span
            className={`status-badge status-badge--${status.tone}`}
            key={status.tone}
            title={status.detail}
          >
            <Icon size={11} />
            {status.label}
          </span>
        );
      })}
    </span>
  );
}
