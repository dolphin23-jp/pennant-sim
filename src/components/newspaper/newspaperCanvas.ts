import type { NewspaperFront } from './newspaperLayout';
import { IDEOGRAPHIC_SPACE, verticalCells, verticalColumns } from './newspaperLayout';

/**
 * Draws the front page on a canvas for saving as an image. Canvas has no vertical text,
 * so the columns are set one cell at a time, right to left.
 */
export const PAPER_WIDTH = 1080;
export const PAPER_HEIGHT = 1440;

const SERIF = '"Shippori Mincho B1", "Noto Serif JP", "Yu Mincho", serif';
const SANS = '"Zen Kaku Gothic New", "Noto Sans JP", sans-serif';
const INK = '#1b1712';
const RED = '#b3261e';
const PAPER = '#f2ecdf';

/** Punctuation that sits in the upper right of its cell when set vertically. */
const HANGING = new Set(['、', '。', '，', '．']);
/** Characters turned a quarter when set vertically. */
const ROTATED = new Set(['ー', '―', '…', '〜', '～', '（', '）', '「', '」', '『', '』', '・']);

function drawCell(
  context: CanvasRenderingContext2D,
  cell: string,
  x: number,
  y: number,
  size: number,
) {
  if (/^[0-9]{2,3}$/.test(cell)) {
    // 縦中横: squeeze the digits side by side into one cell.
    context.save();
    context.translate(x, y + size / 2);
    context.scale(1 / Math.max(1, cell.length * 0.55), 1);
    context.fillText(cell, 0, 0);
    context.restore();
    return;
  }
  if (HANGING.has(cell)) {
    context.fillText(cell, x + size * 0.6, y + size * 0.05);
    return;
  }
  if (ROTATED.has(cell)) {
    context.save();
    context.translate(x, y + size / 2);
    context.rotate(Math.PI / 2);
    context.fillText(cell, 0, 0);
    context.restore();
    return;
  }
  context.fillText(cell, x, y + size / 2);
}

/** Sets text in vertical columns from `right`, top at `top`; returns the left edge used. */
function drawVertical(
  context: CanvasRenderingContext2D,
  text: string,
  right: number,
  top: number,
  size: number,
  maxHeight: number,
  gap = size * 0.55,
  maxColumns = Infinity,
): number {
  const perColumn = Math.max(1, Math.floor(maxHeight / size));
  const columns = verticalColumns(text, perColumn).slice(0, maxColumns);
  columns.forEach((column, columnIndex) => {
    const x = right - size / 2 - columnIndex * (size + gap);
    column.forEach((cell, row) => drawCell(context, cell, x, top + row * size, size));
  });
  return right - columns.length * (size + gap) + gap;
}

function rule(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width = 2,
) {
  context.beginPath();
  context.lineWidth = width;
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

export async function drawNewspaper(
  canvas: HTMLCanvasElement,
  front: NewspaperFront,
  image?: HTMLImageElement | null,
): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts) {
    // Draw with whatever is loaded if the web font is slow or blocked.
    await Promise.race([
      Promise.all([
        document.fonts.load(`900 64px "Shippori Mincho B1"`),
        document.fonts.load(`700 24px "Shippori Mincho B1"`),
      ]).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
  canvas.width = PAPER_WIDTH;
  canvas.height = PAPER_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return;
  const margin = 56;

  // Paper
  context.fillStyle = PAPER;
  context.fillRect(0, 0, PAPER_WIDTH, PAPER_HEIGHT);
  const grain = context.createRadialGradient(540, 700, 200, 540, 700, 900);
  grain.addColorStop(0, 'rgba(255,255,255,0)');
  grain.addColorStop(1, 'rgba(120,90,40,0.12)');
  context.fillStyle = grain;
  context.fillRect(0, 0, PAPER_WIDTH, PAPER_HEIGHT);

  // Masthead
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.fillStyle = INK;
  context.font = `900 76px ${SERIF}`;
  context.fillText(front.masthead, margin, 118);
  context.font = `700 22px ${SANS}`;
  context.fillStyle = '#5b5247';
  context.fillText(front.dateLine, margin + 4, 156);
  context.strokeStyle = INK;
  rule(context, margin, 176, PAPER_WIDTH - margin, 176, 5);
  rule(context, margin, 184, PAPER_WIDTH - margin, 184, 1.5);
  // Edition stamp
  context.fillStyle = RED;
  context.fillRect(PAPER_WIDTH - margin - 170, 52, 170, 110);
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.font = `900 72px ${SERIF}`;
  context.fillText(front.edition, PAPER_WIDTH - margin - 85, 134);

  // Banner: white on black, down the right side.
  const top = 212;
  const bannerSize = front.banner.length <= 3 ? 210 : front.banner.length <= 5 ? 150 : 104;
  const bannerCells = verticalCells(front.banner).length;
  const bannerHeight = Math.min(PAPER_HEIGHT - top - 300, bannerCells * bannerSize + 40);
  const bannerRight = PAPER_WIDTH - margin;
  const bannerWidth = bannerSize + 40;
  context.fillStyle = INK;
  context.fillRect(bannerRight - bannerWidth, top, bannerWidth, bannerHeight);
  context.fillStyle = front.teamColor;
  context.fillRect(bannerRight - bannerWidth, top + bannerHeight - 12, bannerWidth, 12);
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `900 ${bannerSize}px ${SERIF}`;
  drawVertical(context, front.banner, bannerRight - 20, top + 20, bannerSize, bannerHeight - 40);

  // Kicker and subhead to the left of the banner.
  context.fillStyle = RED;
  context.font = `900 72px ${SERIF}`;
  let left = drawVertical(
    context,
    front.kicker,
    bannerRight - bannerWidth - 24,
    top + 8,
    72,
    bannerHeight - 16,
    20,
    2,
  );
  context.fillStyle = INK;
  context.font = `700 38px ${SERIF}`;
  left = drawVertical(context, front.subhead, left - 18, top + 8, 38, bannerHeight - 16, 14, 3);

  // Photo, or a team-colored plate when there is no image.
  const photoLeft = margin;
  const photoRight = left - 28;
  const photoHeight = Math.min(bannerHeight, 520);
  if (photoRight - photoLeft > 160) {
    if (image) {
      const ratio = Math.max((photoRight - photoLeft) / image.width, photoHeight / image.height);
      const width = image.width * ratio;
      const height = image.height * ratio;
      context.save();
      context.beginPath();
      context.rect(photoLeft, top, photoRight - photoLeft, photoHeight);
      context.clip();
      context.drawImage(
        image,
        photoLeft + (photoRight - photoLeft - width) / 2,
        top + (photoHeight - height) / 2,
        width,
        height,
      );
      context.restore();
    } else {
      const plate = context.createLinearGradient(photoLeft, top, photoRight, top + photoHeight);
      plate.addColorStop(0, front.teamColor);
      plate.addColorStop(1, INK);
      context.fillStyle = plate;
      context.fillRect(photoLeft, top, photoRight - photoLeft, photoHeight);
      if (front.teamName) {
        context.fillStyle = 'rgba(255,255,255,0.9)';
        context.textAlign = 'center';
        context.font = `900 96px ${SERIF}`;
        context.fillText(front.teamName, (photoLeft + photoRight) / 2, top + photoHeight / 2);
      }
    }
    context.strokeStyle = INK;
    context.lineWidth = 2;
    context.strokeRect(photoLeft, top, photoRight - photoLeft, photoHeight);
  }

  // Body: vertical columns under everything, right to left, in rows of columns.
  const bodyTop = top + Math.max(bannerHeight, photoHeight) + 36;
  context.strokeStyle = INK;
  rule(context, margin, bodyTop - 18, PAPER_WIDTH - margin, bodyTop - 18, 1.5);
  context.fillStyle = INK;
  context.font = `500 27px ${SERIF}`;
  const bodyText = [front.lead, ...front.body].join(IDEOGRAPHIC_SPACE);
  drawVertical(
    context,
    bodyText,
    PAPER_WIDTH - margin,
    bodyTop,
    27,
    PAPER_HEIGHT - bodyTop - 90,
    14,
    Math.floor((PAPER_WIDTH - margin * 2) / 41),
  );

  // Footer
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  rule(context, margin, PAPER_HEIGHT - 60, PAPER_WIDTH - margin, PAPER_HEIGHT - 60, 1.5);
  context.fillStyle = '#6b6154';
  context.font = `500 18px ${SANS}`;
  context.fillText(
    'ペナントシミュレーター内の架空の新聞です。記事はゲーム内の記録にもとづきます。',
    margin,
    PAPER_HEIGHT - 30,
  );
}

export async function newspaperBlob(
  front: NewspaperFront,
  image?: HTMLImageElement | null,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  await drawNewspaper(canvas, front, image);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
