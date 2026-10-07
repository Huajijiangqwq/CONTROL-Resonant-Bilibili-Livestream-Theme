'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Loader=require('../app/theme-draft-loader');
test('new schema copies the most recent old draft without modifying rollback data',async()=>{
  const old={format:'control-theme',layers:[{id:'image',effects:[{type:'blur',radius:4}]}]},calls=[];
  const store={async draft(key){calls.push(key);return key==='hiss-theme-editor-v92'?{format:'control-editor-draft',document:old,revision:17}:null;},async get(){return null;},put(){throw Error('migration must not write old keys');}};
  const result=await Loader.load(store,null);
  assert.equal(result.key,'hiss-theme-editor-v200');assert.equal(result.migrated,true);assert.equal(result.initial,null);assert.equal(result.document,old);assert.equal(old.layers[0].effects[0].radius,4);
});
test('a new-schema draft always wins; QA and release stores stay separate',async()=>{
  const doc={format:'control-theme',layers:[]};
  const store={async draft(key){assert.equal(key,'hiss-theme-editor-v200-qa');return {format:'control-editor-draft',document:doc,revision:2};},get(){throw Error('old data must not replace new');}};
  const result=await Loader.load(store,null,true);assert.equal(result.initial.revision,2);assert.equal(result.migrated,false);
});
test('invalid IndexedDB records fall back to valid old local drafts without discarding them',async()=>{
  const local={getItem(key){return key==='hiss-theme-editor-v76'?JSON.stringify({format:'control-theme',layers:[{id:'old'}]}):'{bad';}};
  const store={async draft(){return {document:{format:'bad'}};},async get(){return null;}};
  const result=await Loader.load(store,local);assert.equal(result.document.layers[0].id,'old');assert.equal(result.migrated,true);
});
