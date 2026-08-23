from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}")
    target.write_text(text.replace(old, new, 1))


def apply_unified_patch(patch_path: str) -> None:
    lines = (ROOT / patch_path).read_text().splitlines(keepends=True)
    index = 0
    while index < len(lines):
        if not lines[index].startswith("diff --git "):
            index += 1
            continue

        match = re.match(r"diff --git a/(.+) b/(.+)\n?$", lines[index])
        if not match:
            raise RuntimeError(f"{patch_path}:{index + 1}: malformed diff header")
        old_path, new_path = match.groups()
        index += 1
        old_header = None
        new_header = None
        hunks: list[tuple[list[str], list[str]]] = []

        while index < len(lines) and not lines[index].startswith("diff --git "):
            line = lines[index]
            if line.startswith("--- "):
                old_header = line[4:].strip()
                index += 1
                continue
            if line.startswith("+++ "):
                new_header = line[4:].strip()
                index += 1
                continue
            if line.startswith("@@ "):
                index += 1
                old_lines: list[str] = []
                new_lines: list[str] = []
                while (
                    index < len(lines)
                    and not lines[index].startswith("@@ ")
                    and not lines[index].startswith("diff --git ")
                ):
                    hunk_line = lines[index]
                    if hunk_line.startswith("\\ No newline at end of file"):
                        index += 1
                        continue
                    if not hunk_line:
                        raise RuntimeError(f"{patch_path}:{index + 1}: empty hunk line")
                    prefix, payload = hunk_line[0], hunk_line[1:]
                    if prefix in (" ", "-"):
                        old_lines.append(payload)
                    if prefix in (" ", "+"):
                        new_lines.append(payload)
                    if prefix not in (" ", "-", "+"):
                        raise RuntimeError(
                            f"{patch_path}:{index + 1}: unexpected hunk prefix {prefix!r}"
                        )
                    index += 1
                hunks.append((old_lines, new_lines))
                continue
            index += 1

        if new_path.endswith(".patch"):
            continue

        target = ROOT / new_path
        if old_header == "/dev/null":
            if target.exists():
                raise RuntimeError(f"{new_path}: new file already exists")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("".join("".join(new) for _, new in hunks))
            continue

        if new_header == "/dev/null":
            if not target.exists():
                raise RuntimeError(f"{old_path}: delete target does not exist")
            target.unlink()
            continue

        if not target.exists():
            raise RuntimeError(f"{new_path}: target file does not exist")
        content = target.read_text()
        for hunk_number, (old_lines, new_lines) in enumerate(hunks, start=1):
            old_text = "".join(old_lines)
            new_text = "".join(new_lines)
            count = content.count(old_text)
            if count != 1:
                raise RuntimeError(
                    f"{new_path}: hunk {hunk_number} expected one exact preimage, found {count}"
                )
            content = content.replace(old_text, new_text, 1)
        target.write_text(content)


def apply_follow_up_edits() -> None:
    replace_once(
        "src/components/widgets/FieldDiagram.tsx",
        "const label = slot === 'extra' ? '追加打者' : slot;",
        "const label = slot === 'extra' ? 'DH' : slot;",
    )
    replace_once(
        "src/engine/aiStrategy.ts",
        "import { selectRosterPool } from './ratings';",
        "import { designatedHitterScore, selectRosterPool } from './ratings';",
    )
    replace_once(
        "src/engine/aiStrategy.ts",
        """  for (const player of [...pool].sort(
    (first, second) =>
      auditLineupCandidate(
        second,
        second.pos as FieldPosition,
        strategy,
        approximatePositionScore(second, second.pos as FieldPosition),
      ).score -
      auditLineupCandidate(
        first,
        first.pos as FieldPosition,
        strategy,
        approximatePositionScore(first, first.pos as FieldPosition),
      ).score,
  )) {""",
        """  for (const player of [...pool].sort(
    (first, second) => designatedHitterScore(second) - designatedHitterScore(first),
  )) {""",
    )
    replace_once(
        "src/engine/aiStrategy.ts",
        "    selected.push({ ...player, _assignedPos: player.pos });",
        "    selected.push({ ...player, _assignedPos: undefined, _isDH: true });",
    )
    replace_once(
        "src/components/screens/DraftScreen.tsx",
        """    let draftTeams = applyDraftPicks(teams, picks);
    const userPick: DraftPick = { ...selected, teamKey: playerTeam, round };""",
        """    const draftTeams = applyDraftPicks(teams, picks);
    const userPick: DraftPick = { ...selected, teamKey: playerTeam, round };""",
    )


if __name__ == "__main__":
    apply_unified_patch("core-overhaul.patch")
    apply_unified_patch("league-overhaul.patch")
    apply_follow_up_edits()
