'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('embedded message renderers never initialise simulation workspace controls',()=>{
  let touched=false;
  const context=vm.createContext({location:{search:'?embed=main&themeInstance=second'},URLSearchParams,document:{querySelector(){touched=true;throw new Error('embedded DOM must be untouched');}}});
  assert.doesNotThrow(()=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/simulation-controls.js'),'utf8'),context));
  assert.equal(touched,false);
});
