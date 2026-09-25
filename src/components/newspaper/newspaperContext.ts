import { createContext, useContext } from 'react';

import type { NarrativeArticle } from '../../narrative/types';

/** Opens an article as a newspaper front page (null closes it). */
export const OpenNewspaperContext = createContext<(article: NarrativeArticle | null) => void>(
  () => {},
);

export const useOpenNewspaper = () => useContext(OpenNewspaperContext);
