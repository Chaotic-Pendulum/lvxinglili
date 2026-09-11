#!/usr/bin/env python3
from pathlib import Path
from asset_paths import PACK_ROOT, PROCESSED_DIR, production_dir
from PIL import Image
import json, hashlib
import numpy as np
stage=PROCESSED_DIR;packroot=PACK_ROOT;manifest=packroot/'pack.json';pack=json.loads(manifest.read_text());source_root=production_dir()
fb=[{'id':'reading-chair','name':'暖木阅读椅','actions':[{'id':'read','name':'轻轻翻书'},{'id':'tea','name':'喝一口热茶'}]}]+json.loads((source_root/'furniture/brief.json').read_text());ob=json.loads((source_root/'outfits/brief.json').read_text())
# Root-reviewed set. Expand this list only after reviewing the new contact sheets.
approved=stage/'approved.json'
review=json.loads(approved.read_text()) if approved.exists() else {'outfits':[o['id'] for o in ob],'furniture':[f['id'] for f in fb],'clips':[f['id']+'/base-'+a['id'] for f in fb for a in f['actions']]}
if not approved.exists():approved.write_text(json.dumps(review,ensure_ascii=False,indent=2))
assetsmeta={};metapath=packroot/'EXPANSION-ASSETS.json'
if metapath.exists():assetsmeta=json.loads(metapath.read_text()).get('assets',{})
def add_asset(key,source):
    im=Image.open(source).convert('RGBA');assert im.getchannel('A').getextrema()==(0,255)
    target=packroot/'assets'/(key+'.webp');digest=hashlib.sha256(source.read_bytes()).hexdigest()
    if not target.exists() or assetsmeta.get(key,{}).get('sourceSha256')!=digest:
        im.save(target,lossless=True,method=6,exact=False)
        decoded=np.asarray(Image.open(target).convert('RGBA'));original=np.asarray(im);visible=original[:,:,3]>0
        assert np.array_equal(decoded[visible],original[visible]),key
        assert np.array_equal(decoded[:,:,3],original[:,:,3]),key
    pack['assets'][key]={'src':'assets/'+target.name,'width':im.width,'height':im.height}
    assetsmeta[key]={'file':'assets/'+target.name,'sourceSha256':digest,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'visiblePixelsLossless':True,'width':im.width,'height':im.height}
    return {'asset':key}
def baseline(source):
    a=np.asarray(Image.open(source).getchannel('A'));ys=np.flatnonzero((a>127).sum(1)>4);return int(ys[-1])+1
for o in ob:
    source=stage/'outfits'/(o['id']+'-outfit.png')
    if o['id'] not in review['outfits'] or not source.exists():continue
    preview=add_asset(o['id']+'-outfit-local',source)
    found=next((x for x in pack['outfits'] if x['id']==o['id']),None)
    if found:found['preview']=preview
    else:pack['outfits'].append({**o,'preview':preview,'price':{'gardener':380,'sailor':360,'explorer':460,'pajamas':320,'baker':360,'postman':420,'festival':480}[o['id']]})
for f in fb:
    empty=(packroot/'assets/chair-empty.png') if f['id']=='reading-chair' else stage/'furniture'/(f['id']+'.png')
    if f['id'] not in review['furniture'] or not empty.exists():continue
    ground=baseline(empty);item=next((x for x in pack['furniture'] if x['id']==f['id']),None)
    if not item:
        item={'id':f['id'],'name':f['name'],'empty':add_asset(f['id']+'-empty-local',empty),'canvas':{'width':1254,'height':1254},'pivot':[.5,ground/1254],'defaultWidth':.32,'actions':{},'price':{'writing-desk':420,'tea-table':360,'cozy-bed':560,'soft-sofa':620,'easel':440,'plant-bench':460,'craft-seat':320,'telescope-station':580,'mini-piano':680}[f['id']]}
    for action in f['actions']:
        for o in pack['outfits']:
            clipid=f['id']+'/'+o['id']+'-'+action['id']
            if clipid not in review['clips']:continue
            sources=[stage/'interactions'/f['id']/(o['id']+'-'+action['id']+'-'+q+'.png') for q in ['a','b']]
            if not all(p.exists() for p in sources):continue
            frames=[]
            for index,source in enumerate(sources):
                key=f['id']+'-'+o['id']+'-'+action['id']+'-'+('a' if index==0 else 'b')+'-local';frame=add_asset(key,source);frame['duration']=4000 if index==0 else 1400
                delta=(ground-baseline(source))/1254
                if abs(delta)>2/1254:frame['registration']={'x':0,'y':round(delta,7),'width':1,'height':1}
                frames.append(frame)
            item['actions'].setdefault(action['id'],{'name':action['name'],'variants':{}})['variants'][o['id']]={'frames':frames}
    if item['actions'] and all(a['variants'].get(pack['baseOutfitId']) for a in item['actions'].values()) and not any(x['id']==item['id'] for x in pack['furniture']):pack['furniture'].append(item)
pack['revision']='expanded-20260910-'+str(len(pack['assets']))
temporary=manifest.with_suffix('.json.tmp');temporary.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n');temporary.replace(manifest);metapath.write_text(json.dumps({'method':'Local alpha matting, original visible pixels preserved, lossless WebP runtime encoding. Ground offsets use the existing uniform-canvas registration field.','assets':assetsmeta},ensure_ascii=False,indent=2))
print(json.dumps({'outfits':len(pack['outfits']),'furniture':len(pack['furniture']),'items':len(pack['items']),'frames':sum(len(v['frames']) for f in pack['furniture'] for a in f['actions'].values() for v in a['variants'].values()),'assetMB':round(sum((packroot/a['src']).stat().st_size for a in pack['assets'].values())/1048576,1)}))
