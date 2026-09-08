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
