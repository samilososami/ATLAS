#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const catalog = require('./catalog.json').expressions;
const total = catalog.length;
const latestCollection = [...new Set(catalog.filter(e=>!e.legacy).map(e=>e.source.collection))].sort().at(-1);
const latestCount = catalog.filter(e=>e.source.collection===latestCollection).length;
const musicCount = catalog.filter(e=>e.category==='music').length;

function metadataCheck() {
  const html=fs.readFileSync(path.join(__dirname,'gallery.html'),'utf8');
  assert.ok(html.includes(`<title>ATLAS · ${total} expresiones</title>`));
  const ids=[...html.matchAll(/<article data-id="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids,catalog.map(e=>e.id));
  for(const entry of catalog){
    assert.ok(html.includes(`data-id="${entry.id}" data-category="${entry.category}" data-collection="${entry.source.collection}"`),entry.id);
    assert.ok(html.includes(`href="renders/${entry.id}.png"`),entry.id);
    assert.equal(html.includes(`href="references/${entry.id}.png"`),fs.existsSync(path.join(__dirname,'references',entry.id+'.png')),entry.id);
  }
  const cards=catalog.map(e=>({dataset:{id:e.id,category:e.category,collection:e.source.collection,search:[e.id,e.label,e.trigger].join(' ').toLowerCase()},hidden:false}));
  const fields=Object.fromEntries(['search','category','collection','count'].map(id=>['#'+id,{value:'',textContent:'',addEventListener(){}}]));
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1].split('const localPreview=')[0];
  const run=vm.runInNewContext(script+';filter;', {document:{querySelectorAll:()=>cards,querySelector:selector=>fields[selector]}});
  run();assert.equal(cards.filter(e=>!e.hidden).length,total);
  fields['#collection'].value=latestCollection;run();assert.equal(cards.filter(e=>!e.hidden).length,latestCount);
  fields['#collection'].value='legacy';run();assert.equal(cards.filter(e=>!e.hidden).length,catalog.filter(e=>e.legacy).length);
  fields['#collection'].value='';fields['#category'].value='music';run();assert.equal(cards.filter(e=>!e.hidden).length,musicCount);
  fields['#search'].value='music_headphones';run();assert.equal(cards.filter(e=>!e.hidden).length,1);
  fields['#collection'].value=latestCollection;run();assert.equal(cards.filter(e=>!e.hidden).length,0);
  return {gallery:total,collectionFilter:latestCount,musicFilter:musicCount,search:true,combinedFilter:true};
}
async function main() {
  const metadata=metadataCheck();
  if(process.argv.includes('--metadata-only')){
    console.log(JSON.stringify({...metadata,checks:'metadata and in-memory filter',renderedBrowserQA:'not-run'}));return;
  }
  const { chromium } = require('playwright');
  const browser = await chromium.launch({headless:true,executablePath:process.env.ATLAS_CHROME || '/usr/bin/chromium',args:['--mute-audio']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1100}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:5059/expressions/');
    assert.equal(await page.title(),`ATLAS · ${total} expresiones`);
    assert.equal(await page.locator('article').count(),total);
    await page.locator('#collection').selectOption(latestCollection);
    assert.equal(await page.locator('article:visible').count(),latestCount);
    await page.locator('#collection').selectOption('');
    await page.locator('#category').selectOption('music');
    assert.equal(await page.locator('article:visible').count(),musicCount);
    await page.locator('#search').fill('music_headphones');
    assert.equal(await page.locator('article:visible').count(),1);
    const frame=page.frameLocator('iframe');
    await frame.locator('.face-stage[data-presentation="face"]').waitFor();
    await page.locator('[data-preview="music_headphones"]').click();
    await frame.locator('.face-stage[data-expression="music_headphones"]').waitFor();
    await page.waitForTimeout(500);
    const out=path.join(__dirname,'qa');fs.mkdirSync(out,{recursive:true});
    await page.screenshot({path:path.join(out,'gallery-desktop.png')});
    await frame.locator('.face-stage[data-expression="neutral"]').waitFor({timeout:8000});
    await page.locator('#search').fill('');await page.locator('#category').selectOption('');
    assert.equal(await page.locator('article:visible').count(),total);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(out,'gallery-mobile.png')});
    assert.deepEqual(errors,[]);
    const result={...metadata,livePreview:true,automaticReturn:true,mobileNoOverflow:true,errors};
    fs.writeFileSync(path.join(out,'gallery-results.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
