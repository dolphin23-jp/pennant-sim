import { useState } from 'react';

import { TINFO } from '../../data';
import { calcOVR, effectiveOVR } from '../../engine';
import type { TeamKey } from '../../engine';
import type { TradeOffer } from '../../state/offseason';
import { Button, Card, EmptyState, SectionTitle } from '../ui';

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
  const [index, setIndex] = useState(0);
  const offer = offers[index];
  if (!offer) {
    return (
      <div>
        <Card style={{ marginBottom: 14 }}>
          <SectionTitle>Trade</SectionTitle>
          <EmptyState>現時点で有力なオファーはありません。</EmptyState>
        </Card>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onSkip} color={TINFO[playerTeam].c}>ドラフトへ</Button>
        </div>
      </div>
    );
  }
  const receiveOverall = offer.receive.isP
    ? calcOVR(offer.receive)
    : effectiveOVR(offer.receive, offer.receive.pos);
  const giveOverall = offer.give.isP
    ? calcOVR(offer.give)
    : effectiveOVR(offer.give, offer.give.pos);
  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <SectionTitle>Trade</SectionTitle>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>{offer.summary}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
          <Card style={{ background: '#0f2233' }}>
            <div style={{ color: '#6f8ca8', fontSize: 11 }}>あなたが放出</div>
            <div style={{ fontWeight: 900, marginTop: 6 }}>{offer.receive.name}</div>
            <div style={{ color: '#90a9bf', fontSize: 11, marginTop: 4 }}>
              {offer.receive.isP ? offer.receive.role : offer.receive.pos} / OVR {receiveOverall}
            </div>
          </Card>
          <Card style={{ background: '#0f2233' }}>
            <div style={{ color: '#6f8ca8', fontSize: 11 }}>あなたが獲得</div>
            <div style={{ fontWeight: 900, marginTop: 6 }}>{offer.give.name}</div>
            <div style={{ color: '#90a9bf', fontSize: 11, marginTop: 4 }}>
              {offer.give.isP ? offer.give.role : offer.give.pos} / OVR {giveOverall}
              {offer.cash ? ` / 金銭 ${offer.cash}万円` : ''}
            </div>
          </Card>
        </div>
      </Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            onClick={() => setIndex((current) => Math.min(offers.length - 1, current + 1))}
            disabled={index >= offers.length - 1}
            color="#1a2535"
          >
            次のオファー
          </Button>
          <Button onClick={onSkip} color="#1a2535">ドラフトへ</Button>
        </div>
        <Button onClick={() => onAccept(offer)} color={TINFO[playerTeam].c}>
          この条件で成立
        </Button>
      </div>
    </div>
  );
}
