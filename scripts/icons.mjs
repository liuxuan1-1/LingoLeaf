import fs from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
await fs.mkdir('assets',{recursive:true});
const crc=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
const chunk=(name,data)=>{const type=Buffer.from(name),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,sum]);};
const size=256, raw=Buffer.alloc((size*4+1)*size);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let channels=[0,0,0,0];
  for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
    const px=(x+(sx+.5)/4)/size,py=(y+(sy+.5)/4)/size;
    const dx=Math.max(.15-px,0,px-.85),dy=Math.max(.15-py,0,py-.85);
    let color=dx*dx+dy*dy<.15*.15?[35,75,64,255]:[0,0,0,0];
    const u=((px-.52)-(py-.48))/.7071/2,v=((px-.52)+(py-.48))/.7071/2;
    if((u*u/(.29*.29)+v*v/(.14*.14)<1)&&py<.77)color=[237,243,218,255];
    if(px>.27&&px<.68&&Math.abs(py-(1.02-px))<.009)color=[101,143,109,255];
    channels=channels.map((c,i)=>c+color[i]/16);
  }
  const offset=y*(size*4+1)+1+x*4;channels.forEach((c,i)=>raw[offset+i]=Math.round(c));
}
const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
await fs.writeFile('assets/icon.png',png);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
await fs.writeFile('assets/icon.ico',Buffer.concat([ico,png]));
