import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveBlob,unpackBlob} from '../dist/app/core/archive.js';
import {zipSync,strToU8} from '../dist/vendor/fflate.js';

test('chunked ZIP roundtrip preserves Unicode paths, binary images and empty files',async()=>{
 const data=new Uint8Array(2300000);for(let i=0;i<data.length;i++)data[i]=i%251;
 async function* records(){yield ['pack.json',new Blob(['{"version":2}'])];yield ['assets/图像.webp',new Blob([data])];yield ['empty.txt',new Blob([])];}
 const zip=await archiveBlob(records()),files=await unpackBlob(zip);
 assert.equal(await files['pack.json'].text(),'{"version":2}');assert.equal(files['empty.txt'].size,0);assert.deepEqual(new Uint8Array(await files['assets/图像.webp'].arrayBuffer()),data);
});
test('chunked importer accepts compressed previous packs and rejects traversal before extraction',async()=>{
 const zip=new Blob([zipSync({'pack.json':strToU8('hello '.repeat(10000))},{level:6})]);
 assert.equal(await (await unpackBlob(zip))['pack.json'].text(),'hello '.repeat(10000));
 await assert.rejects(()=>unpackBlob(new Blob([zipSync({'../escape':strToU8('x')})])),/路径/);
});
test('chunked importer rejects altered payload CRC and truncated directories',async()=>{
 const zip=await archiveBlob([['file.txt',new Blob(['original'])]]),bytes=new Uint8Array(await zip.arrayBuffer());
 bytes[30+'file.txt'.length]^=1;
 await assert.rejects(()=>unpackBlob(new Blob([bytes])),/校验/);
 await assert.rejects(()=>unpackBlob(zip.slice(0,-5)),/目录/);
});
test('stored binary payloads may contain ZIP headers and data descriptors',async()=>{
 const data=new Uint8Array(2400000);data.fill(93);
 const signatures=[[0x50,0x4b,7,8],[0x50,0x4b,3,4],[0x50,0x4b,1,2]];
 for(let i=0;i<signatures.length;i++)data.set(signatures[i],100+i*1048500);
 const zip=await archiveBlob([['assets/binary.webp',new Blob([data])],['after.txt',new Blob(['complete'])]]);
 const files=await unpackBlob(zip);
 assert.deepEqual(new Uint8Array(await files['assets/binary.webp'].arrayBuffer()),data);
 assert.equal(await files['after.txt'].text(),'complete');
});
test('indexed importer rejects conflicting local names and overlapping indexed entries',async()=>{
 const zip=await archiveBlob([['first.txt',new Blob(['first'])],['second.txt',new Blob(['second'])]]);
 const changedName=new Uint8Array(await zip.arrayBuffer());changedName[30]^=1;
 await assert.rejects(()=>unpackBlob(new Blob([changedName])),/路径/);
 const overlap=new Uint8Array(await zip.arrayBuffer()),view=new DataView(overlap.buffer);
 let found=0;
 for(let i=0;i<overlap.length-46;i++)if(view.getUint32(i,true)===0x02014b50&&++found===2){view.setUint32(i+42,0,true);break;}
 await assert.rejects(()=>unpackBlob(new Blob([overlap])),/重叠|损坏/);
});
