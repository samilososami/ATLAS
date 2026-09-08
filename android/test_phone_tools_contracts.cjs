#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname,
  "app/src/main/java/dev/atlas/a1/AtlasPhoneTools.java"), "utf8");

// Shared-storage tools accept both canonical absolute paths and convenient
// paths such as "Download", while canonicalization keeps traversal/symlinks
// inside the shared-storage root.
assert.match(source,
  /File target=resolveSharedPath\(p\.optString\("path",""\),true\)/,
  "files.list must use the common secure resolver");
assert.match(source,
  /candidate\.isAbsolute\(\)\?candidate:new File\(root,raw\)/,
  "relative paths must resolve below the shared-storage root");
assert.match(source,
  /!targetPath\.startsWith\(rootPath\)/,
  "canonical targets outside shared storage must be rejected");
assert.match(source,
  /targetPath\.startsWith\(androidData\)/,
  "Android/data must remain inaccessible");

// Preserve the original response contract.
for (const key of ["accessibility", "notificationAccess", "location", "contacts",
  "calendar", "phone", "sms", "files"]) {
  assert.ok(source.includes(`.put("${key}",`), `legacy capability ${key} must remain`);
}

// Expose actual permissions independently instead of collapsing permission
// groups into one misleading boolean.
for (const key of [
  "smsRead", "smsSend", "smsReceive",
  "calendarRead", "calendarWrite",
  "phoneCall", "phoneState", "callLogRead", "callLogWrite",
  "mediaImagesRead", "mediaVideoRead", "mediaAudioRead", "camera",
  "activityRecognition", "bodySensors", "overlay",
  "bluetoothScan", "bluetoothConnect",
  "wifiNearby", "wifiState", "wifiChange",
  "notificationsPost", "notificationAccess"
]) {
  assert.ok(source.includes(`.put("${key}",`), `missing granular permission ${key}`);
}
assert.match(source, /\.put\("permissions",permissions\)/,
  "capabilities must expose granular permissions");
assert.match(source, /\.put\("operations",operations\)/,
  "capabilities must expose callable-operation readiness");

// Known applications launch by human name without Accessibility, screenshots
// or coordinate guessing. Generic launcher labels remain discoverable.
assert.match(source, /case "apps\.launch": return launchApp\(context,p\)/,
  "apps.launch must be a first-class native phone operation");
assert.match(source, /known\.put\("galeria","com\.sec\.android\.gallery3d"\)/,
  "Samsung Gallery must have a deterministic Spanish alias");
assert.match(source, /known\.put\("amazon","com\.amazon\.mShop\.android\.shopping"\)/,
  "Amazon must deterministically launch Amazon Shopping");
assert.match(source, /known\.put\("alexa","com\.amazon\.dee\.app"\)/,
  "Alexa must remain a distinct deterministic app alias");
const directPackageBranch = source.indexOf("if(!packageName.isEmpty()){");
const launcherEnumeration = source.indexOf("queryIntentActivities(query,PackageManager.MATCH_ALL)");
assert.ok(directPackageBranch >= 0 && launcherEnumeration > directPackageBranch,
  "known packages must take the direct branch before launcher enumeration");
assert.match(source.slice(directPackageBranch, launcherEnumeration), /getApplicationInfo\(packageName,0\)/,
  "known packages must resolve directly instead of enumerating every installed launcher");
assert.match(source, /queryIntentActivities\(query,PackageManager\.MATCH_ALL\)/,
  "unknown app names must resolve through launcher labels");
assert.match(source, /getLaunchIntentSenderForPackage\(packageName\)/,
  "launch must work through Android 11+ package visibility");

// The owner-authorized location call returns a directly usable postal address
// when Android's Geocoder can resolve one, while retaining coordinates if it cannot.
assert.match(source, /new Geocoder\(context,Locale\.getDefault\(\)\)/,
  "location.get must reverse-geocode using Android's locale-aware Geocoder");
assert.match(source, /\.put\("formattedAddress",address\.getString\("formatted"\)\)/,
  "location.get must expose a human-readable formattedAddress");
assert.match(source, /\.put\("addressAvailable",false\)/,
  "reverse-geocoding failure must preserve the coordinate response");

// calendar.list returns event provenance plus calendar IDs and a ready-to-use
// subset for calendar.create.
assert.match(source, /CalendarContract\.Instances\.CALENDAR_ID/,
  "events must identify their calendar");
assert.match(source, /CalendarContract\.Calendars\.CALENDAR_ACCESS_LEVEL/,
  "calendar writability must come from provider access level");
assert.match(source,
  /accessLevel>=CalendarContract\.Calendars\.CAL_ACCESS_CONTRIBUTOR/,
  "contributor-or-better calendars must be marked editable");
assert.match(source, /\.put\("calendars",calendars\)/,
  "calendar.list must return discovered calendars");
assert.match(source, /\.put\("editableCalendars",editableCalendars\)/,
  "calendar.list must expose calendars usable by calendar.create");

console.log("Phone tool contracts passed");
