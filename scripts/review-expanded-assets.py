from pathlib import Path
from PIL import Image,ImageDraw
from asset_paths import PROCESSED_DIR, production_dir, review_font
import json
root=PROCESSED_DIR;dest=root/'reviews';dest.mkdir(exist_ok=True)
fs=json.loads((production_dir()/'furniture/brief.json').read_text());font=review_font(18)
for batch in range(3):
 group=fs[batch*3:batch*3+3];sheet=Image.new('RGB',(1250,900),(244,240,229));draw=ImageDraw.Draw(sheet)
 for row,f in enumerate(group):
  files=[('空家具',root/'furniture'/(f['id']+'.png'))]
  for a in f['actions']:
   for frame in ['a','b']:files.append((a['name']+' '+frame.upper(),root/'interactions'/f['id']/('base-'+a['id']+'-'+frame+'.png')))
  for col,(title,path) in enumerate(files):
   x,y=col*250,row*300;draw.text((x+8,y+8),f['name']+' · '+title,font=font,fill=(45,57,41))
   if not path.exists():draw.text((x+40,y+110),'待生成 / 待处理',font=font,fill=(140,70,40));continue
   image=Image.open(path).convert('RGBA');image.thumbnail((245,250));bg=Image.new('RGBA',image.size,(177,195,158,255));bg.alpha_composite(image);sheet.paste(bg.convert('RGB'),(x+2,y+40))
 sheet.save(dest/('base-'+str(batch+1)+'.png'))
print(dest)
