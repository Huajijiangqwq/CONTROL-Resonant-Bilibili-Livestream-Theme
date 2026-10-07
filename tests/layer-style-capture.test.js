'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('decoration capture composites each alpha-styled layer once and reuses its source surface',()=>{
  const log=[],made=[];
  function ctx(label){let depth=0;return{save(){depth++;log.push(label+' save');},restore(){depth--;assert(depth>=0);log.push(label+' restore');},translate(){},rotate(){},clearRect(){log.push(label+' clear');},drawImage(){log.push(label+' draw '+this.filter);},get depth(){return depth;}};}
  const doc={createElement(type){assert.equal(type,'canvas');const c=ctx('source'),surface={width:0,height:0,getContext(){return c;},ownerDocument:doc};c.canvas=surface;made.push(surface);return surface;}};
  const output=ctx('output');output.canvas={ownerDocument:doc};
  const layer={id:'shape',type:'shape',visible:true,scope:'chat',x:0,y:0,w:120,h:80,rotation:0,opacity:1,blend:'normal',effects:[{type:'stroke'}]};
  const source=fs.readFileSync(require.resolve('../app/theme-editor-runtime.js'),'utf8');
  const start=source.indexOf('  const decorationSurfaces ='),end=source.indexOf('  function chatSignalMask',start);
  const sandbox={project:{},M:{effective(_p,l){return l;}},nodes:new Map([['shape',{}]]),ThemeLayerEffects:{filter(_l,target){assert.equal(target,doc);return 'alpha-filter';},drawCanvas(c,s,l){assert.equal(s,made[0]);assert.equal(l,layer);log.push('output local-filter');}},ThemeDecorationPaint:{draw(c){log.push('paint '+(c===output?'output':'source'));}},output};
  vm.createContext(sandbox);vm.runInContext(source.slice(start,end)+'\nthis.paint=paintChatDecorations;',sandbox);
  const view={composition:'feed',layers:[{type:'chat',x:0,y:0},layer]};
  sandbox.paint(output,view);sandbox.paint(output,view);
  assert.equal(made.length,1);assert.equal(made[0].width,120);assert.equal(made[0].height,80);assert.equal(output.depth,0);assert.equal(made[0].getContext().depth,0);
  assert.equal(log.filter(x=>x==='paint source').length,2);assert.equal(log.filter(x=>x==='output local-filter').length,2);
  layer.effects=[];sandbox.paint(output,view);assert.equal(made.length,1);assert(log.includes('paint output'));assert.equal(output.depth,0);
});
