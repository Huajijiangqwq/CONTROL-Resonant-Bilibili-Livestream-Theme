'use strict';
// Original geometric mark, generated without third-party raster assets. CC BY 4.0.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function chunk(name,body){const tag=Buffer.from(name),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(body.length);tail.writeUInt32BE(crc(Buffer.concat([tag,body])));return Buffer.concat([head,tag,body,tail]);}
function buildIcon(){
  const width=128,rows=Buffer.alloc((width*4+1)*width);
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const offset=y*(width*4+1)+1+x*4;
    let color=[25,28,30,255];
    const inside=y>=29&&y<=103&&Math.abs(x-64)<=(103-y)*.58;
    const hole=y>=38&&y<=88&&Math.abs(x-64)<=(88-y)*.53;
    if(inside&&!hole)color=[229,226,216,255];
    if(y>=17&&y<22&&x>24&&x<104)color=[207,90,67,255];
    if(Math.hypot(x-64,y-48)<5)color=[207,90,67,255];
    color.forEach((v,i)=>rows[offset+i]=v);
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(width,4);ihdr[8]=8;ihdr[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
  fs.writeFileSync(path.join(__dirname,'../desktop/icon.png'),png);
}
if(require.main===module)buildIcon();module.exports={buildIcon};
