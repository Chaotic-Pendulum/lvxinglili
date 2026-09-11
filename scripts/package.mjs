import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream, openSync, writeSync, closeSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Zip, ZipPassThrough, ZipDeflate } from '../dist/vendor/fflate.js';
// ZIP entries and pack asset URLs always use '/', including on Windows.
const archivePath = file => file.replace(/\\/g, '/');
async function walk(dir) {
  const files=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=archivePath(path.join(dir,entry.name));
    if(entry.isDirectory())files.push(...await walk(file));else files.push(file);
  }
  return files;
}
async function writeArchive(output,files,compressText=false) {
  const fd=openSync(output,'w');let failure=null,finished=false;
  const archive=new Zip((error,bytes,final)=>{
    if(error){failure=error;return;}
    let offset=0;while(offset<bytes.length)offset+=writeSync(fd,bytes,offset,bytes.length-offset);
    if(final)finished=true;
  });
  try {
    for(const [relative,file] of files){
      const name=archivePath(relative);
      const entry=compressText&&/\.(json|m?js|md|css|html|svg|txt)$/i.test(name)?new ZipDeflate(name,{level:6}):new ZipPassThrough(name);
      archive.add(entry);
      for await(const chunk of createReadStream(file)){entry.push(chunk,false);if(failure)throw failure;}
      entry.push(new Uint8Array(),true);if(failure)throw failure;
    }
    archive.end();if(failure)throw failure;if(!finished)throw new Error('Archive was not finalized');
  }catch(error){archive.terminate();throw error;}finally{closeSync(fd);}
}
await mkdir('releases',{recursive:true});
const root='dist/packs/reading-room',pack=JSON.parse(await readFile(path.join(root,'pack.json'),'utf8'));
const styles=JSON.parse(await readFile('dist/photo-styles/manifest.json','utf8'));
const uiSkin=JSON.parse(await readFile('dist/ui/painted/manifest.json','utf8'));
const appManifest=JSON.parse(await readFile('dist/manifest.webmanifest','utf8'));
const imageFile=/\.(png|jpe?g|webp|gif|avif)$/i;
const activeImages=new Set([
  ...Object.values(pack.assets).map(asset=>path.join(root,asset.src)),
  ...styles.styles.map(style=>path.join('dist/photo-styles',style.file)),
  ...Object.values(uiSkin.assets).map(asset=>path.join('dist/ui/painted',asset.file)),
  ...appManifest.icons.map(icon=>path.join('dist',icon.src)),
  'dist/app-icon.png',
  'dist/maps/world-standard-GS2020-4403.jpg',
  'dist/maps/china-standard-GS2023-2764.jpg',
].map(archivePath));
const distFiles=await walk('dist');
const playable=distFiles.filter(file=>!imageFile.test(file)||activeImages.has(file));
await writeArchive('releases/roam-atelier-game-q90.zip',[
  ...playable.filter(file=>file!=='dist/LICENSE').map(file=>[path.relative('dist',file),file]),
  ['LICENSE','LICENSE'],
],true);
// The source archive also keeps the small historical PNG set exercised by compatibility checks.
const history=JSON.parse(await readFile(path.join(root,'ASSET-METADATA.json'),'utf8'));
const sourceImages=new Set([...activeImages,
  ...Object.values(history.assets).map(asset=>path.join(root,asset.file)),
  ...['base-actions','winter-actions','rain-actions','empty-chair'].map(id=>path.join(root,'assets',id+'.png')),
].map(archivePath));
const source=[];
for(const file of distFiles)if(!imageFile.test(file)||sourceImages.has(file))source.push([file,file]);
for(const dir of ['server','scripts','tests','docs'])for(const file of await walk(dir))source.push([file,file]);
for(const file of ['package.json','README.md','LICENSE','.env.example','.gitignore'])source.push([file,file]);
for(const file of ['CONTRIBUTING.md','CHANGELOG.md','.gitattributes','.openai/hosting.json'])if(existsSync(file))source.push([file,file]);
if(existsSync('.github'))for(const file of await walk('.github'))source.push([file,file]);
await writeArchive('releases/roam-atelier-source.zip',source,true);
const declared=new Set(Object.values(pack.assets).map(asset=>asset.src)),files=[];
for(const file of await walk(root)){
  const relative=archivePath(path.relative(root,file));
  if(declared.has(relative)||(!relative.includes('/')&&/\.(json|md|txt)$/i.test(relative)))files.push([relative,file]);
}
await writeArchive('releases/reading-room.roampack.zip',files);
const releaseManifest=[];
for(const file of ['roam-atelier-game-q90.zip','reading-room.roampack.zip','roam-atelier-source.zip']){
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(path.join('releases',file))){hash.update(chunk);bytes+=chunk.length;}
  releaseManifest.push({file,bytes,MB:Number((bytes/1000000).toFixed(2)),sha256:hash.digest('hex'),quality:pack.imageEncoding?.quality,uiSkin:uiSkin.id,privateEnvExcluded:true});
}
await writeFile('releases/Q90-RELEASE-MANIFEST.json',JSON.stringify(releaseManifest,null,2)+'\n');
console.log('Created playable game, source and resource archives. Original production art and private .env are excluded.');
