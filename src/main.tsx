import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './styles.css';
import './styles/confirm-dialog.css';
import './styles/dashboard.css';
import './styles/game-detail.css';
import './styles/game-results.css';
import './styles/history.css';
import './styles/play-by-play.css';
import './styles/player-tables.css';
import './styles/postseason.css';
import './styles/roster.css';
import './styles/schedule.css';
import './styles/scoreboard.css';
import './styles/season-nav.css';
import './styles/standings.css';
import './styles/team-select.css';
import './styles/title.css';
import './styles/year-review.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
