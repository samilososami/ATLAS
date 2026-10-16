const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/static/app.js`, 'utf8');
const block = source.slice(source.indexOf('async function playBrowserSpeech('), source.indexOf('function resetStreamedSpeechState('));
function setup({speaking=false,pending=false,segments,segment}={}) {
  const calls=[],voice={name:'Same Spanish voice'};
  const synth={speaking,pending,cancel(){calls.push('cancel');this.speaking=false;this.pending=false;}};
  const ctx=vm.createContext({window:{speechSynthesis:synth,SpeechSynthesisUtterance:function(){}},browserSpeechRun:0,
    browserVoice:()=>voice, browserSpeechSegments:text=>segments||[{text,protected:false}],
    PHYSICAL_ATLAS_A1:true, muteRecognitionFor:()=>{throw Error('Unexpected gate change');},
    speakBrowserSegment:segment|| (async(text,v,start)=>{calls.push([text,v]);start?.({voice:v.name});})});
  vm.runInContext(block,ctx);return {ctx,calls,voice,synth,play:ctx.playBrowserSpeech};
}
test('R2 playback cancellation boundary is preserved between serialized chunks',async()=>{
  const f=setup();let starts=0;
  await f.play('Primera frase.',()=>starts++);await f.play('Segunda frase.',()=>starts++);
  assert.deepEqual(f.calls,['cancel',['Primera frase.',f.voice],'cancel',['Segunda frase.',f.voice]]);assert.equal(starts,2);
});
for(const state of [{speaking:true},{pending:true},{speaking:true,pending:true}])
test(`existing synthesis is replaced: ${JSON.stringify(state)}`,async()=>{
  const f=setup(state);await f.play('Nueva frase');assert.equal(f.calls[0],'cancel');assert.equal(f.calls.length,2);
});
test('a newer run prevents stale segmented speech from continuing',async()=>{
  let resolve;const calls=[];
  const f=setup({segments:[{text:'one'},{text:'two'}],segment:async text=>{calls.push(text);if(calls.length===1)await new Promise(r=>resolve=r);}});
  const first=f.play('old');f.synth.speaking=true;await f.play('new');resolve();await first;
  assert.deepEqual(calls,['one','one','two']);assert.deepEqual(f.calls,['cancel','cancel']);
});
test('unavailable browser synthesis still fails explicitly',async()=>{
  const f=setup();f.ctx.window.speechSynthesis=null;await assert.rejects(f.play('text'),/no ofrece/);
});
test('explicit playback stop still cancels synthesis unconditionally',()=>{
  const start=source.indexOf('function stopCurrentPlayback(');
  assert.ok(start>=0);assert.match(source.slice(start,source.indexOf('function stopRealtimeExternalSpeech(',start)),/speechSynthesis\?\.cancel\(\)/);
});
