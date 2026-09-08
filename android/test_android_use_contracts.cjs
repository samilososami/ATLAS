#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname,
  "app/src/main/java/dev/atlas/a1/AtlasAccessibilityService.java"), "utf8");

assert.match(source, /"enter"\.equals\(key\).*imeEnter\(\)/s,
  "ENTER must route through the focused IME action");
assert.match(source, /AccessibilityAction\.ACTION_IME_ENTER\.getId\(\)/,
  "ENTER must use ACTION_IME_ENTER, not arbitrary key injection");
assert.match(source, /getLaunchIntentSenderForPackage/,
  "package launch must bypass Android 11+ package visibility through IntentSender");
assert.match(source, /inheritedPassword\|\|node\.isPassword\(\)/,
  "password sensitivity must propagate through the node subtree");
assert.match(source, /password\?redacted:[^\n]*node\.getText\(\)/,
  "password node text must be redacted");
assert.match(source, /password\?redacted:[^\n]*node\.getContentDescription\(\)/,
  "password node descriptions must be redacted");
assert.match(source,
  /code==ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT&&attempt\+1<SCREENSHOT_MAX_ATTEMPTS/,
  "only the short-interval screenshot error may retry");
assert.match(source, /SCREENSHOT_MAX_ATTEMPTS=2/,
  "screenshots must make at most one retry");
assert.match(source, /SCREENSHOT_MAX_WIDTH=640/,
  "captures must be resized before transport");
assert.match(source, /Bitmap\.CompressFormat\.JPEG,SCREENSHOT_JPEG_QUALITY/,
  "captures must use the smaller server-compatible JPEG payload");
assert.match(source, /result\.get\(6,TimeUnit\.SECONDS\)/,
  "a stuck Android capture must fail within the bounded fast deadline");
assert.match(source, /case "click": return onMain\(\(\)->clickLabel\(p\)\)/,
  "semantic click must be a first-class Android Use action");
assert.match(source, /performAction\(AccessibilityNodeInfo\.ACTION_CLICK\)/,
  "semantic click must invoke the accessibility action instead of guessing coordinates");
assert.match(source, /Normalizer\.normalize/,
  "semantic label matching must tolerate case and accents");
assert.match(source, /setGuardPassThrough\(true\)[\s\S]*main\.postDelayed[\s\S]*dispatchGesture/,
  "the overlay must become pass-through before gesture dispatch");
assert.match(source, /GESTURE_OVERLAY_SETTLE_MS=80/,
  "gesture dispatch must wait for WindowManager to publish the input flag");
assert.match(source, /guard\.setVisibility\(passThrough\?View\.INVISIBLE/,
  "the blocking overlay must leave the hit-test surface during injected gestures");
assert.match(source, /FLAG_NOT_TOUCHABLE/,
  "pass-through mode must use FLAG_NOT_TOUCHABLE");
assert.match(source, /onCompleted[^}]*setGuardPassThrough\(false\)/s,
  "completed gestures must restore the blocking overlay");
assert.match(source, /onCancelled[^}]*setGuardPassThrough\(false\)/s,
  "cancelled gestures must restore the blocking overlay");

console.log("Android Use security contracts passed");
