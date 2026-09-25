import { TINFO } from '../../data';
import { popularityLabel, popularityOf, type Player, type TeamKey } from '../../engine';
import { useGameState } from '../../state/gameState';
import { Card, SectionTitle, teamTextColor } from '../ui';
import { BatterStatLine, PitcherStatLine } from './StatLine';

/** The players the user follows, wherever they now play, with this season's line. */
export function FavoritesCard() {
  const game = useGameState();
  if (!game.teams) return null;
  const found = game.favorites.flatMap((id) => {
    for (const [teamKey, team] of Object.entries(game.teams!) as Array<
      [TeamKey, (typeof game.teams)[TeamKey]]
    >) {
      const player = [...team.fielders, ...team.pitchers].find((candidate) => candidate.id === id);
      if (player) return [{ player, teamKey: teamKey as TeamKey | null }];
    }
    const departed = [...game.retiredPlayers, ...game.overseasPlayers].find(
      (candidate) => candidate.id === id,
    );
    return departed ? [{ player: departed, teamKey: null }] : [];
  });

  return (
    <Card ariaLabel="推し選手" className="favorites-card">
      <SectionTitle>推し選手</SectionTitle>
      {found.length ? (
        <ul className="favorites-list">
          {found.map(({ player, teamKey }: { player: Player; teamKey: TeamKey | null }) => {
            const popularity = popularityOf(player);
            return (
              <li key={player.id}>
                <button
                  type="button"
                  className="favorites-list__player"
                  onClick={() => game.selectPlayer(player)}
                  aria-label={`${player.name}の詳細を表示`}
                >
                  <span className="favorites-list__star" aria-hidden="true">
                    ★
                  </span>
                  <span className="favorites-list__name">{player.name}</span>
                  <span
                    className="favorites-list__team"
                    style={teamKey ? { color: teamTextColor(TINFO[teamKey].c) } : undefined}
                  >
                    {teamKey
                      ? TINFO[teamKey].ab
                      : game.retiredPlayers.some((p) => p.id === player.id)
                        ? '引退'
                        : '海外'}
                  </span>
                  <span className="favorites-list__line">
                    {teamKey ? (
                      player.isP ? (
                        <PitcherStatLine player={player} accumulated={game.leagueAccumulated} />
                      ) : (
                        <BatterStatLine player={player} accumulated={game.leagueAccumulated} />
                      )
                    ) : (
                      '—'
                    )}
                  </span>
                  <span className="favorites-list__popularity">
                    人気 {popularity}・{popularityLabel(popularity)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="favorites-card__empty">
          選手の詳細画面で「☆推し」を押すと、応援したい選手をここに並べて追いかけられます。移籍しても引退しても、ここから見られます。
        </p>
      )}
    </Card>
  );
}
