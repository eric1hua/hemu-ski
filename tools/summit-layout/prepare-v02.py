"""Prepare non-generative contact sheets from the latest Cowart snapshot."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,math,re,hashlib

P=Path(__file__).resolve().parent; ROOT=P.parent.parent
D=json.loads((P/'source-canvas-v02.json').read_text()); S=D['snapshot']['store']
PAGE=D['pageId']; ASSETS=ROOT/'canvas/pages'/PAGE[5:]/'assets'
OUT=P/'v02';OUT.mkdir(exist_ok=True)
F='/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
def font(n):return ImageFont.truetype(F,n)
def txt(q):return '\n'.join(''.join(t.get('text','') for t in p.get('content',[])) for p in q.get('props',{}).get('richText',{}).get('content',[]))
def xy(q):
 x,y=q.get('x',0),q.get('y',0); parent=S.get(q.get('parentId'))
 while parent and parent.get('typeName')=='shape':
  a=parent.get('rotation',0);x,y=parent.get('x',0)+math.cos(a)*x-math.sin(a)*y,parent.get('y',0)+math.sin(a)*x+math.cos(a)*y;parent=S.get(parent.get('parentId'))
 return x,y
def read_img(q,crop=True):
 a=S[q['props']['assetId']]['props'];file=ASSETS/Path(a['src']).name;im=Image.open(file).convert('RGB')
 if crop and q['props'].get('crop'):
  c=q['props']['crop'];im=im.crop((round(c['topLeft']['x']*im.width),round(c['topLeft']['y']*im.height),round(c['bottomRight']['x']*im.width),round(c['bottomRight']['y']*im.height)))
 return im,file
def save_new(im,file):
 if file.exists():raise RuntimeError(f'Refusing overwrite {file}')
 im.save(file)
images=[q for q in S.values() if q.get('typeName')=='shape' and q.get('type')=='image']
maps=[q for q in images if q['parentId']==PAGE and q['id']!='shape:summit-layout-v01']
arrows=[q for q in S.values() if q.get('type')=='arrow' and q.get('typeName')=='shape']
pin_data=[]
sheet=Image.new('RGB',(2800,1880),'#e6edf2');draw=ImageDraw.Draw(sheet)
for i,q in enumerate(sorted(maps,key=lambda q:(q['y'],q['x']))):
 im,file=read_img(q);im.thumbnail((1360,810));ox=20+(i%2)*1400;oy=75+(i//2)*920;sheet.paste(im,(ox,oy))
 draw.text((ox,oy-55),f'VIEW {i+1} — {file.name}',font=font(26),fill='#163545')
 x,y=xy(q);a=S[q['props']['assetId']]['props'];c=q['props'].get('crop') or {'topLeft':{'x':0,'y':0},'bottomRight':{'x':1,'y':1}}
 pts=[]
 for ar in arrows:
  ex,ey=xy(ar);end=ar['props']['end'];ang=ar.get('rotation',0);ex+=math.cos(ang)*end['x']-math.sin(ang)*end['y'];ey+=math.sin(ang)*end['x']+math.cos(ang)*end['y']
  u,v=(ex-x)/q['props']['w'],(ey-y)/q['props']['h']
  if not(0<=u<=1 and 0<=v<=1):continue
  label=txt(ar);px=ox+u*im.width;py=oy+v*im.height;tag=label.replace('object ','').replace('gondola no','G')
  draw.ellipse((px-19,py-19,px+19,py+19),fill='#ce354b',outline='white',width=2)
  box=draw.textbbox((0,0),tag,font=font(23));draw.text((px-(box[2]-box[0])/2,py-16),tag,font=font(23),fill='white')
  pts.append({'arrowId':ar['id'],'label':label,'displayUV':[u,v],'sourceUV':[c['topLeft']['x']+u*(c['bottomRight']['x']-c['topLeft']['x']),c['topLeft']['y']+v*(c['bottomRight']['y']-c['topLeft']['y'])]})
 pin_data.append({'shapeId':q['id'],'asset':a,'crop':c,'pins':pts})
save_new(sheet,OUT/'annotated-views-v02.jpg')
(OUT/'reference-pins-v02.json').write_text(json.dumps({'pageId':PAGE,'revision':D['revision'],'views':pin_data},ensure_ascii=False,indent=2)+'\n')
registry=[]
for g in D['groups']:
 ids=set(re.findall(r'object\s*(\d+)',' '.join(g['labels']),re.I));n=int(next(iter(ids))) if len(ids)==1 else None
 for im in g['images']:registry.append({'number':n,'shapeId':im['shapeId'],'path':str(ASSETS/Path(im['asset']['src']).name),'crop':im['crop']})
for title,nums in [('refs-2-3-4-6-v02',{2,3,4,6}),('refs-7-8-9-v02',{7,8,9})]:
 items=sorted([r for r in registry if r['number'] in nums],key=lambda r:r['number']); cols=3;cellw,cellh=740,660;rows=math.ceil(len(items)/cols)
 sheet=Image.new('RGB',(cols*cellw,rows*cellh),'#ecf1f4');draw=ImageDraw.Draw(sheet)
 for i,item in enumerate(items):
  q=S[item['shapeId']];im,_=read_img(q);im.thumbnail((cellw-30,cellh-80));x=(i%cols)*cellw+15;y=(i//cols)*cellh+65
  draw.text((x,y-50),f'OBJECT {item["number"]}   /   reference {i+1}',font=font(30),fill='#173242');sheet.paste(im,(x,y))
 save_new(sheet,OUT/f'{title}.jpg')
(OUT/'object-reference-index-v02.json').write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n')
print('Prepared',len(maps),'annotated views and',len(registry),'numbered close-up references.')
