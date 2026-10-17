"""Export minimal sanitized table only; never publish raw traces or context.

Generated artifacts still require review. Numerical redactions do not alter the
original private evidence or objective checks computed from it.
"""
import argparse
import csv
import json
from pathlib import Path
import re

def sanitized(text):
    text=str(text)
    patterns=[
        (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b','[correo oculto]'),
        (r'(?<!\w)\+?\d[\d -]{8,}\d(?!\w)','[número largo oculto]'),
        (r'\b(?:\d{1,3}\.){3}\d{1,3}\b','[IP oculta]'),
        (r'(?<!\w)-?\d{1,3}[.,]\d{4,}(?!\w)','[coordenada de prueba omitida]'),
        (r'\b(?:sk|ek)[-_][A-Za-z0-9._-]{8,}\b','[secreto oculto]'),
        (r'\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+','[token oculto]'),
    ]
    for pattern,replacement in patterns:text=re.sub(pattern,replacement,text)
    # Keep the public CSV/JSON/Markdown text consistent and repository-friendly;
    # raw evidence retains the provider's original whitespace separately.
    return re.sub(r'[ \t]+$', '', text, flags=re.MULTILINE)

def export(source,destination):
    raw=[json.loads(s) for s in source.read_text().splitlines() if s.strip()]
    rows=[]
    for row in sorted(raw,key=lambda r:r['id']):
        rows.append({'id':row['id'],'question':sanitized(row['prompt']),'answer':sanitized(row['answer']),
                     'first_text_ms':row.get('first_text_ms'),'objective_score':row['validation']['score'],
                     'fixture_gap':bool(row['validation']['fixture_unsupported_count']),
                     'scoring_coverage':row['validation'].get('scoring_coverage'),'error':bool(row.get('error'))})
    destination.mkdir(parents=True,exist_ok=True)
    with (destination/'table.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=rows[0].keys(),lineterminator='\n');writer.writeheader();writer.writerows(rows)
    (destination/'table.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    def cell(x):return str(x).replace('|','\\|').replace('\n','<br>')
    lines=['# 400 interacciones · resultados del modelo en un entorno virtual','',
           'Tiempo hasta el **primer texto**, no hasta la primera palabra hablada. Nota de **comprobaciones automáticas**, no valoración humana de calidad. Las filas con limitaciones del simulador no demuestran un fallo del producto. Datos sensibles y coordenadas de prueba se han omitido de esta copia pública. Las trazas y el contexto privado no se publican.','',
           '| ID | PREGUNTA | PRIMER TEXTO | RESPUESTA | COMPROBACIONES /10 |',
           '|---|---|---:|---|---:|']
    for r in rows:
        score=str(r['objective_score'])+(' · revisar simulador' if r['fixture_gap'] else '')
        if r['scoring_coverage']=='response_and_safety_only':score+=' · solo respuesta/seguridad'
        latency=f"{r['first_text_ms']/1000:.2f} s" if r['first_text_ms'] is not None else '—'
        lines.append('| '+' | '.join(cell(x) for x in (r['id'],r['question'],latency,r['answer'],score))+' |')
    (destination/'TABLA-400.md').write_text('\n'.join(lines)+'\n')
    return len(rows)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('destination',type=Path);a=p.parse_args();print(export(a.source,a.destination))
