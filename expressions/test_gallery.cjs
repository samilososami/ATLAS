#!/usr/bin/env node
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const browser = await chromium.launch({headless:true,executablePath:process.env.ATLAS_CHROME || '/usr/bin/chromium',args:['--mute-audio']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1100}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:5059/expressions/');
    assert.equal(await page.title(),'ATLAS · 173 expresiones');
    assert.equal(await page.locator('article').count(),173);
    await page.locator('#category').selectOption('music');
    assert.equal(await page.locator('article:visible').count(),10);
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
    assert.equal(await page.locator('article:visible').count(),173);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(out,'gallery-mobile.png')});
    assert.deepEqual(errors,[]);
    const result={gallery:173,musicFilter:10,search:true,livePreview:true,automaticReturn:true,mobileNoOverflow:true,errors};
    fs.writeFileSync(path.join(out,'gallery-results.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
