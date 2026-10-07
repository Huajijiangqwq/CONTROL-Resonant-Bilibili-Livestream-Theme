/* Copy-on-read migration keeps old application versions from erasing new fields. */
(function(root){
  'use strict';
  function keys(qa=false){const suffix=qa?'-qa':'';return {key:'hiss-theme-editor-v200'+suffix,previousKey:'hiss-theme-editor-v92'+suffix,legacyKey:'hiss-theme-editor-v76'+suffix};}
  function documentValue(value){return value?.format==='control-theme'&&Array.isArray(value.layers)?value:null;}
  async function load(store,local,qa=false){
    const names=keys(qa);
    const read=async(method,key)=>{try{return await store[method](key);}catch{return null;}};
    const current=await read('draft',names.key);
    if(documentValue(current?.document))return {...names,initial:current,document:current.document,migrated:false};
    for(const key of [names.key,names.previousKey,names.legacyKey]){
      const draft=key===names.key?null:await read('draft',key);
      let value=documentValue(draft?.document)||documentValue(await read('get',key));
      if(!value){try{value=documentValue(JSON.parse(local?.getItem(key)||'null'));}catch{}}
      if(value)return {...names,initial:null,document:value,migrated:key!==names.key};
    }
    return {...names,initial:null,document:null,migrated:false};
  }
  const api={keys,load};if(typeof module==='object'&&module.exports)module.exports=api;else root.ThemeDraftLoader=api;
})(typeof window==='object'?window:globalThis);
