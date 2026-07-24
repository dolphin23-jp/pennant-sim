import { TINFO } from '../../data';
import { calcOVR, effectiveOVR } from '../../engine';
import type { Player, TeamKey } from '../../engine';
import type { TradeOffer } from '../../state/offseason';
import { Button, Card, EmptyState, SectionTitle, teamTextColor } from '../ui';

function playerOverall(player: Player): number {
  return player.isP ? calcOVR(player) : effectiveOVR(player, player.pos);
}

function TradeSidePanel({
  label,
  player,
  tone,
}: {
  label: string;
  player: Player;
  tone: 'give' | 'receive';
}) {
  const overall = playerOverall(player);
  return (
    <div
      style={{
        padding: 10,
        border: `1px solid ${tone === 'receive' ? 'var(--color-success)' : 'var(--color-danger)'}`,
        borderRadius: 8,
        background:
          tone === 'receive'
            ? 'color-mix(in srgb, var(--color-success) 10%, var(--color-surface-raised))'
            : 'color-mix(in srgb, var(--color-danger) 10%, var(--color-surface-raised))',
      }}
    >
      <div
        style={{
          color: tone === 'receive' ? 'var(--color-success)' : 'var(--color-danger)',
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ fontWeight: 900, marginTop: 5 }}>{player.name}</div>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 3 }}>
        {player.isP ? player.role : player.pos} / OVR {overall}
      </div>
    </div>
  );
}

function TradeOfferCard({
  offer,
  playerTeam,
  onAccept,
}: {
  offer: TradeOffer;
  playerTeam: TeamKey;
  onAccept(offer: TradeOffer): void;
}) {
  const giveOverall = playerOverall(offer.receive);
  const receiveOverall = playerOverall(offer.give);
  const diff = receiveOverall - giveOverall;
  return (
    <Card ariaLabel={offer.summary}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span style={{ color: teamTextColor(TINFO[offer.fromTeam].c), fontWeight: 900, fontSize: 12 }}>
          {TINFO[offer.fromTeam].ab}からのオファー
        </span>
        <span
          className={diff >= 0 ? 'metric-highlight' : undefined}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            color: diff >= 0 ? undefined : 'var(--color-danger)',
          }}
        >
          OVR {diff >= 0 ? '+' : ''}
          {diff}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 10 }}>
        <TradeSidePanel label="あなたが放出" player={offer.receive} tone="give" />
        <TradeSidePanel label="あなたが獲得" player={offer.give} tone="receive" />
      </div>
      {offer.cash > 0 && (
        <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 10 }}>
          金銭 {offer.cash}万円を追加で獲得
        </div>
      )}
      <Button onClick={() => onAccept(offer)} color={TINFO[playerTeam].c} ariaLabel={`${offer.summary}を承諾`}>
        この条件で成立
      </Button>
    </Card>
  );
}

export function TradeScreen({
  offers,
  playerTeam,
  onAccept,
  onSkip,
}: {
  offers: TradeOffer[];
  playerTeam: TeamKey;
  onAccept(offer: TradeOffer): void;
  onSkip(): void;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <SectionTitle>Trade Offers</SectionTitle>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
            届いているオファーをまとめて比較できます。承諾するとその場でトレードが成立します。
          </div>
        </div>
        <Button onClick={onSkip} color="var(--color-surface-muted)" ariaLabel="トレードを見送ってドラフトへ進む">
          見送ってドラフトへ
        </Button>
      </div>

      {!offers.length ? (
        <Card>
          <EmptyState>現時点で有力なオファーはありません。</EmptyState>
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
            gap: 12,
          }}
        >
          {offers.map((offer) => (
            <TradeOfferCard key={offer.id} offer={offer} playerTeam={playerTeam} onAccept={onAccept} />
          ))}
        </div>
      )}
    </div>
  );
}
