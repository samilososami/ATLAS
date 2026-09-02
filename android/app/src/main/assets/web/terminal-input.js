'use strict';
// Native HTTP workers run concurrently. PTY input must not: preserve the exact
// keyboard/paste order, batching short bursts to avoid a request per character.
class AtlasTerminalInput {
 constructor(send,onError){this.send=send;this.onError=onError;this.buffer='';this.queue=Promise.resolve();this.generation=0;}
 push(data){this.buffer+=data;if(!this.timer)this.timer=setTimeout(()=>this.flush(),12);}
 flush(){
  clearTimeout(this.timer);this.timer=null;
  const text=this.buffer;this.buffer='';const gen=this.generation;
  this.queue=this.queue.then(async()=>{
   const chars=[...text]; // Never split a Unicode code point; <= 4096 UTF-8 bytes.
   for(let i=0;i<chars.length;i+=1024){
    if(gen!==this.generation)return;
    await this.send(chars.slice(i,i+1024).join(''));
   }
  }).catch(e=>{if(gen===this.generation){this.cancel();this.onError(e);}});
  return this.queue;
 }
 cancel(){this.generation++;this.buffer='';clearTimeout(this.timer);this.timer=null;}
}
globalThis.AtlasTerminalInput=AtlasTerminalInput;
