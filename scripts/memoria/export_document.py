#!/usr/bin/env python3
"""Export approved DOCX + its rendered PDF to a reflowable, public reader.

Does not author either source. PDF determines physical page numbers; DOCX is
the authority for semantic text, tables, links and original embedded images.
"""
import argparse, bisect, hashlib, html, io, json, re, shutil, unicodedata
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict
from zipfile import ZipFile
from lxml import etree
from PIL import Image
from pypdf import PdfReader

NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
W='{'+NS['w']+'}'
def norm(s): return ''.join(c for c in unicodedata.normalize('NFKC',s).lower() if c.isalnum())
def plain(p): return ''.join((n.text or '') if n.tag==W+'t' else '\t' if n.tag==W+'tab' else '\n' for n in p.iter() if n.tag in (W+'t',W+'tab',W+'br'))
def esc(s): return html.escape(s,quote=True)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def export(docx,pdf,out,id,title):
    out.mkdir(parents=True,exist_ok=True); (out/'assets').mkdir(exist_ok=True)
    z=ZipFile(docx); root=etree.fromstring(z.read('word/document.xml'))
    relroot=etree.fromstring(z.read('word/_rels/document.xml.rels'))
    rels={r.get('Id'):(r.get('Target'),r.get('TargetMode')) for r in relroot}
    body=root.find('w:body',NS)
    pdfpages=[]
    for page in PdfReader(pdf).pages:
        lines=(page.extract_text() or '').splitlines()
        # Running footer page number is not semantic document content.
        if lines and re.fullmatch(r'\s*\d+\s*',lines[-1]):lines.pop()
        pdfpages.append(norm('\n'.join(lines)))
    starts=[0]
    for t in pdfpages:starts.append(starts[-1]+len(t))
    full=''.join(pdfpages); count=len(pdfpages)
    for sdt in body.findall('w:sdt',NS):
        generated=norm(plain(sdt));at=full.find(generated)
        if generated and at>=0:
            full=full[:at]+'¤'*len(generated)+full[at+len(generated):]
    paragraphs=list(body.findall('.//w:p',NS))
    # TOC is a generated SDT, not duplicate prose. Retain its physical pages.
    toc=set(body.findall('.//w:sdt//w:p',NS))
    paragraphs=[p for p in paragraphs if p not in toc]
    positions={}; cursor=0; warnings=[]
    for p in paragraphs:
        text=plain(p); n=norm(text)
        if not n:continue
        pos=full.find(n,cursor)
        if pos<0:
            # A page break can insert a repeated table header into a paragraph.
            head=n[:min(80,len(n))]; tail=n[-min(80,len(n)):]
            pos=full.find(head,cursor)
            end=full.find(tail,pos+max(0,len(head)-len(tail))) if pos>=0 else -1
            if pos>=0 and end>=pos and end-pos<len(n)+3000:
                positions[p]=(pos,end+len(tail));cursor=pos+len(head);continue
            # Long source URLs may contain zero-width characters in PDF extraction.
            pos=full.find(n[:min(30,len(n))],cursor)
            if pos<0:
                warnings.append({'text':text[:120],'reason':'no exact PDF anchor'})
                pos=cursor
        positions[p]=(pos,pos+len(n));cursor=max(cursor,pos+len(n))
    def pageof(pos):return min(count,max(1,bisect.bisect_right(starts,pos)))
    nextpage=count
    assigned={}
    for p in reversed(paragraphs):
        if p in positions:nextpage=pageof(positions[p][0])
        assigned[p]=nextpage
    pieces=defaultdict(list); texts=defaultdict(list); outline=[]; imagecount=0; pcounter=0
    def image(n):
        nonlocal imagecount
        rid=n.get('{'+NS['r']+'}embed');target=rels.get(rid,(None,None))[0]
        if not target:return ''
        raw=z.read('word/'+target); key=hashlib.sha256(raw).hexdigest()[:16]
        im=Image.open(io.BytesIO(raw)); dest=out/'assets'/f'{key}.webp'
        if not dest.exists(): im.save(dest,'WEBP',lossless=True)
        imagecount+=1
        drawing=n
        while drawing is not None and drawing.tag not in ('{'+NS['wp']+'}inline','{'+NS['wp']+'}anchor'):
            drawing=drawing.getparent()
        parent=n
        while parent is not None and parent.tag!=W+'p':parent=parent.getparent()
        alt=''
        if parent is not None:
            props=drawing.find('wp:docPr',NS) if drawing is not None else None
            if props is not None:alt=props.get('descr','')
            if not alt:
                following=parent.getnext()
                while following is not None:
                    if following.tag==W+'p' and plain(following).strip():
                        alt=plain(following).strip();break
                    following=following.getnext()
        return f'<img src="/memoria/{id}/assets/{key}.webp" width="{im.width}" height="{im.height}" alt="{esc(alt or "Ilustración del documento")}" loading="lazy" decoding="async">'
    def inline(p,start=0,end=None):
        offset=0; result=[]
        def walk(node,link=None):
            nonlocal offset
            if node.tag==W+'hyperlink':
                target=rels.get(node.get('{'+NS['r']+'}id'),('',None))[0]
                link=target if re.match(r'^https?://',target or '') else None
            if node.tag==W+'r':
                props=node.find('w:rPr',NS); s=''
                for child in node:
                    if child.tag==W+'t': t=child.text or ''
                    elif child.tag==W+'tab':t='\t'
                    elif child.tag==W+'br':t='\n'
                    else:
                        for blip in child.findall('.//a:blip',NS):
                            if start==0:s+=image(blip)
                        continue
                    a=max(0,start-offset);b=len(t) if end is None else min(len(t),end-offset)
                    if b>a:s+=esc(t[a:b]).replace('\n','<br>')
                    offset+=len(t)
                if props is not None:
                    def enabled(name):
                        value=props.find('w:'+name,NS)
                        return value is not None and value.get(W+'val','true').lower() not in ('0','false','off')
                    if enabled('b'):s='<strong>'+s+'</strong>'
                    if enabled('i'):s='<em>'+s+'</em>'
                    vert=props.find('w:vertAlign',NS)
                    if vert is not None and vert.get(W+'val') in ('superscript','subscript'):
                        tag='sup' if vert.get(W+'val')=='superscript' else 'sub';s=f'<{tag}>{s}</{tag}>'
                if link and re.match(r'^(?:https?://|#)',link,re.I):s=f'<a href="{esc(link)}" target="_blank" rel="noopener noreferrer">{s}</a>'
                result.append(s)
            else:
                for child in node:walk(child,link)
        walk(p);return ''.join(result)
    def renderp(p,split=True):
        nonlocal pcounter
        pcounter+=1;text=plain(p);style=p.find('w:pPr/w:pStyle',NS);style=style.get(W+'val','') if style is not None else ''
        m=re.match(r'Heading([1-6])',style,re.I);level=int(m[1]) if m else None
        anchor=f'section-{pcounter}' if level else f'paragraph-{pcounter}'
        pg=assigned[p];tag=f'h{min(level+1,6)}' if level else 'p';cls='caption' if 'caption' in style.lower() else 'figure' if p.findall('.//a:blip',NS) else 'document-title' if style.lower()=='title' else ''
        if level:outline.append({'id':anchor,'title':text,'level':level,'page':pg})
        cuts=[(pg,0,len(text))]
        if split and p in positions and not level and text:
            pos,end=positions[p]; last=pageof(max(pos,end-1))
            if last>pg:
                indices=[i for i,c in enumerate(text) if norm(c)];cuts=[];prev=0
                for page in range(pg,last):
                    relative=round((starts[page]-pos)*len(indices)/max(1,end-pos))
                    cut=indices[min(max(relative,0),len(indices)-1)]
                    # Keep words intact in responsive reading mode.
                    while cut<len(text) and cut>0 and not text[cut-1].isspace():cut+=1
                    cuts.append((page,prev,cut));prev=cut
                cuts.append((last,prev,len(text)))
        result=[]
        for part,(page,a,b) in enumerate(cuts):
            content=inline(p,a,b)
            if not content.strip():continue
            attr=f' id="{anchor}"' if not part else ''
            result.append((page,f'<{tag}{attr} class="{cls}">{content}</{tag}>',text[a:b]))
        return result
    source=[]; tables=0
    for el in body:
        if el.tag==W+'p':
            source.append(plain(el))
            for pg,h,t in renderp(el):pieces[pg].append(h);texts[pg].append(t)
        elif el.tag==W+'tbl':
            tables+=1; groups=defaultdict(list)
            for row in el.findall('w:tr',NS):
                ps=row.findall('.//w:p',NS);pg=min((assigned[p] for p in ps),default=1);cells=[];rowtext=[]
                for cell in row.findall('w:tc',NS):
                    cp=cell.findall('w:p',NS);chunks=[]
                    for p in cp:
                        source.append(plain(p));rowtext.append(plain(p))
                        chunks.extend(h for _,h,_ in renderp(p,False))
                    span=cell.find('w:tcPr/w:gridSpan',NS);span=int(span.get(W+'val')) if span is not None else 1
                    head=row.find('w:trPr/w:tblHeader',NS) is not None;ctag='th' if head else 'td'
                    cells.append(f'<{ctag} colspan="{span}">'+''.join(chunks)+f'</{ctag}>')
                groups[pg].append('<tr>'+''.join(cells)+'</tr>');texts[pg].extend(rowtext)
            for pg,rows in groups.items():pieces[pg].append('<div class="table-scroll"><table><tbody>'+''.join(rows)+'</tbody></table></div>')
    pages=[{'number':i,'html':''.join(pieces[i]),'text':'\n'.join(texts[i])} for i in range(1,count+1)]
    # Generated contents pages remain navigable without duplicate index entries.
    for p in pages:
        if not p['html']:p['html']='<p class="reader-index-note">El índice de esta página está disponible en el panel de contenidos del lector.</p>'
    fulltext='\n'.join(source);outputtext='\n'.join(p['text'] for p in pages)
    # Table cells can move around page breaks, but every original semantic char
    # must survive exactly once. Compare multisets in addition to full lengths.
    from collections import Counter
    assert Counter(norm(fulltext))==Counter(norm(outputtext)), 'Semantic text loss or duplication'
    downloads={'docx':f'/memoria/{id}/{id}.docx','pdf':f'/memoria/{id}/{id}.pdf'}
    shutil.copy2(docx,out/f'{id}.docx');shutil.copy2(pdf,out/f'{id}.pdf')
    data={'id':id,'title':title,'pageCount':count,'wordCount':len(re.findall(r'\b\w+(?:[’\'-]\w+)*\b',fulltext)),'charCount':len(fulltext),'charCountNoSpaces':len(re.sub(r'\s','',fulltext)),'pages':pages,'outline':outline,'downloads':downloads,'updatedAt':datetime.now(timezone.utc).isoformat(),'sourceHashes':{'docx':sha(docx),'pdf':sha(pdf)},'pagination':'PDF original; texto redistribuible por página'}
    (out/'document.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    audit={'id':id,'pages':count,'paragraphs':pcounter,'tables':tables,'images':imagecount,'outline':len(outline),'semanticCharacters':len(norm(fulltext)),'textConserved':True,'unmatchedPdfAnchors':warnings,'sourceHashes':data['sourceHashes']}
    print(json.dumps(audit,ensure_ascii=False,indent=2));return audit

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--docx',type=Path,required=True);ap.add_argument('--pdf',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);ap.add_argument('--id',required=True);ap.add_argument('--title',required=True);args=ap.parse_args()
    export(args.docx,args.pdf,args.out,args.id,args.title)
