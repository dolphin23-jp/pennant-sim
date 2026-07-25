from pathlib import Path

lines=['COMPONENT FILES']
for path in sorted(Path('src/components').rglob('*')):
    if path.is_file(): lines.append(str(path))
keys=['ranking','rank','leader','stats','record','yearlyStats','careerAccumulated','歴代','ランキング']
for path in Path('src').rglob('*'):
    if not path.is_file() or path.suffix not in {'.ts','.tsx','.css'}:
        continue
    text=path.read_text(errors='ignore')
    lowered=text.lower()
    if any(k.lower() in lowered for k in keys):
        lines.append(f'\n===== {path} =====')
        split=text.splitlines()
        hits=[]
        for i,line in enumerate(split,1):
            if any(k.lower() in line.lower() for k in keys): hits.append(i)
        covered=set()
        for i in hits:
            start=max(1,i-12); end=min(len(split),i+45)
            if any(n in covered for n in range(start,end+1)): continue
            covered.update(range(start,end+1))
            lines.extend(f'{n}: {split[n-1]}' for n in range(start,end+1))
Path('phase5-inspect.txt').write_text('\n'.join(lines))
