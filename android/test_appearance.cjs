const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const dir=__dirname+'/app/src/main/assets/web/';
function themeContext(stored){
 const storage=new Map(stored?[['atlas.theme',stored]]:[]);
 const c={document:{documentElement:{dataset:{}}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
 c.window=c;vm.runInNewContext(fs.readFileSync(dir+'appearance.js','utf8'),c);return c;
}
test('first install defaults to light, including invalid old values',()=>{
 for(const value of [undefined,'invalid','light'])assert.equal(themeContext(value).document.documentElement.dataset.theme,'light');
});
test('dark persists on first paint, native choice can override cache',()=>{
 const c=themeContext('dark');assert.equal(c.document.documentElement.dataset.theme,'dark');
 c.applyAtlasTheme('light');assert.equal(c.localStorage.getItem('atlas.theme'),'light');
});
test('blocked storage still yields a functional light theme',()=>{
 const c={document:{documentElement:{dataset:{}}},localStorage:{getItem(){throw Error()},setItem(){throw Error()}}};c.window=c;
 vm.runInNewContext(fs.readFileSync(dir+'appearance.js','utf8'),c);assert.equal(c.document.documentElement.dataset.theme,'light');
});
test('light overrides never replace shared blue accent tokens',()=>{
 const css=fs.readFileSync(dir+'appearance.css','utf8');assert.doesNotMatch(css,/--(?:blue|cyan)\s*:/);
 assert.match(css,/#chat-panel\{display:none\}/);assert.match(css,/\.chat-mode #chat-panel\{display:block\}/);
});
test('dedicated SVG glyphs coexist with the two original full-color logos',()=>{
 const html=fs.readFileSync(dir+'index.html','utf8');
 assert.equal((html.match(/src="logo.png"/g)||[]).length,2);
 assert.equal((html.match(/src="atlas-wordmark.svg"/g)||[]).length,2);
 assert.match(html,/<div id="chat-panel">[\s\S]*id="messages"[\s\S]*id="chat-form"[\s\S]*<\/form><\/div>/);
 const icon=fs.readFileSync(dir+'atlas-filled.svg','utf8');assert.match(icon,/M731 45 L20 1435 L732 1133 L1414 1436 Z M730 522 L1066 1156 L729 937 L390 1161 Z/);
});
function voiceContext(){
 const elements=new Map();const $=s=>{if(!elements.has(s))elements.set(s,{checked:true,classList:{add(){},remove(){},toggle(){}},textContent:''});return elements.get(s);};
 const c={$,$$:()=>[],Audio:class{},safe:fn=>fn,native:async()=>({}),document:{addEventListener(){}},setTimeout,clearTimeout};c.window=c;
 vm.runInNewContext(fs.readFileSync(dir+'realtime.js','utf8'),c);return c;
}
test('text-only chat cannot silently mute Pulsar or wake mode',()=>{
 const c=voiceContext();c.$('#speak').checked=false;
 c.voice.mode='chat';assert.equal(c.voice.outputMode(),'text');
 c.voice.mode='ptt';assert.equal(c.voice.outputMode(),'audio');
 c.voice.mode='wake';assert.equal(c.voice.outputMode(),'audio');
});
test('switching a prepared session from text chat to Pulsar updates output once',async()=>{
 const c=voiceContext();c.$('#speak').checked=false;c.voice.mode='chat';c.voice.ready=true;
 const sent=[];c.voice.send=v=>sent.push(v);await c.voice.setMode('ptt');
 assert.equal(sent.filter(e=>e.type==='session.update').length,1);
 assert.equal(sent.find(e=>e.type==='session.update').session.output_modalities[0],'audio');
 assert.equal(c.$('#speak').checked,false,'keep user chat preference');
 await c.voice.setMode('chat');assert.equal(sent.filter(e=>e.type==='session.update').at(-1).session.output_modalities[0],'text');
});
