from pathlib import Path

path = Path('src/components/screens/season/RankingTab.tsx')
text = path.read_text()
import_anchor = "import { Card, EmptyState, SectionTitle, SegmentedControl, teamTextColor } from '../../ui';\n"
import_line = "import { HistoricalRankings } from './HistoricalRankings';\n"
if import_line not in text:
    if import_anchor not in text:
        raise SystemExit('RankingTab import anchor not found')
    text = text.replace(import_anchor, import_anchor + import_line, 1)
render_anchor = "      </section>\n    </div>\n  );\n}\n"
render_replacement = "      </section>\n\n      <HistoricalRankings />\n    </div>\n  );\n}\n"
if '<HistoricalRankings />' not in text:
    if render_anchor not in text:
        raise SystemExit('RankingTab render anchor not found')
    text = text.replace(render_anchor, render_replacement, 1)
path.write_text(text)
