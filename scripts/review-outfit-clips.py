from pathlib import Path
from PIL import Image,ImageDraw
from asset_paths import PACK_ROOT, PROCESSED_DIR, review_font
import json,sys
stage=PROCESSED_DIR;dest=stage/'reviews';dest.mkdir(exist_ok=True)
pack=json.loads((PACK_ROOT/'pack.json').read_text());font=review_font(18)
for fid in sys.argv[1:]:
 f=next(v for v in pack['furniture'] if v['id']==fid);actions=list(f['actions'])
 for chunk in range(2):
  outfits=pack['outfits'][chunk*5:chunk*5+5];image=Image.new('RGB',(1120,300*len(outfits)),(242,239,226));draw=ImageDraw.Draw(image)
  for row,outfit in enumerate(outfits):
   for col,(action,phase) in enumerate((a,p) for a in actions for p in ['a','b']):
    target=stage/'interactions'/fid/(outfit['id']+'-'+action+'-'+phase+'.png')
    if not target.exists() and fid=='reading-chair' and outfit['id'] in ['base','winter','rain']:target=PACK_ROOT/'assets'/(outfit['id']+'-'+action+'-'+phase+'.png')
    x,y=col*280,row*300;draw.text((x+8,y+6),outfit['name']+' · '+action+' '+phase,font=font,fill=(45,55,40))
    if not target.exists():draw.text((x+55,y+105),'尚未处理',font=font,fill=(130,80,50));continue
    im=Image.open(target).convert('RGBA');im.thumbnail((275,265));bg=Image.new('RGBA',im.size,(168,190,153,255));bg.alpha_composite(im);image.paste(bg.convert('RGB'),(x+2,y+32))
  image.save(dest/(fid+'-outfits-'+str(chunk+1)+'.png'))
print('review sheets saved')
