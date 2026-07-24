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
import { createOffseasonDevelopmentNotices } from '../../state/notices';
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
  const [developmentNotices] = useState(() =>
    createOffseasonDevelopmentNotices(
      initialTeams[playerTeam],
      growthResult.teams[playerTeam],
      growthResult.awakeEvents,
      playerTeam,
      game.season.year,
    ),
  );
  const [workTeams, setWorkTeams] = useState<Teams>(growthResult.teams);
  const [faMarket, setFaMarket] = useState<Player[]>(() => genFreeAgentMarket());
  const [foreignMarket, setForeignMarket] = useState<Player[]>(() => genForeignMarket());
  const [retireIds, setRetireIds] = useState<string[]>([]);
  const [tradeOffers, setTradeOffers] = useState(() =>
    generateTradeOffers(growthResult.teams, playerTeam),
  );

  const teamInfo = TINFO[playerTeam];
  const grownPlayerById = useMemo(
    () =>
      new Map(
        [
          ...growthResult.teams[playerTeam].fielders,
          ...growthResult.teams[playerTeam].pitchers,
        ].map((player) => [player.id, player]),
      ),
    [growthResult.teams, playerTeam],
  );
  const growthSummary = developmentNotices.filter((notice) => notice.kind === 'growth');
  const awakeningSummary = developmentNotices.filter((notice) => notice.kind === 'awakening');
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
        <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 5 }}>
          成長 → 引退 → FA → 外国人 → トレード → ドラフト / 現在: {phase}
        </div>
      </header>

      {phase === 'growth' && (
        <div>
          <Card style={{ marginBottom: 12 }}>
            <SectionTitle>主な成長</SectionTitle>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 11, marginBottom: 8 }}>
              OVRが3以上変動した選手を最大10名表示します。この内容は翌季の通知にも保存されます。
            </div>
            {growthSummary.length ? (
              <div style={{ display: 'grid', gap: 7 }}>
                {growthSummary.map((notice) => {
                  const player = notice.playerId ? grownPlayerById.get(notice.playerId) : null;
                  return (
                    <article
                      key={notice.id}
                      style={{
                        padding: '9px 10px',
                        border: '1px solid var(--color-border)',
                        borderLeft: `4px solid ${notice.tone === 'warn' ? 'var(--color-warning)' : 'var(--color-success)'}`,
                        borderRadius: 9,
                        background: 'var(--color-surface-raised)',
                      }}
                    >
                      {player ? (
                        <button
                          type="button"
                          className="roster-player-button"
                          aria-label={`${notice.title}。${player.name}の詳細を表示`}
                          onClick={() => game.selectPlayer(player)}
                        >
                          {notice.title}
                        </button>
                      ) : (
                        <strong>{notice.title}</strong>
                      )}
                      <div
                        style={{
                          marginTop: 4,
                          color: 'var(--color-text-muted)',
                          fontSize: 11,
                          lineHeight: 1.6,
                        }}
                      >
                        {notice.body}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState>大きな能力変動はありません。</EmptyState>
            )}
          </Card>
          <Card style={{ marginBottom: 12 }}>
            <SectionTitle>覚醒イベント</SectionTitle>
            {awakeningSummary.length ? (
              <div style={{ display: 'grid', gap: 7 }}>
                {awakeningSummary.map((notice) => {
                  const player = notice.playerId ? grownPlayerById.get(notice.playerId) : null;
                  return (
                    <article
                      key={notice.id}
                      style={{
                        padding: '9px 10px',
                        border: '1px solid var(--color-border)',
                        borderLeft: '4px solid var(--color-growth)',
                        borderRadius: 9,
                        background:
                          'color-mix(in srgb, var(--color-growth) 8%, var(--color-surface-raised))',
                      }}
                    >
                      {player ? (
                        <button
                          type="button"
                          className="roster-player-button"
                          aria-label={`${notice.title}。${player.name}の詳細を表示`}
                          onClick={() => game.selectPlayer(player)}
                        >
                          {notice.title}
                        </button>
                      ) : (
                        <strong>{notice.title}</strong>
                      )}
                      <div
                        style={{
                          marginTop: 4,
                          color: 'var(--color-text-muted)',
                          fontSize: 11,
                          lineHeight: 1.6,
                        }}
                      >
                        {notice.body}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState>覚醒イベントはありません。</EmptyState>
            )}
          </Card>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setPhase('retire')} color={teamInfo.c}>
              引退管理へ
            </Button>
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
                      borderTop: '1px solid var(--color-border)',
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
            <Button onClick={() => setPhase('growth')} color="var(--color-surface-muted)">
              戻る
            </Button>
            <Button onClick={completeRetirements} color={teamInfo.c}>
              FA市場へ
            </Button>
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
          onComplete={(draftedTeams) => game.completeOffseason(draftedTeams, developmentNotices)}
        />
      )}
    </PageShell>
  );
}
