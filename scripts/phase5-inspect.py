from pathlib import Path

lines=[]
for path in Path('src').rglob('*'):
    if not path.is_file() or path.suffix not in {'.ts','.tsx','.css'}:
        continue
    text=path.read_text(errors='ignore')
    if any(k in text for k in ['RankingTab','rank-leader','ランキング','yearlyStats']):
        lines.append(f'===== {path} =====\n')
        for i,line in enumerate(text.splitlines(),1):
            if any(k in line for k in ['RankingTab','rank-leader','ランキング','yearlyStats']):
                start=max(1,i-20); end=min(len(text.splitlines()),i+80)
                block='\n'.join(f'{n}: {text.splitlines()[n-1]}' for n in range(start,end+1))
                lines.append(block+'\n')
Path('phase5-inspect.txt').write_text('\n'.join(lines))
