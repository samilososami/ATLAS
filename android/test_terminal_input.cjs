const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync(__dirname+'/app/src/main/assets/web/terminal-input.js','utf8'),context);
const Input=context.AtlasTerminalInput;
test('serializes native writes across separate keyboard bursts',async()=>{
 const out=[];let active=0,max=0;
 const q=new Input(async s=>{max=Math.max(max,++active);await new Promise(r=>setTimeout(r,s==='first'?20:1));out.push(s);active--;},e=>{throw e});
 q.push('first');q.flush();q.push('second');await q.flush();
 assert.deepEqual(out,['first','second']);assert.equal(max,1);
});
test('batches characters and preserves long Unicode paste exactly',async()=>{
 const out=[];const q=new Input(async s=>out.push(s),e=>{throw e});
 q.push('p');q.push('w');q.push('d\r');await q.flush();assert.deepEqual(out,['pwd\r']);
 const text='ñ🤖'.repeat(3000);q.push(text);await q.flush();
 assert.equal(out.slice(1).join(''),text);assert.ok(out.slice(1).every(s=>Buffer.byteLength(s)<=4096));
});
test('closing a terminal drops queued input rather than sending to the next shell',async()=>{
 const out=[];const q=new Input(async s=>out.push(s),e=>{throw e});
 q.push('old');q.flush();q.cancel();q.push('new');await q.flush();assert.deepEqual(out,['new']);
});
