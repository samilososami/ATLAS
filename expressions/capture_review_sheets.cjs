#!/usr/bin/env node
'use strict';

// Contact sheets of actual browser-captured PNGs, never generated concepts.
// No microphones, providers, external URLs or device controls are involved.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const assert = require('node:assert/strict');
const catalog = require('./catalog.json').expressions;
const root = __dirname;
const output = path.join(root,'qa/contact-sheets');
const manifestPath = path.join(root,'renders/manifest.json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function completeManifest() {
  try {
    const raw=fs.readFileSync(manifestPath), manifest=JSON.parse(raw);
    if(manifest.captures?.length!==catalog.length || manifest.errors?.length) return null;
    if(manifest.catalogSha256!==hash(fs.readFileSync(path.join(root,'catalog.json')))) return null;
    const ids=new Set(manifest.captures.map(e=>e.expression));
    if(ids.size!==catalog.length || catalog.some(e=>!ids.has(e.id))) return null;
    return {raw,manifest};
  } catch { return null; }
}

async function main() {
  let input=completeManifest();
  if(!input && process.argv.includes('--wait')) {
    const deadline=Date.now()+15*60*1000;
    while(!input && Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,1000));input=completeManifest();
    }
  }
  if(!input) throw Error(`Wait for a complete ${catalog.length}-render manifest before creating review sheets.`);
  const files=new Map();
  for(const entry of input.manifest.captures){
    const expected=entry.expression+'.png';
    assert.equal(entry.file,expected);
    const bytes=fs.readFileSync(path.join(root,'renders',expected));
    assert.equal(hash(bytes),entry.sha256,`${expected}: capture changed while reading`);
    files.set('/'+expected,bytes);
  }
  // Freeze input bytes above: a later recapture cannot mix geometry in a sheet.
  const server=http.createServer((req,res)=>{
    const bytes=files.get(new URL(req.url,'http://localhost').pathname);
    if(!bytes){res.writeHead(404).end();return;}
    res.setHeader('Content-Type','image/png');res.end(bytes);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const {chromium}=require('playwright');
  let browser;
  try {
    browser=await chromium.launch({headless:true,executablePath:process.env.ATLAS_CHROME||'/usr/bin/chromium',args:['--mute-audio']});
    const page=await browser.newPage({viewport:{width:1920,height:1780},deviceScaleFactor:1});
    fs.mkdirSync(output,{recursive:true});
    const sheets=[];
    for(let offset=0;offset<catalog.length;offset+=20){
      const entries=catalog.slice(offset,offset+20), number=Math.floor(offset/20)+1;
      await page.setViewportSize({width:1920,height:56+Math.ceil(entries.length/4)*347});
      const html=`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;padding:0;background:#17212e;color:#eef5ff;font-family:Arial,sans-serif}header{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;font-size:20px}main{display:grid;grid-template-columns:repeat(4,480px);gap:0}.card{border:1px solid #506074;background:#050b11;overflow:hidden}.card img{display:block;width:478px;height:297.1px;object-fit:contain}.label{height:47px;padding:5px 9px;font-size:16px;line-height:18px;background:#17212e;white-space:nowrap;overflow:hidden}.label small{font-size:12px;color:#afc3dd}</style></head><body><header><b>ATLAS · capturas reales · hoja ${number}</b><span>${offset+1}–${offset+entries.length} / ${catalog.length}</span></header><main>${entries.map((e,i)=>`<div class="card"><img src="${base}/${e.id}.png" alt="${escape(e.id)}"><div class="label">${offset+i+1}. ${escape(e.id)}<br><small>${escape(e.source.collection)} · ${escape(e.category)}</small></div></div>`).join('')}</main></body></html>`;
      await page.setContent(html);
      await page.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
      const filename=`sheet-${String(number).padStart(2,'0')}.png`;
      await page.screenshot({path:path.join(output,filename),fullPage:true});
      sheets.push({file:filename,firstIndex:offset+1,lastIndex:offset+entries.length,
        entries:entries.map(e=>({id:e.id,collection:e.source.collection,renderSha256:input.manifest.captures.find(c=>c.expression===e.id).sha256}))});
    }
    const report={generatedAt:new Date().toISOString(),kind:'contact sheets of actual renderer PNGs',
      renderManifestSha256:hash(input.raw),catalogSha256:input.manifest.catalogSha256,
      columns:4,maximumRows:5,cardWidth:480,totalExpressions:catalog.length,sheets};
    fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({sheets:sheets.length,expressions:catalog.length,output,renderManifestSha256:report.renderManifestSha256}));
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
