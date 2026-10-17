"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "expressions/catalog.json"), "utf8"));
const browserSource = fs.readFileSync(path.join(__dirname, "static/new/expressions-catalog.js"), "utf8");
const faceSource = fs.readFileSync(path.join(__dirname, "static/new/face.js"), "utf8");

// The established idle harness already models blink, lifecycle and timers. Use
// its setup only (never its tests), now loading the complete production bundle.
const idleTest = fs.readFileSync(path.join(__dirname, "test_face_idle.cjs"), "utf8");
const setupSource = idleTest.slice(idleTest.indexOf("function setup("), idleTest.indexOf("\ntest("));
const setup = vm.runInNewContext("const source = " + JSON.stringify(browserSource.replace("globalThis.AtlasExpressionCatalog", "window.AtlasExpressionCatalog") + "\n" + faceSource) + ";\n" + setupSource + ";setup;", {vm,console});

test("catalogue is exactly 23 preserved + 150 original + 150 additional distinct poses", () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.expressions.length, 323);
  assert.equal(catalog.expressions.filter(e=>e.legacy).length,23);
  const added=catalog.expressions.filter(e=>!e.legacy);
  assert.equal(added.length,300);
  assert.equal(added.filter(e=>e.source.collection==='2026-10-16').length,150);
  assert.equal(added.filter(e=>e.source.collection==='2026-10-17').length,150);
  assert.equal(new Set(catalog.expressions.map(e=>e.id)).size,323);
  assert.equal(new Set(added.map(e=>JSON.stringify(e.pose))).size,300,"no pose renamed with a different duration");
  assert.equal(new Set(added.map(e=>e.category)).size,30);
  for(const entry of catalog.expressions){
    assert.match(entry.id,/^[a-z][a-z0-9_]*$/);
    assert.ok(entry.label && entry.trigger && entry.motion.entry && entry.motion.exit);
    assert.ok(entry.motion.entryMs>=100 && entry.motion.entryMs<=300);
    assert.ok(entry.motion.exitMs>=100 && entry.motion.exitMs<=300);
  }
});

test("browser/backend copies agree and catalogue is deeply immutable", () => {
  const context={};vm.runInNewContext(browserSource,context);
  assert.equal(JSON.stringify(context.AtlasExpressionCatalog),JSON.stringify(catalog));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname,"static/new/expressions-catalog.json"),"utf8")),catalog);
  assert.ok(Object.isFrozen(context.AtlasExpressionCatalog.expressions[24].pose.eyes));
});

test("authored transitions are bounded, deliberate and separate from geometry morph time", () => {
  const motions=new Set(['nod','tilt','soft-rise','lift','settle','focus','sway']);
  for(const entry of catalog.expressions.filter(e=>!e.legacy)){
    assert.ok(motions.has(entry.motion.entry),entry.id);
    assert.ok(motions.has(entry.motion.exit),entry.id);
    assert.equal(entry.motion.entryMs,220,entry.id);
    assert.equal(entry.motion.exitMs,220,entry.id);
    const gesture=entry.motion.gesture;
    assert.ok(gesture.durationMs>=350 && gesture.durationMs<=600,entry.id);
    assert.ok(Math.abs(gesture.x)<=5 && Math.abs(gesture.y)<=5,entry.id);
    assert.ok(Math.abs(gesture.rotate)<=2,entry.id);
    assert.ok(gesture.durationMs>entry.motion.entryMs,entry.id);
  }
  assert.equal(catalog.policy.automaticRandomSelection,false);
  assert.equal(catalog.policy.maxChangesPerResponse,2);
  assert.ok(catalog.policy.minHoldMs>=1800);
  assert.ok(catalog.policy.cooldownMs>=2500);
});

test("second collection is explicitly authored, complete and keeps the original scale", () => {
  const authored=require(path.join(root,'expressions/catalog_additions.cjs'));
  assert.equal(Object.keys(authored.groups).length,15);
  const rows=Object.values(authored.groups).flat();
  assert.equal(rows.length,150);
  for(const group of Object.values(authored.groups))assert.equal(group.length,10);
  for(const row of rows){
    const [id,label,trigger,eyes,mouth,brows,accessory,entry,exit]=row.split('|');
    assert.ok(label && trigger.length>30 && eyes && mouth && brows && accessory && entry && exit,id);
    const actual=catalog.expressions.find(e=>e.id===id);
    assert.ok(actual,id);
    assert.equal(actual.source.collection,'2026-10-17');
    assert.equal(actual.pose.stroke,catalog.baseline.mouthStroke);
    assert.ok(actual.pose.mouthShape[0]<=58,id);
  }
});

test("headphone poses never place an eyebrow across the headband", () => {
  const headphonePoses=catalog.expressions.filter(e=>['headphones','headphone_one'].includes(e.pose.accessory));
  assert.ok(headphonePoses.some(e=>e.source.collection==='2026-10-16'));
  assert.ok(headphonePoses.some(e=>e.source.collection==='2026-10-17'));
  for(const entry of headphonePoses)assert.deepEqual(entry.pose.brows,[],entry.id);
  assert.equal(new Set(catalog.expressions.filter(e=>!e.legacy).map(e=>JSON.stringify(e.pose))).size,300,
    'Removing brows must not create visually identical renamed expressions');
});

test("neutral geometry and all legacy poses remain identical to production definitions", () => {
  const first=faceSource.indexOf("  const smile ="),last=faceSource.indexOf("  const expressionCatalog =");
  const legacy=vm.runInNewContext(faceSource.slice(first,last)+";legacyExpressions;");
  for(const entry of catalog.expressions.filter(e=>e.legacy)){
    const {brows,accessory,...pose}=entry.pose;
    assert.equal(JSON.stringify(pose),JSON.stringify(legacy[entry.id]),entry.id);
  }
  assert.equal(catalog.baseline.mouth,"M 737.5 527 Q 795.5 575 853.5 527");
  assert.equal(catalog.baseline.mouthStroke,26);
  assert.deepEqual(catalog.baseline.eyeSockets.map(e=>[e.cx,e.cy,e.rx,e.ry]),[[639.6525,425,56,104],[951.3475,425,56,104]]);
});

test("new expression strokes and eye envelopes cannot enlarge the original face", () => {
  for(const entry of catalog.expressions.filter(e=>!e.legacy)){
    assert.equal(entry.pose.stroke,26,entry.id);
    for(const eye of entry.pose.eyes){
      if(eye.stroke){
        assert.equal(eye.stroke,26);
        assert.equal(eye.d,'M -43 3 Q 0 52 43 3');
        assert.ok(43+eye.stroke/2<=56,"closed eye round caps fit original socket width");
        continue;
      }
      const coords=[...eye.d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)];
      assert.equal(coords.length,64);
      for(const [,x,y] of coords){assert.ok(Math.abs(Number(x))<=56,entry.id);assert.ok(Math.abs(Number(y))<=104,entry.id);}
    }
  }
});

test("all323 poses are manually selectable, audible mouths articulate and restore, return is animated", () => {
  const p=setup(),face=p.window.AtlasFace;
  assert.equal(face.listExpressions().length,323);
  for(const entry of catalog.expressions){
    face.reset();face.update({state:"idle"});
    assert.equal(face.expression({expression:entry.id,source:"command",durationMs:30000}),true,entry.id);
    assert.equal(face.snapshot().expression,entry.id);
    assert.equal(face.snapshot().category,entry.category);
    if(entry.id==='neutral')continue;
    const rest=p.node('.face-mouth').getAttribute('d');
    face.update({state:'speaking'});face.outputLevel({rms:.2});p.flushFrame();
    assert.notEqual(p.node('.face-mouth').getAttribute('d'),rest,entry.id);
    face.update({state:'idle'});
    assert.equal(p.node('.face-mouth').getAttribute('d'),rest,entry.id);
    assert.equal(face.expression({expression:'neutral',source:'command'}),true);
    assert.equal(p.stage.getAttribute('data-expression-transition'),'true');
    p.advance(300);
    assert.equal(face.snapshot().expression,'neutral');
    assert.equal(p.stage.hasAttribute('data-expression-transition'),false);
  }
});

test("model/event changes are limited per response, command does not get stuck behind cooldown", () => {
  const p=setup(),face=p.window.AtlasFace;
  face.beginResponse('turn-1');
  assert.equal(face.expression({expression:'intrigued',source:'model'}),true);
  assert.equal(face.expression({expression:'intrigued',source:'model'}),true);
  assert.equal(face.snapshot().responseExpressionCount,1);
  assert.equal(face.expression({expression:'tv_connected',source:'event'}),false);
  p.advance(2501);
  assert.equal(face.expression({expression:'tv_connected',source:'event'}),true);
  p.advance(2501);
  assert.equal(face.expression({expression:'music_headphones',source:'model'}),false);
  assert.equal(face.snapshot().responseExpressionCount,2);
  assert.equal(face.expression({expression:'music_headphones',source:'command'}),true);
  face.beginResponse('turn-2');
  assert.equal(face.expression({expression:'supportive',source:'model'}),true);
  assert.equal(face.snapshot().responseExpressionCount,1);
});

test("duplicate chunks do not keep an autonomous pose alive indefinitely", () => {
  const p=setup(),face=p.window.AtlasFace;
  face.expression({expression:'intrigued',source:'model',durationMs:3000});
  p.advance(2100);face.expression({expression:'intrigued',source:'model',durationMs:30000});
  p.advance(901);assert.equal(face.snapshot().expression,'neutral');
});

test("cancelling a response bypasses exhausted budgets but preserves manual poses and local gestures", () => {
  const p=setup(),face=p.window.AtlasFace;
  face.expression({expression:'intrigued',source:'model'});p.advance(2501);
  face.expression({expression:'success',source:'event'});
  assert.equal(face.snapshot().responseExpressionCount,2);
  assert.equal(face.clearAutonomous(),true);assert.equal(face.snapshot().expression,'neutral');
  face.expression({expression:'asleep',source:'command'});
  assert.equal(face.clearAutonomous(),false);assert.equal(face.snapshot().expression,'asleep');
  face.reset();face.expression({expression:'intrigued',source:'model'});
  face.expression({expression:'delighted',source:'petting'});
  face.clearAutonomous();assert.equal(face.snapshot().expression,'delighted');
  p.advance(6001);assert.equal(face.snapshot().expression,'neutral');
});

test("catalogue does not schedule random idle poses, and reduced motion/hidden state release resources", () => {
  const p=setup(),face=p.window.AtlasFace;
  p.advance(60000);assert.equal(face.snapshot().expression,'neutral');
  assert.equal(p.rafRequests,0);
  p.media.matches=true;p.media.emit('change');
  face.expression({expression:'music_headphones',source:'command',durationMs:4000});
  assert.equal(p.stage.hasAttribute('data-expression-transition'),false);
  p.advance(4001);assert.equal(face.snapshot().expression,'neutral');
  face.expression({expression:'intrigued',source:'command'});
  p.hideContent(true);assert.equal(p.timers.size,0);assert.equal(p.frames.size,0);
  assert.equal(face.expression({expression:'success',source:'command'}),false);
  p.hideContent(false);assert.equal(face.snapshot().expression,'neutral');
});
