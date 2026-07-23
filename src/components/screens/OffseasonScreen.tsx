import { useMemo, useState } from 'react';

import { TINFO } from '../../data';
import {
  calcOVR,
  cpuAutoSignMarketRounds,
  cpuAutoTradeBetweenTeams,
  genForeignMarket,
  genFreeAgentMarket,
  growthPhase,
  signPlayerToTeam,
} from '../../engine';
import type { Player, TeamKey, Teams } from '../../engine';
import { useGameState } from '../../state/gameState';
import { applyTrade, generateTradeOffers } from '../../state/offseason';
import { Button, Card, EmptyState, PageShell, SectionTitle } from '../ui';
import { DraftScreen } from './DraftScreen';
import { MarketScreen } from './MarketScreen';
import { TradeScreen } from './TradeScreen';

type OffseasonPhase = 'growth' | 'retire' | 'fa' | 'foreign' | 'trade' | 'draft';
type GameStateValue = ReturnType<typeof useGameState>;

export function OffseasonScreen() {
  const game = useGameState();
  if (!game.teams || !game.playerTeam) return null;
  return <OffseasonContent game={game} initialTeams={game.teams} playerTeam={game.playerTeam} />;
}

function OffseasonContent({
  game,
  initialTeams,
  playerTeam,
}: {
  game: GameStateValue;
  initialTeams: Teams;
  playerTeam: TeamKey;
}) {
  const [phase, setPhase] = useState<OffseasonPhase>('growth');
  const [growthResult] = useState(() => growthPhase(initialTeams));
  const [workTeams, setWorkTeams] = useState<Teams>(growthResult.teams);
  const [faMarket, setFaMarket] = useState<Player[]>(() => genFreeAgentMarket());
  const [foreignMarket, setForeignMarket] = useState<Player[]>(() => genForeignMarket());
  const [retireIds, setRetireIds] = useState<string[]>([]);
  const [tradeOffers, setTradeOffers] = useState(() =>
    generateTradeOffers(growthResult.teams, playerTeam),
  );

  const teamInfo = TINFO[playerTeam];
  const originalPlayers = useMemo(
    () => [...initialTeams[playerTeam].fielders, ...initialTeams[playerTeam].pitchers],
    [initialTeams, playerTeam],
  );
  const growthSummary = useMemo(() => {
    const originalById = new Map(originalPlayers.map((player) => [player.id, player]));
    return [...workTeams[playerTeam].fielders, ...workTeams[playerTeam].pitchers]
      .map((player) => {
        const original = originalById.get(player.id);
        if (!original) return null;
        const difference = calcOVR(player, player.pos) - calcOVR(original, original.pos);
        return Math.abs(difference) >= 3 ? { player, difference } : null;
      })
      .filter(
        (entry): entry is { player: Player; difference: number } => entry !== null,
      )
      .sort((first, second) => Math.abs(second.difference) - Math.abs(first.difference))
      .slice(0, 10);
  }, [originalPlayers, playerTeam, workTeams]);
  const retirementCandidates = useMemo(
    () =>
      [...workTeams[playerTeam].pitchers, ...workTeams[playerTeam].fielders]
        .filter((player) => player.age >= 35)
        .sort(
          (first, second) =>
            calcOVR(first, first.pos) - first.age - (calcOVR(second, second.pos) - second.age),
        )
        .slice(0, 10),
    [playerTeam, workTeams],
  );

  const completeRetirements = () => {
    const selected = new Set(retireIds);
    const team = workTeams[playerTeam];
    setWorkTeams({
      ...workTeams,
      [playerTeam]: {
        ...team,
        pitchers: team.pitchers.filter((player) => !selected.has(player.id)),
        fielders: team.fielders.filter((player) => !selected.has(player.id)),
      },
    });
    setPhase('fa');
  };

  const signFreeAgent = (player: Player) => {
    setWorkTeams((teams) => signPlayerToTeam(teams, playerTeam, player));
    setFaMarket((market) => market.filter((candidate) => candidate.id !== player.id));
  };
  const signForeignPlayer = (player: Player) => {
    setWorkTeams((teams) => signPlayerToTeam(teams, playerTeam, player));
    setForeignMarket((market) => market.filter((candidate) => candidate.id !== player.id));
  };

  return (
    <PageShell>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{game.season.year}年オフシーズン</h1>
        <div style={{ color: '#7f9ab4', fontSize: 12, marginTop: 5 }}>
          成長 → 引退 → FA → 外国人 → トレード → ドラフト / 現在: {phase}
        </div>
      </header>

      {phase === 'growth' && (
        <div>
          <Card style={{ marginBottom: 12 }}>
            <SectionTitle>主な成長</SectionTitle>
            {growthSummary.length ? (
              growthSummary.map(({ player, difference }) => (
                <div
                  key={player.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '7px 0',
                    borderTop: '1px solid #17283a',
                  }}
                >
                  <span>{player.name} / {player.age}歳</span>
                  <strong style={{ color: difference >= 0 ? '#38f27f' : '#ff6b82' }}>
                    {difference > 0 ? '+' : ''}{difference}
                  </strong>
                </div>
              ))
            ) : (
              <EmptyState>大きな能力変動はありません。</EmptyState>
            )}
          </Card>
          <Card style={{ marginBottom: 12 }}>
            <SectionTitle>覚醒イベント</SectionTitle>
            {growthResult.awakeEvents.filter((event) => event.tk === playerTeam).length ? (
              growthResult.awakeEvents
                .filter((event) => event.tk === playerTeam)
                .map((event, index) => (
                  <div key={`${event.player.id}-${index}`} style={{ padding: '7px 0' }}>
                    <strong>{event.name}</strong>
                    <div style={{ color: '#7f9ab4', fontSize: 11 }}>
                      {event.events.map((item) => `${String(item.param)} +${item.boost}`).join(' / ')}
                    </div>
                  </div>
                ))
            ) : (
              <EmptyState>覚醒イベントはありません。</EmptyState>
            )}
          </Card>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setPhase('retire')} color={teamInfo.c}>引退管理へ</Button>
          </div>
        </div>
      )}

      {phase === 'retire' && (
        <div>
          <Card style={{ marginBottom: 12 }}>
            <SectionTitle>引退管理</SectionTitle>
            {!retirementCandidates.length ? (
              <EmptyState>引退検討対象はいません。</EmptyState>
            ) : (
              retirementCandidates.map((player) => {
                const selected = retireIds.includes(player.id);
                return (
                  <label
                    key={player.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderTop: '1px solid #17283a',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setRetireIds((current) =>
                          selected
                            ? current.filter((playerId) => playerId !== player.id)
                            : [...current, player.id],
                        )
                      }
                    />
                    <span style={{ flex: 1 }}>{player.name} / {player.age}歳</span>
                    <strong>OVR {calcOVR(player, player.pos)}</strong>
                  </label>
                );
              })
            )}
          </Card>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => setPhase('growth')} color="#1a2535">戻る</Button>
            <Button onClick={completeRetirements} color={teamInfo.c}>FA市場へ</Button>
          </div>
        </div>
      )}

      {phase === 'fa' && (
        <MarketScreen
          title="FA市場"
          subtitle="国内FA候補です。獲得すると自球団へ加入します。"
          players={faMarket}
          accent={teamInfo.c}
          onSign={signFreeAgent}
          onNext={() => {
            const result = cpuAutoSignMarketRounds(workTeams, faMarket, 'fa', 4);
            setWorkTeams(result.teams);
            setFaMarket(result.remaining);
            setPhase('foreign');
          }}
        />
      )}

      {phase === 'foreign' && (
        <MarketScreen
          title="外国人補強"
          subtitle="外国人候補です。長打力や救援の即戦力が多い市場です。"
          players={foreignMarket}
          accent={teamInfo.c}
          onSign={signForeignPlayer}
          onNext={() => {
            const result = cpuAutoSignMarketRounds(workTeams, foreignMarket, 'foreign', 4);
            const traded = cpuAutoTradeBetweenTeams(result.teams, playerTeam, 8);
            setWorkTeams(traded);
            setForeignMarket(result.remaining);
            setTradeOffers(generateTradeOffers(traded, playerTeam));
            setPhase('trade');
          }}
        />
      )}

      {phase === 'trade' && (
        <TradeScreen
          offers={tradeOffers}
          playerTeam={playerTeam}
          onAccept={(offer) => {
            const next = applyTrade(workTeams, playerTeam, offer);
            setWorkTeams(next);
            setTradeOffers(generateTradeOffers(next, playerTeam));
          }}
          onSkip={() => {
            setWorkTeams(cpuAutoTradeBetweenTeams(workTeams, playerTeam, 3));
            setPhase('draft');
          }}
        />
      )}

      {phase === 'draft' && (
        <DraftScreen
          teams={workTeams}
          playerTeam={playerTeam}
          onComplete={(draftedTeams) => game.completeOffseason(draftedTeams)}
        />
      )}
    </PageShell>
  );
}
