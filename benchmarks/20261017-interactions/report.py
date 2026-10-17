#!/usr/bin/env python3
"""Produce private evidence tables. Review/redact before any public publication."""
import argparse
import csv
import json
import os
from pathlib import Path
import statistics

def percentile(values, fraction):
    values=sorted(values)
    if not values:return None
    position=(len(values)-1)*fraction;lo=int(position);hi=min(len(values)-1,lo+1)
    return round(values[lo]+(values[hi]-values[lo])*(position-lo),1)

def render(source, destination):
    rows=[json.loads(line) for line in source.read_text().splitlines() if line.strip()]
    rows.sort(key=lambda r:r['id'])
    times=[r['first_text_ms'] for r in rows if r.get('first_text_ms') is not None and not r.get('error')]
    scores=[r['validation']['score'] for r in rows]
    summary={'rows':len(rows),'model_errors':sum(bool(r.get('error')) for r in rows),
             'fixture_gap_rows':sum(bool(r['validation']['fixture_unsupported_count']) for r in rows),
             'objective_score_mean':round(statistics.mean(scores),2) if scores else None,
             'safety_only_rows':sum(r['validation'].get('scoring_coverage')=='response_and_safety_only' for r in rows),
             'human_quality_score':None,
             'first_text_ms':{'median':percentile(times,.5),'p90':percentile(times,.9),'p95':percentile(times,.95)},
             'metric':'First streamed text after text submission, NOT first audible word',
             'claim_boundary':'Virtual tool/state evaluation; not a hardware integration or human naturalness grade',
             'categories':{}}
    usage=[u for r in rows for u in r.get('usage',[]) if isinstance(u,dict)]
    summary['reported_tokens']={key:sum(u.get(key,0) for u in usage if isinstance(u.get(key),int)) for key in ('input_tokens','output_tokens','total_tokens')}
    summary['reported_tokens']['cached_input_tokens']=sum((u.get('input_token_details') or {}).get('cached_tokens',0) for u in usage)
    summary['reported_tokens']['note']='Provider counters summed across response continuations, including cached/repeated context; not unique context size or monetary API cost.'
    for category in sorted({r.get('category','') for r in rows}):
        subset=[r for r in rows if r.get('category','')==category]
        summary['categories'][category]={'count':len(subset),'objective_score_mean':round(statistics.mean(r['validation']['score'] for r in subset),2),'fixture_gaps':sum(bool(r['validation']['fixture_unsupported_count']) for r in subset)}
    destination.mkdir(parents=True,exist_ok=True)
    (destination/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    with (destination/'table.csv').open('w',newline='') as stream:
        writer=csv.writer(stream)
        writer.writerow(['ID','PREGUNTA','TIEMPO PRIMER TEXTO (ms, no voz)','RESPUESTA','VALIDEZ OBJETIVA /10','LIMITACIÓN DEL FIXTURE','ERROR'])
        for r in rows:writer.writerow([r['id'],r['prompt'],r.get('first_text_ms'),r['answer'],r['validation']['score'],r['validation']['fixture_unsupported_count'],r.get('error') or ''])
    def cell(value):return str(value).replace('|','\\|').replace('\n','<br>')
    lines=['# ATLAS · batería de interacciones virtuales','',
           '> Resultados privados: revisar posibles datos personales antes de publicar.',
           '> El tiempo es hasta el primer texto, no hasta la primera palabra hablada. La nota mide comprobaciones objetivas, no calidad humana.', '',
           '| ID | PREGUNTA | TIEMPO PRIMER TEXTO | RESPUESTA | VALIDEZ OBJETIVA |',
           '|---|---|---:|---|---:|']
    for r in rows:
        timing=f"{r['first_text_ms']/1000:.2f} s" if r.get('first_text_ms') is not None else '—'
        grade=f"{r['validation']['score']}/10"
        if r['validation']['fixture_unsupported_count']:grade+=' · revisar fixture'
        if r.get('error'):grade+=' · error'
        lines.append('| '+' | '.join(cell(x) for x in [r['id'],r['prompt'],timing,r['answer'],grade])+' |')
    (destination/'TABLA-400.md').write_text('\n'.join(lines)+'\n')
    return summary

if __name__=='__main__':
    os.umask(0o077)
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('destination',type=Path)
    args=parser.parse_args();print(json.dumps(render(args.source,args.destination),ensure_ascii=False,indent=2))
