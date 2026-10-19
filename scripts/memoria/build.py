#!/usr/bin/env python3
"""Compile memoria/*.docx into static reader assets without modifying sources."""
import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
from pathlib import Path
from urllib.parse import quote
from zipfile import ZipFile

from lxml import etree
from export_document import export, sha

MAX_DOCUMENT_BYTES = 50 * 1024 * 1024
MAX_EXPANDED_BYTES = 300 * 1024 * 1024
PARSER = etree.XMLParser(resolve_entities=False, no_network=True)


def identifier(filename):
    """Stable URL slug; reject ambiguous names instead of silently overwriting."""
    if Path(filename).name != filename or filename.startswith(('.', '~$')):
        raise ValueError(f'Invalid document filename: {filename!r}')
    if any(ord(c) < 32 or c in '\\/?#%' for c in filename):
        raise ValueError(f'Unsupported document filename: {filename!r}')
    text = unicodedata.normalize('NFKD', Path(filename).stem)
    text = text.encode('ascii', 'ignore').decode().lower()
    slug = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
    if not slug or len(slug) > 100 or slug in {'assets', 'manifest', 'index'}:
        raise ValueError(f'Choose a clearer document filename: {filename!r}')
    return slug


def validate_docx(path):
    if path.is_symlink() or path.stat().st_size > MAX_DOCUMENT_BYTES:
        raise ValueError(f'Invalid or oversized DOCX: {path.name}')
    with ZipFile(path) as archive:
        if len(set(archive.namelist())) != len(archive.namelist()):
            raise ValueError('Duplicate DOCX ZIP entries are not supported')
        if sum(i.file_size for i in archive.infolist()) > MAX_EXPANDED_BYTES:
            raise ValueError(f'Oversized DOCX archive: {path.name}')
        if 'word/document.xml' not in archive.namelist():
            raise ValueError(f'Not a Word document: {path.name}')
        for info in archive.infolist():
            name = info.filename
            if name.startswith('/') or '..' in Path(name).parts or '\\' in name:
                raise ValueError('Unsafe ZIP member')
            if name.lower().endswith('vbaproject.bin') or name.startswith('word/embeddings/'):
                raise ValueError('Macros and embedded OLE objects cannot be published')
            if name.endswith('.xml') or name.endswith('.rels'):
                raw = archive.read(name)
                if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
                    raise ValueError('XML entities are not supported')
                root = etree.fromstring(raw, PARSER)
                if name.endswith('.rels'):
                    for rel in root:
                        if rel.get('TargetMode') == 'External' and not rel.get('Type', '').endswith('/hyperlink'):
                            raise ValueError('Externally loaded document resources are not supported')
                for node in root.iter():
                    if isinstance(node.tag, str) and etree.QName(node).localname == 'instrText' and re.search(r'\b(DDEAUTO|DDE|INCLUDETEXT|INCLUDEPICTURE|DATABASE|LINK)\b', node.text or '', re.I):
                        raise ValueError('External Word fields are not supported')


def render_pdf(docx, directory, libreoffice):
    # A fresh, disposable profile prevents interaction with desktop LibreOffice.
    profile = directory / 'profile'
    profile.mkdir()
    user = profile / 'user'
    user.mkdir()
    (user / 'registrymodifications.xcu').write_text('''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
</oor:items>''', encoding='utf-8')
    subprocess.run([libreoffice, '-env:UserInstallation=' + profile.as_uri(),
                    '--headless', '--nologo', '--nodefault', '--norestore',
                    '--convert-to', 'pdf:writer_pdf_Export', '--outdir', str(directory), str(docx)],
                   # The generic desktop backend still needs X11 despite
                   # --headless. Use LibreOffice's software-only backend so
                   # conversion also works on display-less CI runners.
                   check=True, timeout=240, env={**os.environ, 'SAL_USE_VCLPLUGIN': 'svp'})
    pdf = directory / (docx.stem + '.pdf')
    if not pdf.is_file() or pdf.stat().st_size < 100:
        raise RuntimeError(f'LibreOffice did not create a PDF for {docx.name}')
    return pdf


def build(source, output, pdf_dir=None, libreoffice='libreoffice', revision=''):
    source, output = source.resolve(), output.resolve()
    if not source.is_dir():
        raise ValueError('Source directory does not exist')
    if source == output or source in output.parents:
        raise ValueError('Output must be outside the source directory')
    if output.exists() and any(output.iterdir()):
        raise ValueError('Output must be empty (use a fresh build directory)')
    files = sorted((p for p in source.iterdir() if p.suffix.lower() == '.docx'), key=lambda p: p.name.casefold())
    if not files:
        raise ValueError('No DOCX files found; refusing to replace publication with an empty library')
    ids = [identifier(p.name) for p in files]
    if len(set(ids)) != len(ids):
        raise ValueError('Two filenames produce the same reader URL; rename one')
    output.mkdir(parents=True, exist_ok=True)
    docs = []
    for docx, slug in zip(files, ids):
        validate_docx(docx)
        title = {
            'teorico-espanol': 'Memoria teórica',
            'anexos-espanol': 'Anexos',
            'teoric-catalan': 'Memòria teòrica',
            'anexos-catalan': 'Annexos',
        }.get(slug, docx.stem.replace('_', ' ').replace('-', ' '))
        with tempfile.TemporaryDirectory(prefix='atlas-memoria-render-') as temporary:
            pdf = pdf_dir / (docx.stem + '.pdf') if pdf_dir else render_pdf(docx, Path(temporary), libreoffice)
            if not pdf.is_file():
                raise ValueError(f'Missing rendered PDF: {pdf}')
            target = output / slug
            audit = export(docx, pdf, target, slug, title)
            # Bad pagination is surfaced, never silently published as exact pages.
            if len(audit['unmatchedPdfAnchors']) > max(3, audit['paragraphs'] * 0.03):
                raise ValueError(f'Too many PDF/text anchor mismatches in {docx.name}')
            data_path = target / 'document.json'
            data = json.loads(data_path.read_text(encoding='utf-8'))
            filename_url = quote(docx.name, safe='')
            data['downloads']['docx'] = '/memoria/' + filename_url
            data['filename'] = docx.name
            data['sourceRevision'] = revision
            data_path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            shutil.copy2(docx, output / docx.name)
            (target / f'{slug}.docx').unlink()  # Only our redundant generated copy.
            docs.append({key: data[key] for key in ('id', 'title', 'filename', 'pageCount', 'wordCount', 'charCount', 'charCountNoSpaces', 'downloads', 'updatedAt', 'sourceHashes')})
            docs[-1]['data'] = f'/memoria/{slug}/document.json'
            docs[-1]['href'] = f'/memoria/{slug}/'
    # Canonical pair first, additional documents alphabetically thereafter.
    docs.sort(key=lambda d: ({'teorico': 0, 'anexos': 1}.get(d['id'], 2), d['title'].casefold()))
    files = [{'path': path.relative_to(output).as_posix(), 'sha256': sha(path), 'size': path.stat().st_size}
             for path in sorted(output.rglob('*')) if path.is_file()]
    manifest = {'schemaVersion': 1, 'sourceRevision': revision, 'documents': docs, 'files': files}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('memoria'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--pdf-dir', type=Path, help='Use already rendered matching PDFs (local verification only)')
    parser.add_argument('--libreoffice', default='libreoffice')
    parser.add_argument('--revision', default=os.environ.get('GITHUB_SHA', ''))
    args = parser.parse_args()
    result = build(args.source, args.output, args.pdf_dir, args.libreoffice, args.revision)
    print(f"Published bundle ready: {len(result['documents'])} documents")
