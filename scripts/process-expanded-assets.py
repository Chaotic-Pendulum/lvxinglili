#!/usr/bin/env python3
from pathlib import Path
from asset_paths import PROCESSED_DIR, production_dir
import importlib.util,json,hashlib,time
spec=importlib.util.spec_from_file_location('cutout',Path(__file__).with_name('cutout-assets.py'));cutout=importlib.util.module_from_spec(spec);spec.loader.exec_module(cutout)
root=production_dir();out=PROCESSED_DIR
jobs=[]
for kind,brief in [('outfits','outfits/brief.json'),('furniture','furniture/brief.json')]:
 for item in json.loads((root/brief).read_text()):
  suffix='-outfit' if kind=='outfits' else ''
  source=root/kind/(item['id']+suffix+'-rgb-draft.png')
  if source.exists():jobs.append((source,out/kind/(item['id']+suffix+'.png')))
for directory in (root/'interactions').iterdir():
 if directory.is_dir():
  for source in directory.glob('*-rgb-draft.png'):
   parts=source.name.removesuffix('-rgb-draft.png').rsplit('-',2)
   if len(parts)!=3 or parts[2] not in ['a','b']:continue
   jobs.append((source,out/'interactions'/directory.name/source.name.replace('-rgb-draft','')))
results=[];started=time.perf_counter();updated=0
for source,target in jobs:
 meta=target.with_suffix('.cutout.json')
 try:
  digest=hashlib.sha256(source.read_bytes()).hexdigest()
  if target.exists() and meta.exists():
   saved=json.loads(meta.read_text())
   if saved.get('sourceSha256')==digest:results.append(saved);continue
  results.append(cutout.cutout(source,target));updated+=1
 except Exception as error:results.append({'source':str(source),'status':'error','error':str(error)})
out.mkdir(parents=True,exist_ok=True);(out/'manifest.json').write_text(json.dumps({'total':len(results),'updated':updated,'seconds':round(time.perf_counter()-started,2),'assets':results},ensure_ascii=False,indent=2))
print(json.dumps({'total':len(results),'updated':updated,'errors':sum(r.get('status')=='error' for r in results),'seconds':round(time.perf_counter()-started,2)}))
