"""Re-evaluate saved traces against a corrected rubric without rerunning the model.

Never overwrite evidence: retain previous validation and record rubric fingerprint.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
from run import grade

if __name__=='__main__':
    os.umask(0o077)
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('questions',type=Path);p.add_argument('destination',type=Path)
    a=p.parse_args()
    if a.destination.exists():raise SystemExit('Never overwrite evidence')
    questions={q['id']:q for q in json.loads(a.questions.read_text())['questions']}
    digest=hashlib.sha256(a.questions.read_bytes()).hexdigest()
    with a.destination.open('x') as stream:
        for line in a.source.read_text().splitlines():
            if not line.strip():continue
            r=json.loads(line);r['previous_validation']=r['validation']
            r['validation']=grade(questions[r['id']],r['before'],r['after'],r['tools'],r['answer'],r.get('error'))
            r['rescored_against_questions_sha256']=digest
            stream.write(json.dumps(r,ensure_ascii=False)+'\n')
