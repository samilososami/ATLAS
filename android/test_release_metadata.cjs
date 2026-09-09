'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const android=__dirname;
const repo=path.dirname(android);

test('0.2.8 Android release metadata is aligned',()=>{
  const gradle=fs.readFileSync(path.join(android,'app/build.gradle'),'utf8');
  const readme=fs.readFileSync(path.join(android,'README.md'),'utf8');
  const notes=fs.readFileSync(path.join(repo,'docs/ANDROID-0.2.8.md'),'utf8');
  assert.match(gradle,/versionCode 22; versionName '0\.2\.8-preview'/);
  assert.match(readme,/^# ATLAS Android · 0\.2\.8 preview$/m);
  assert.match(notes,/^# ATLAS Android 0\.2\.8-preview$/m);
});
