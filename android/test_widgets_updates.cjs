'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const root=__dirname+'/app/src/main/';
const read=p=>fs.readFileSync(root+p,'utf8');
test('widget is home-screen only, resizable, and never smaller than 2x2',()=>{
 const xml=read('res/xml/atlas_widget_info.xml');assert.match(xml,/targetCellWidth="2"/);assert.match(xml,/targetCellHeight="2"/);assert.match(xml,/resizeMode="horizontal\|vertical"/);assert.match(xml,/widgetCategory="home_screen"/);
 const manifest=read('AndroidManifest.xml');assert.match(manifest,/android.permission.ACCESS_NETWORK_STATE/);
 const configure=read('java/dev/atlas/a1/WidgetConfigureActivity.java');assert.ok(configure.indexOf('setContentView(scroll)')<configure.indexOf('getInsetsController()'));
});
test('widget actions open the app and command execution remains behind native confirmation',()=>{
 const widget=read('java/dev/atlas/a1/AtlasWidgetProvider.java');assert.match(widget,/MainActivity\.class/);assert.doesNotMatch(widget,/command\.execute|Runtime\.getRuntime|ProcessBuilder/);
 const main=read('java/dev/atlas/a1/MainActivity.java');assert.match(main,/case "execute"[\s\S]*confirm\(id,"Ejecutar en ATLAS A1"/);
});
test('background refresh is read-only status and visibly timestamped',()=>{
 const job=read('java/dev/atlas/a1/WidgetRefreshJob.java');assert.match(job,/rpc\("status"/);assert.doesNotMatch(job,/command\.|session\.open|terminal\.open/);
 const provider=read('java/dev/atlas/a1/AtlasWidgetProvider.java');assert.match(provider,/putLong\("time"|getLong\("time"/);assert.match(provider,/Lectura antigua/);
});
test('updater locks release source, digest, package, signing identity and newer version',()=>{
 const policy=read('java/dev/atlas/a1/UpdatePolicy.java'),updater=read('java/dev/atlas/a1/AppUpdater.java');
 assert.match(policy,/samilososami\/ATLAS/);assert.match(policy,/github\.com/);assert.match(updater,/sha256:\[0-9a-fA-F\]\{64\}/);assert.match(updater,/getPackageArchiveInfo/);assert.match(updater,/getApkContentsSigners/);assert.match(updater,/getLongVersionCode\(\)<=installed\.getLongVersionCode/);
});
test('settings exposes explicit update and widget controls',()=>{
 const html=read('assets/web/index.html');assert.match(html,/id="check-update"/);assert.match(html,/id="install-update"/);assert.match(html,/id="add-widget"/);
});
