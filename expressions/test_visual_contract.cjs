#!/usr/bin/env node
'use strict';

// Silent, actual Chromium checks of the shipped SVG/CSS and audio lifecycle.
// Browser plugin not available: use the established local Playwright fixture.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../.atlas/webscreen/static');
const out=path.join(__dirname,'qa');
const catalog=require('./catalog.json').expressions;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8')
  .replace('<body>','<body data-design="new">')
  .replace('id="webscreen-content" hidden inert','id="webscreen-content"')
  .replace('class="access-blocked"','class="access-blocked" hidden')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace('</head>','<link rel="icon" href="data:,"><link rel="stylesheet" href="/new/face.css"></head>')
  .replace('</body>','<script src="/new/expressions-catalog.js"></script><script src="/new/face.js"></script><script src="/new/audio.js"></script></body>');
const mime={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  res.setHeader('Cache-Control','no-store');
  if(pathname==='/new/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
  const target=path.resolve(root,'.'+pathname);
  if(!target.startsWith(root+path.sep)){res.writeHead(404).end();return;}
  try{res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.end(fs.readFileSync(target));}
  catch{res.writeHead(404).end();}
});

async function ready(page,url){
  await page.goto(url);
  await page.evaluate(()=>{
    AtlasFaceBridge.update({state:'idle',phase:'EN ESPERA'});
    AtlasFaceBridge.connection({healthy:true,label:'Silent QA'});
  });
  await page.waitForFunction(()=>document.querySelector('.face-stage')?.dataset.presentation==='face'
    && Number(getComputedStyle(document.querySelector('.face-character')).opacity)>.999);
}

async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/new/';
  const browser=await chromium.launch({headless:true,executablePath:process.env.ATLAS_CHROME||'/usr/bin/chromium',args:['--mute-audio']});
  const errors=[],blockedRequests=[],viewports=[];
  try{
    fs.mkdirSync(out,{recursive:true});
    const page=await browser.newPage({viewport:{width:1591,height:989}});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/*',route=>{
      if(route.request().url().startsWith(origin+'/'))return route.continue();
      blockedRequests.push(route.request().url());return route.abort();
    });
    await page.addInitScript(()=>{
      // Explicit tripwires: tests simulate playback events, never produce sound.
      if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{throw Error('QA must not acquire a microphone');};
      if(window.speechSynthesis)window.speechSynthesis.speak=()=>{throw Error('QA must not synthesize audible speech');};
      HTMLMediaElement.prototype.play=function(){throw Error('QA must not play media');};
    });
    for(const viewport of [{width:1591,height:989},{width:1024,height:600}]){
      await page.setViewportSize(viewport);
      await page.emulateMedia({reducedMotion:'reduce'});
      await ready(page,url);
      const result=await page.evaluate(async()=>{
        const assert=(ok,message)=>{if(!ok)throw Error(message);};
        const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
        const entries=AtlasExpressionCatalog.expressions,face=AtlasFace;
        const state=document.querySelector('.face-stage'),mouth=document.querySelector('.face-mouth');
        let brows=0,headphones=0,articulated=0,minBadgeGap=Infinity;
        for(const entry of entries){
          face.reset();face.update({state:'idle'});
          assert(face.expression({expression:entry.id,source:'command',durationMs:30000}),entry.id+': rejected');
          assert(face.snapshot().expression===entry.id,entry.id+': wrong expression');
          assert(state.dataset.presentation==='face',entry.id+': wrong presentation');
          const rest=mouth.getAttribute('d');
          if(!entry.legacy){
            assert(Number(mouth.getAttribute('stroke-width'))===26,entry.id+': mouth weight');
            const decoration=document.querySelector('.face-catalog-decoration-current');
            const eyebrowNodes=[...decoration.querySelectorAll('.face-catalog-brow')];
            for(const eyebrow of eyebrowNodes){
              assert(parseFloat(getComputedStyle(eyebrow).strokeWidth)===26,entry.id+': brow weight');brows++;
            }
            const accessory=decoration.querySelector('.face-catalog-accessory');
            if(['headphones','headphone_one'].includes(entry.pose.accessory)){
              assert(eyebrowNodes.length===0,entry.id+': brow crosses band');
              assert(parseFloat(getComputedStyle(accessory.querySelector('path')).strokeWidth)===26,entry.id+': band weight');
              const pads=[...accessory.querySelectorAll('rect')];assert(pads.length===2,entry.id+': two pads');
              for(const pad of pads){assert(getComputedStyle(pad).fill!=='none',entry.id+': hollow pad');assert(getComputedStyle(pad).stroke==='none',entry.id+': outlined pad');}
              headphones++;
            }
            const nodes=[mouth,...document.querySelectorAll('.face-catalog-eye-current'),...eyebrowNodes];
            if(entry.pose.accessory!=='none')nodes.push(accessory);
            for(const node of nodes){
              const box=node.getBoundingClientRect();
              assert(box.width>0&&box.height>=0,entry.id+': empty geometry');
              assert(box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,entry.id+': clipped geometry');
            }
            if(!['none','headphones','headphone_one','note'].includes(entry.pose.accessory)){
              const gap=accessory.getBoundingClientRect().top-mouth.getBoundingClientRect().bottom;
              minBadgeGap=Math.min(minBadgeGap,gap);assert(gap>0,entry.id+': badge overlaps mouth geometry');
            }
          }
          face.update({state:'speaking'});face.outputLevel({rms:.3,available:true});
          // Renderer intentionally caps visual PCM updates at30fps. Two rAFs
          // can still land just before that boundary on a fast CI browser.
          for(let tries=0;tries<12&&mouth.getAttribute('d')===rest;tries++){
            face.outputLevel({rms:.3,available:true});await frame();
          }
          assert(mouth.getAttribute('d')!==rest,entry.id+': no articulation');
          face.update({state:'idle'});assert(mouth.getAttribute('d')===rest,entry.id+': rest not restored');
          articulated++;
        }
        face.reset();face.update({state:'idle'});
        assert(document.documentElement.scrollWidth<=innerWidth,'horizontal overflow');
        return {poses:entries.length,articulated,brows,headphones,minBadgeGap};
      });
      assert.equal(result.poses,catalog.length);assert.equal(result.articulated,catalog.length);
      viewports.push({viewport,...result});
      await page.evaluate(()=>AtlasFace.expression({expression:'music_attention_split',source:'command',durationMs:30000}));
      await page.screenshot({path:path.join(out,`visual-contract-${viewport.width}x${viewport.height}.png`)});
    }
    await page.setViewportSize({width:1591,height:989});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await ready(page,url);
    await page.evaluate(()=>AtlasFace.expression({expression:'music_soft_beat',source:'command',durationMs:30000}));
    await page.waitForTimeout(290);
    const gesture=await page.evaluate(()=>{
      const stage=document.querySelector('.face-stage'),node=document.querySelector('.face-affect-bounce');
      return {morph:stage.hasAttribute('data-expression-transition'),gesture:stage.hasAttribute('data-expression-gesture'),
        animation:getComputedStyle(node).animationName,duration:getComputedStyle(node).animationDuration,
        active:node.getAnimations().filter(animation=>animation.playState==='running').length};
    });
    assert.equal(gesture.morph,false);assert.equal(gesture.gesture,true);assert.ok(gesture.active>0);
    assert.equal(gesture.animation,'face-catalog-sway');assert.ok(parseFloat(gesture.duration)>.22);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.face-stage').getAttribute('data-expression-gesture'),null);
    // Browser-voice lifecycle simulation, intentionally no speechSynthesis.speak.
    await page.evaluate(()=>{
      AtlasFace.reset();AtlasFaceBridge.update({state:'working'});AtlasFace.beginResponse('silent-lease');
      if(!AtlasFaceBridge.expression({expression:'music_attention_split',source:'model',awaitSpeech:true,durationMs:1800}))throw Error('lease rejected');
      window.qaUtterance=new EventTarget();qaUtterance.text='Te sigo. Ya está preparado.';
      window.qaStop=AtlasFaceBridge.watchUtterance(qaUtterance);
    });
    await page.waitForTimeout(2100);
    const waiting=await page.evaluate(()=>AtlasFace.snapshot());
    assert.equal(waiting.expression,'music_attention_split');assert.equal(waiting.awaitingSpeech,true);
    await page.evaluate(()=>qaUtterance.dispatchEvent(new Event('start')));
    await page.waitForFunction(()=>AtlasFace.snapshot().state==='speaking'&&!AtlasFace.snapshot().awaitingSpeech);
    const speaking=await page.evaluate(()=>({snapshot:AtlasFace.snapshot(),mouth:document.querySelector('.face-mouth').getAttribute('d')}));
    assert.equal(speaking.snapshot.expression,'music_attention_split');
    await page.evaluate(()=>{qaUtterance.dispatchEvent(new Event('end'));qaStop();AtlasFaceBridge.expressionPlayback({active:false,final:true});AtlasFaceBridge.update({state:'idle'});});
    assert.equal(await page.evaluate(()=>AtlasFace.snapshot().expression),'neutral');
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.face-stage').getAttribute('data-expression-transition'),null);
    assert.deepEqual(blockedRequests,[]);assert.deepEqual(errors,[]);
    const report={createdAt:new Date().toISOString(),environment:'Actual Chromium SVG/CSS with local-only fixture',
      browserPlugin:'not available; established Playwright fallback',viewports,gesture,
      speechLease:{preservedBeforePlaybackMs:2100,startedBy:'synthetic utterance start',releasedBy:'final playout event',returnedToNeutral:true},
      audioProduced:false,microphoneAcquired:false,providerCalls:0,blockedRequests,errors};
    fs.writeFileSync(path.join(out,'visual-contract-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;server.close();});
