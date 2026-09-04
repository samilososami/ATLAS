'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const root=__dirname+'/app/src/main/';
const read=path=>fs.readFileSync(root+path,'utf8');

test('the main interface shares onboarding tactile and motion tokens',()=>{
  const css=read('assets/web/style.css');
  assert.match(css,/--bg:\s*#071020/);
  assert.match(css,/--accent-gradient:/);
  assert.match(css,/--shadow-blue:/);
  assert.match(css,/--motion-press:\s*110ms/);
  assert.match(css,/translateY\(3px\)/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
});

test('motion is event driven and exposes coherent UI states',()=>{
  const app=read('assets/web/app.js');
  assert.doesNotMatch(app,/setInterval\s*\(/);
  assert.match(app,/prefers-reduced-motion:\s*reduce/);
  for(const state of ['is-busy','is-loading','is-success','is-error']){
    assert.match(app,new RegExp(state));
  }
  assert.match(app,/MutationObserver/);
  assert.match(app,/visibilitychange/);
});

test('sustained effects stop when idle and avoid costly fixed composition',()=>{
  const app=read('assets/web/app.js');
  const voice=read('assets/web/realtime.js');
  const css=read('assets/web/style.css');
  assert.match(voice,/startOutputMeter\(\)/);
  assert.match(voice,/stopOutputMeter\(\)/);
  assert.match(voice,/cancelAnimationFrame\(this\.outputFrame\)/);
  assert.match(voice,/document\.hidden\?this\.stopOutputMeter\(\):this\.startOutputMeter\(\)/);
  assert.match(voice,/output_audio_buffer\.started'[\s\S]*this\.startOutputMeter\(\)/);
  assert.match(voice,/output_audio_buffer\.stopped'[\s\S]*this\.stopOutputMeter\(\)/);
  assert.doesNotMatch(css,/var\(--screen-gradient\)\s+fixed/);
  assert.doesNotMatch(css,/blur\(22px\)/);
  assert.doesNotMatch(css,/\.is-busy:not\(\.talk\)[^{]*\{[^}]*filter/);
  assert.doesNotMatch(css.match(/\.page\.active\s*\{[^}]*\}/)?.[0]||'',/animation:/);
  assert.doesNotMatch(css.match(/\.motion-ripple\s*\{[^}]*\}/)?.[0]||'',/animation:/);
  assert.match(app,/touchcancel/);
});

test('navigation pairing and generated controls expose accessible state',()=>{
  const app=read('assets/web/app.js');
  const html=read('assets/web/index.html');
  const css=read('assets/web/style.css');
  assert.match(html,/role="tablist"/);
  assert.match(html,/role="tabpanel"/);
  assert.match(html,/role="dialog" aria-modal="true"/);
  assert.match(html,/aria-label="Dígito 6"/);
  assert.match(html,/id="status-refresh"/);
  assert.match(app,/aria-selected/);
  assert.match(app,/aria-labelledby/);
  assert.match(app,/aria-pressed/);
  assert.match(app,/onpaste/);
  assert.match(app,/dismissPairScreen\(false\)/);
  assert.match(app,/lockPairBackground\(false\)/);
  assert.match(app,/\$\('#status-refresh'\)\.onclick=safe\(refreshStatus\)/);
  assert.match(css,/#color-picker button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
});

test('pairing reports every visible secure-connection stage',()=>{
  const app=read('assets/web/app.js');
  const ble=read('java/dev/atlas/a1/BlePairingManager.java');
  for(const state of ['scanning','detected','connecting','authorizing','verifying','receiving','paired']){
    assert.match(app,new RegExp(`\\b${state}\\b`));
    assert.match(ble,new RegExp(`"${state}"`));
  }
  assert.match(ble,/postDelayed\(timeout,20000\)/);
  assert.match(ble,/void stop\(\)\{generation\+\+/);
});

test('native shell provides semantic haptics and a reduced-motion-safe reveal',()=>{
  const main=read('java/dev/atlas/a1/MainActivity.java');
  assert.match(main,/ValueAnimator\.areAnimatorsEnabled\(\)/);
  assert.match(main,/new PathInterpolator\(\.22f,1f,\.36f,1f\)/);
  for(const kind of ['selection','press','confirm','reject'])assert.match(main,new RegExp(`"${kind}"`));
});

test('allow-all pauses for settings-backed permissions and resumes on return',()=>{
  const app=read('assets/web/app.js');
  assert.match(app,/result\.opened&&!result\.ok/);
  assert.match(app,/allowAllResumeIndex=i\+1/);
  assert.match(app,/kind==='permissionsChanged'/);
  assert.match(app,/allowAllFrom\(next\)/);
});
