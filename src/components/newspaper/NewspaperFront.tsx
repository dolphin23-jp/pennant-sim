import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { sound } from '../../audio/sound';
import type { NarrativeArticle } from '../../narrative/types';
import { useFocusTrap } from '../widgets/useFocusTrap';
import { newspaperBlob } from './newspaperCanvas';
import { frontImageSrc } from './frontImages';
import { newspaperFront } from './newspaperLayout';

/** Two or three digits set sideways inside vertical text (縦中横). */
function vertical(text: string): ReactNode[] {
  return text.split(/((?<![0-9])[0-9]{2,3}(?![0-9]))/).map((part, index) =>
    /^[0-9]{2,3}$/.test(part) ? (
      <span key={index} className="paper__tcy">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function NewspaperFrontModal({
  article,
  onClose,
}: {
  article: NarrativeArticle;
  onClose(): void;
}) {
  const front = useMemo(() => newspaperFront(article), [article]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const imageSrc = frontImageSrc(front.image);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    if (front.edition === '号外') sound.play('fanfare');
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [front.edition, onClose]);

  const save = async () => {
    setSaving(true);
    try {
      const image = imageSrc ? await loadImage(imageSrc) : null;
      const blob = await newspaperBlob(front, image);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // ASCII only: some browsers drop a non-ASCII download name.
      link.download = `pennant-sim-${front.articleId.replace(/[^\w-]+/g, '-')}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="paper-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="paper-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${front.edition} ${article.headline}`}
        tabIndex={-1}
      >
        <article className="paper" style={{ '--paper-team': front.teamColor } as CSSProperties}>
          <header className="paper__masthead">
            <div>
              <div className="paper__title">{front.masthead}</div>
              <div className="paper__date">{front.dateLine}</div>
            </div>
            <div className="paper__edition">{front.edition}</div>
          </header>
          <div className="paper__front">
            <h2 className="paper__banner">
              <span className="paper__kicker">{vertical(front.kicker)}</span>
              <span className="paper__banner-text">{vertical(front.banner)}</span>
            </h2>
            <p className="paper__subhead">{vertical(front.subhead)}</p>
            <figure className="paper__photo">
              {imageSrc ? (
                <img src={imageSrc} alt="" />
              ) : (
                <div className="paper__plate">{front.teamName}</div>
              )}
            </figure>
          </div>
          <div className="paper__body">
            <p className="paper__lead">{vertical(front.lead)}</p>
            {front.body.map((text, index) => (
              <p key={index}>{vertical(text)}</p>
            ))}
          </div>
          <footer className="paper__footer">
            ペナントシミュレーター内の架空の新聞です。記事はゲーム内の記録にもとづきます。
          </footer>
        </article>
        <div className="paper-dialog__actions">
          <button type="button" className="live__button" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '画像で保存'}
          </button>
          <button type="button" className="live__button" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
