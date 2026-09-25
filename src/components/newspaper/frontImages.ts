import celebration from '../../assets/celebration-night.webp';
import scoreboard from '../../assets/scoreboard-night.webp';
import stadium from '../../assets/stadium-lights.webp';
import type { FrontImage } from './newspaperLayout';

/** Photos for the front page: illustrations of made-up ballparks (docs/asset-credits.md). */
const FRONT_IMAGES: Record<FrontImage, string> = { celebration, stadium, scoreboard };

export const frontImageSrc = (image: FrontImage): string => FRONT_IMAGES[image];
