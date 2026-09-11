import { Zip, ZipPassThrough, Inflate } from '../../vendor/fflate.js';
import { LIMITS, safePath } from './pack.js';
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crcUpdate=(crc,bytes)=>{for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return crc;};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function directory(file) {
  if(file.size>LIMITS.totalBytes)throw new Error('文件超过512MB，请拆分资源包');
  const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer());
  const view=new DataView(tail.buffer);let end=-1;
  for(let i=tail.length-22;i>=0;i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===tail.length){end=i;break;}
  if(end<0)throw new Error('无法识别ZIP目录');
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true))throw new Error('不支持分卷ZIP');
  const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
  if(count>LIMITS.entries||size>8*1024*1024||offset+size>file.size-tail.length+end)throw new Error('ZIP目录超出限制或损坏');
  const bytes=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),central=new DataView(bytes.buffer),entries=new Map();let pos=0,total=0;
  for(let index=0;index<count;index++){
    if(pos+46>bytes.length||central.getUint32(pos,true)!==0x02014b50)throw new Error('ZIP索引不完整');
    const flags=central.getUint16(pos+8,true),method=central.getUint16(pos+10,true),crc=central.getUint32(pos+16,true),compressed=central.getUint32(pos+20,true),length=central.getUint32(pos+24,true),nameLength=central.getUint16(pos+28,true),extra=central.getUint16(pos+30,true),comment=central.getUint16(pos+32,true),localOffset=central.getUint32(pos+42,true);
    if(pos+46+nameLength+extra+comment>bytes.length)throw new Error('ZIP索引不完整');
    const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(pos+46,pos+46+nameLength));
    if(!safePath(name.replace(/\/$/,''))||entries.has(name))throw new Error('ZIP包含非法或重复路径');
    if(flags&1||![0,8].includes(method))throw new Error('不支持加密或此压缩格式');
    total+=length;
    if(length>LIMITS.fileBytes||total>LIMITS.totalBytes)throw new Error('ZIP解压内容超过限制');
    if(localOffset+30+compressed>offset)throw new Error('ZIP文件偏移损坏');
    entries.set(name,{length,crc,method,compressed,localOffset,flags});pos+=46+nameLength+extra+comment;
  }
  if(pos!==bytes.length)throw new Error('ZIP目录长度不一致');
  return {entries,offset};
}
export async function unpackBlob(file) {
  const central=await directory(file),entries=Object.create(null);let total=0,count=0;
  const ordered=[...central.entries].sort((a,b)=>a[1].localOffset-b[1].localOffset);
  // Stored images can contain ZIP signatures. Read the indexed byte range instead of scanning payloads.
  for(let index=0;index<ordered.length;index++){
    const [name,expected]=ordered[index],boundary=ordered[index+1]?.[1].localOffset??central.offset;
    const headerBytes=await file.slice(expected.localOffset,expected.localOffset+30).arrayBuffer();
    if(headerBytes.byteLength!==30)throw new Error('ZIP本地文件头不完整');
    const header=new DataView(headerBytes),flags=header.getUint16(6,true),method=header.getUint16(8,true);
    if(header.getUint32(0,true)!==0x04034b50||flags!==expected.flags||method!==expected.method)throw new Error('ZIP本地文件头与目录不一致');
    const nameLength=header.getUint16(26,true),extraLength=header.getUint16(28,true),start=expected.localOffset+30+nameLength+extraLength,end=start+expected.compressed;
    if(start>boundary||end>boundary)throw new Error('ZIP文件范围重叠或损坏');
    const localName=new TextDecoder('utf-8',{fatal:true}).decode(await file.slice(expected.localOffset+30,expected.localOffset+30+nameLength).arrayBuffer());
    if(localName!==name)throw new Error('ZIP本地路径与目录不一致');
    if(!(flags&8)&&(header.getUint32(14,true)!==expected.crc||header.getUint32(18,true)!==expected.compressed||header.getUint32(22,true)!==expected.length))throw new Error('ZIP本地文件大小与目录不一致');
    if(method===0&&expected.compressed!==expected.length)throw new Error('ZIP未压缩文件大小不一致');
    let received=0,crc=0xffffffff;const chunks=[];
    const consume=data=>{
      received+=data.length;total+=data.length;
      if(received>expected.length||total>LIMITS.totalBytes)throw new Error('ZIP实际解压内容超出声明');
      crc=crcUpdate(crc,data);if(data.length)chunks.push(new Blob([data]));
    };
    const inflater=method===8?new Inflate(consume):null,chunkSize=inflater?16*1024:1024*1024;
    for(let offset=start;offset<end;offset+=chunkSize){
      const next=Math.min(offset+chunkSize,end),bytes=new Uint8Array(await file.slice(offset,next).arrayBuffer());
      if(inflater)inflater.push(bytes,next===end);else consume(bytes);
    }
    if(inflater&&start===end)inflater.push(new Uint8Array(),true);
    if(received!==expected.length||((crc^0xffffffff)>>>0)!==expected.crc)throw new Error('ZIP文件校验失败');
    if(!name.endsWith('/'))entries[name]=new Blob(chunks);
    if(++count%8===0)await tick();
  }
  return entries;
}
export async function archiveBlob(records) {
  const chunks=[];let error=null,finished=false,total=0,count=0;
  const archive=new Zip((failure,data,final)=>{if(failure)error=failure;else if(data.length)chunks.push(new Blob([data]));if(final)finished=true;});
  try{
    for await(const [name,blob] of records){
      if(!safePath(name)||blob.size>LIMITS.fileBytes||(total+=blob.size)>LIMITS.totalBytes||++count>LIMITS.entries)throw new Error('导出内容超过素材包限制，请先减少素材或照片');
      const entry=new ZipPassThrough(name);archive.add(entry);
      for(let offset=0;offset<blob.size;offset+=1024*1024){const end=Math.min(offset+1024*1024,blob.size);entry.push(new Uint8Array(await blob.slice(offset,end).arrayBuffer()),end===blob.size);}
      if(!blob.size)entry.push(new Uint8Array(),true);
      if(error)throw error;if(count%8===0)await tick();
    }
    archive.end();if(error)throw error;if(!finished)throw new Error('ZIP未完成');const blob=new Blob(chunks,{type:'application/zip'});if(blob.size>LIMITS.totalBytes)throw new Error('ZIP文件超过512MB，请拆分资源包');return blob;
  }catch(error){archive.terminate();throw error;}
}
