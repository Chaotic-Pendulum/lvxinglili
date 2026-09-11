#!/usr/bin/env python3
"""Local background matting for isolated, illustrated assets; never contacts an API."""
from pathlib import Path
import argparse, json, hashlib
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

def cutout(source, output):
    im=Image.open(source).convert('RGB');rgb=np.asarray(im);v=rgb.astype(np.float32)
    edge=np.concatenate([v[:12].reshape(-1,3),v[-12:].reshape(-1,3),v[:,:12].reshape(-1,3),v[:,-12:].reshape(-1,3)])
    mag=(edge[:,0]>190)&(edge[:,2]>190)&(edge[:,1]<85)
    if mag.mean()>.45:
        mode='magenta';key=np.median(edge[mag],axis=0)
        score=np.minimum(v[:,:,0],v[:,:,2])-v[:,:,1]
        candidate=(score>75)&(v[:,:,0]>145)&(v[:,:,2]>145)
        background=candidate
    else:
        mode='neutral-checker';key=np.median(edge,axis=0)
        edge_chroma=edge.max(1)-edge.min(1)
        neutral=edge[edge_chroma<38]
        if not len(neutral):raise ValueError('No supported background found; manual review required')
        rg=float(np.median(neutral[:,0]-neutral[:,1]));gb=float(np.median(neutral[:,1]-neutral[:,2]))
        dist=np.sqrt(((v[:,:,0]-v[:,:,1])-rg)**2+((v[:,:,1]-v[:,:,2])-gb)**2)
        background_floor=max(45,float(np.percentile(neutral.mean(1),2))-28)
        candidate=(dist<13)&((v.max(2)-v.min(2))<36)&(v.mean(2)>background_floor)
        labels,count=ndi.label(candidate)
        borders=np.unique(np.concatenate([labels[0],labels[-1],labels[:,0],labels[:,-1]]))
        selected=np.zeros(count+1,dtype=bool);selected[borders]=True;selected[0]=False
        slices=ndi.find_objects(labels)
        for ident,sl in enumerate(slices,1):
            if selected[ident] or sl is None:continue
            sub=labels[sl]==ident;pix=v[sl][sub]
            if len(pix)<18:continue
            delta=np.sqrt(((pix[:,0]-pix[:,1])-rg)**2+((pix[:,1]-pix[:,2])-gb)**2)
            # Detached leg gaps have the same two-tone texture as the exterior.
            if np.median(delta)<5 and np.std(pix.mean(1))>10 and np.percentile(pix.mean(1),30)<222:
                selected[ident]=True
        background=selected[labels]
    foreground=~background
    labels,n=ndi.label(foreground);sizes=np.bincount(labels.ravel());small=sizes<12;small[0]=False
    foreground[small[labels]]=False
    # A narrow antialiased edge retains the source colors and exact registration.
    inside=ndi.distance_transform_edt(foreground)
    alpha=np.where(foreground,np.clip(inside/1.4,0,1)*255,0).astype(np.uint8)
    result=np.dstack([rgb,alpha]);out=Path(output);out.parent.mkdir(parents=True,exist_ok=True);Image.fromarray(result).save(out)
    meta={'method':mode,'source':str(Path(source).resolve()),'output':str(out.resolve()),'dimensions':list(im.size),'sourceRGBUnchanged':bool(np.array_equal(result[:,:,:3],rgb)),'alphaRange':[int(alpha.min()),int(alpha.max())],'transparentPixels':int((alpha==0).sum()),'foregroundPixels':int((alpha>0).sum()),'sourceSha256':hashlib.sha256(Path(source).read_bytes()).hexdigest(),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'status':'needs-visual-review'}
    out.with_suffix('.cutout.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2));return meta

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('output');a=p.parse_args();print(json.dumps(cutout(a.source,a.output),ensure_ascii=False))
