'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {observe}=require('../desktop/window-diagnostics');
function fixture(){const contents=new EventEmitter(),logs=[],failures=[];let closing=false,reloads=0;contents.isDestroyed=()=>false;contents.reload=()=>reloads++;const control=observe(contents,{log:s=>logs.push(s),onFailure:s=>failures.push(s),isClosing:()=>closing});return{contents,logs,failures,control,reloads:()=>reloads,close:()=>{closing=true;}};}
test('Electron 44 console details and preload failures reach diagnostics',()=>{
 const h=fixture();h.contents.emit('console-message',{level:'error',message:'missing API'},3,'legacy ignored');
 h.contents.emit('console-message',{},2,'legacy warning');
 h.contents.emit('console-message',{level:'info',message:'not an error'});
 h.contents.emit('preload-error',{},'/private/profile/preload.js',new Error('preload module failed'));
 assert.deepEqual(h.logs,['Renderer error: missing API','Renderer warning: legacy warning','Shell preload failed: preload module failed']);assert.equal(h.failures.length,1);
});
test('main document failure is actionable, iframe and cancelled navigation are not shell failures',()=>{
 const h=fixture();h.contents.emit('did-fail-load',{},-2,'ERR_FAILED','file:///private/main.html',false);h.contents.emit('did-fail-load',{},-3,'ERR_ABORTED','file:///private/main.html',true);assert.equal(h.failures.length,0);
 h.contents.emit('did-fail-load',{},-2,'ERR_FAILED','file:///private/main.html',true);assert.match(h.failures[0],/-2/);assert(!h.logs.join('').includes('/private/'));
});
test('repeated renderer crashes stop automatic reload and user retry can reset the allowance',()=>{
 const h=fixture(),crash=()=>h.contents.emit('render-process-gone',{}, {reason:'crashed',exitCode:9});
 crash();assert.equal(h.reloads(),1);assert.equal(h.failures.length,0);crash();assert.equal(h.reloads(),1);assert.equal(h.failures.length,1);
 h.control.reset();crash();assert.equal(h.reloads(),2);h.close();crash();assert.equal(h.reloads(),2);assert.equal(h.failures.length,1);
});
