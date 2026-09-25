import { useSettings } from '../../state/settings';
import { useConfirm } from '../ConfirmDialog';
import { useGameState } from '../../state/gameState';
import { Button, Card, SectionTitle } from '../ui';

const YEAR_OPTIONS = [1, 5, 10] as const;

/**
 * Hands whole years to the CPU: the rest of the season, the postseason and an offseason in
 * which the user's club is managed like the others. For players who mostly watch the
 * league's history unfold rather than manage every step.
 */
/** `onFinished` runs once the requested years are done (or stopped), e.g. to open the review. */
export function AutoAdvancePanel({ onFinished }: { onFinished?(): void } = {}) {
  const game = useGameState();
  const { skipConfirmations } = useSettings();
  const progress = game.advanceProgress;

  const confirm = useConfirm();

  const start = async (years: number) => {
    if (
      !skipConfirmations &&
      !(await confirm({
        title: `${years}年分をおまかせで進めますか？`,
        message:
          '自球団のオフシーズン（引退・FA・外国人・ドラフト・戦力整理）もCPUが行います。自球団の選手がトレードに出されることはありません。',
        confirmLabel: `${years}年進める`,
      }))
    )
      return;
    void game.advanceYears(years).then(() => onFinished?.());
  };

  return (
    <Card ariaLabel="おまかせ進行">
      <SectionTitle>おまかせ進行</SectionTitle>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 10 }}>
        レギュラーシーズン・ポストシーズン・オフシーズンをまとめて進めます。1年ごとに自動保存します。
      </div>
      {progress ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span role="status" aria-live="polite" style={{ fontWeight: 800 }}>
            {game.season.year}年を進行中…（{progress.done}/{progress.total}年完了）
          </span>
          <progress value={progress.done} max={progress.total} aria-hidden="true" />
          <Button onClick={game.cancelAdvance} color="var(--color-surface-muted)">
            この年で止める
          </Button>
        </div>
      ) : (
        <nav aria-label="おまかせ進行" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {YEAR_OPTIONS.map((years) => (
            <Button
              key={years}
              onClick={() => void start(years)}
              color="var(--color-surface-muted)"
              ariaLabel={`${years}年分をおまかせで進める`}
            >
              {years}年進める
            </Button>
          ))}
        </nav>
      )}
    </Card>
  );
}
