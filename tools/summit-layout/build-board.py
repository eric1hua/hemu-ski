"""Draw a source-linked engineering board locally; no generative API calls.

Run with a Python environment containing Pillow. Versioned outputs are never
overwritten. Reference photos are read only.
"""
from pathlib import Path
import argparse
import json
import math
import struct
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--version', default='v01')
args = parser.parse_args()
version = args.version
board_path = HERE / f'summit-layout-{version}.png'
layout_path = HERE / f'layout-{version}.json'
if board_path.exists() or layout_path.exists():
    raise SystemExit('Output exists; choose a new --version.')
refs = json.loads((HERE / 'reference-pins-v01.json').read_text())
aerial = next(r for r in refs['refs'] if r['width'] == 2778)
perspective = next(r for r in refs['refs'] if r['width'] == 3840)
pins = {p['label']: (p['u'] * aerial['width'], p['v'] * aerial['height']) for p in aerial['pins']}
a = pins['gondola no6']; b = pins['gondola no7']
dx, dy = b[0]-a[0], b[1]-a[1]
length = math.hypot(dx, dy)
photo_u = (dx/length, dy/length)
photo_v = (photo_u[1], -photo_u[0])
def local(p):
    x,y = p[0]-a[0],p[1]-a[1]
    return [round((x*photo_u[0]+y*photo_u[1])/length, 3), round((x*photo_v[0]+y*photo_v[1])/length, 3)]

names = ['圆顶帐篷', '金色雕塑', '低矮棚亭', '圆形装置 / 观景点', '木屋', '崖边木框', '坡边建筑']
primitives = ['cylinder + cone', '3 poles + small cap', 'box + shallow gable', '2 cylinders / rings', 'box + gable', '2 poles + crossbar', 'box + gable']
sizes = [[6,6,4], [4,4,5], [7,3,2.8], [9,9,2.5], [6,5,5], [4,0.6,3.5], [8,6,5]]
objects = []
for i in range(1,8):
    # Object 6 is absent from the aerial reference. Its diagram marker is a
    # relationship-only hypothesis, explicitly not a recovered coordinate.
    uv = local(pins[f'object {i}']) if i != 6 else [0.43, 0.42]
    objects.append({'id': f'summit:object-{i}', 'sourceLabel': f'object {i}', 'name': names[i-1],
        'diagramUV': uv, 'positionStatus': 'single-view hypothesis; verify before placement' if i==6 else 'aerial image-plane projection; NOT surveyed plan coordinates',
        'placeholder': primitives[i-1], 'suggestedSizeMeters': sizes[i-1], 'sizeStatus': 'adjustable blockout assumption, not measured',
        'worldPosition': None, 'yawRadians': None, 'yawStatus': 'fit using both photos; not recovered', 'modelUrl': None})

world = json.loads((ROOT/'public/data/world.json').read_text())
edits_path = ROOT/'public/data/edits/edits.json'
edits = json.loads(edits_path.read_text()) if edits_path.exists() else None
meta = {**world['detail'], **(edits['detail'] if edits else {})}
height_file = ROOT/'public/data'/('edits' if edits else '')/meta['file']
values = struct.unpack('<'+'H'*((meta['cells']+1)**2), height_file.read_bytes())
def height(x,z):
    step=meta['size']/meta['cells']; n=meta['cells']+1
    fx=(x-meta['center'][0]+meta['size']/2)/step; fz=(z-meta['center'][1]+meta['size']/2)/step
    i,j=math.floor(fx),math.floor(fz); u,v=fx-i,fz-j
    q=(values[j*n+i]*(1-u)+values[j*n+i+1]*u)*(1-v)+(values[(j+1)*n+i]*(1-u)+values[(j+1)*n+i+1]*u)*v
    return round(meta['min']+q*(meta['max']-meta['min'])/65535,2)
anchors=[]
for lift in (edits.get('lifts',world['lifts']) if edits else world['lifts']):
    if lift['name'] not in ('6号索道','7号索道'): continue
    ends=[lift['points'][0],lift['points'][-1]]
    p=max(ends,key=lambda p: height(*p))
    anchors.append({'name': lift['name'], 'liftId': lift['id'], 'topXZ':p, 'rawTerrainHeight':height(*p), 'status':'current saved game data; re-read before implementing'})
anchors.sort(key=lambda q:q['name'])
station_distance=math.dist(anchors[0]['topXZ'],anchors[1]['topXZ'])
layout={'version':version, 'scope':'planning only; no runtime or terrain changes', 'sourcePageId':refs['pageId'],
    'sourcePins':'reference-pins-v01.json', 'coordinateWarning':'diagramUV comes from an oblique photo, not a metric top-down reconstruction. Do not multiply by station distance and ship as final world coordinates.',
    'diagramAxes':{'origin':'Gondola 6 upper terminal','u':'toward Gondola 7 upper terminal; separation = 1','v':'perpendicular in aerial image toward objects 5 and 7; NOT a verified world north'},
    'anchors': anchors,'currentStationSeparationMeters':round(station_distance,3), 'objects':objects,
    'unNumberedLandmark':{'name':'tall communications mast near object 5','countedInSevenObjects':False,'instruction':'retain as orientation cue; optional thin pole helper only'},
    'terrainZones':[{'id':'A','name':'connected station circulation terrace','rule':'continuous walkable snow, local pads; no single giant flat slab'},
      {'id':'B','name':'rounded snow knoll at object 1','rule':'preserve rounded rise and route around it; crest height requires calibration'},
      {'id':'C','name':'ridge extension toward object 4','rule':'narrow gently connected ridge path; height unknown'},
      {'id':'D','name':'cliff-side slope and shoulder toward object 7','rule':'retain steep outer face and traversable inner shoulder; drop unknown'}]}
layout_path.write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n')

W,H=2800,2380
im=Image.new('RGB',(W,H),'#f2f5f7'); d=ImageDraw.Draw(im)
FONT='/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
def font(s): return ImageFont.truetype(FONT,s)
INK='#173242'; MUTED='#526d7c'; TEAL='#087d88'; ORANGE='#c36b24'; RED='#c03c48'
def text(x,y,t,s=28,c=INK): d.text((x,y),t,font=font(s),fill=c)
def line(p,c=INK,w=3): d.line(p,fill=c,width=w)
def arrow(p,q,c=INK,w=4):
    line([p,q],c,w); ang=math.atan2(q[1]-p[1],q[0]-p[0]); size=16
    d.polygon([q,(q[0]-size*math.cos(ang-.45),q[1]-size*math.sin(ang-.45)),(q[0]-size*math.cos(ang+.45),q[1]-size*math.sin(ang+.45))],fill=c)
def pill(x,y,t,c=TEAL):
    box=d.textbbox((0,0),t,font=font(25)); width=box[2]+24
    d.rounded_rectangle((x,y,x+width,y+42),radius=12,fill=c);text(x+12,y+4,t,25,'white')
def marker(x,y,t,c=TEAL,r=22):
    d.ellipse((x-r,y-r,x+r,y+r),fill=c,outline='white',width=3)
    box=d.textbbox((0,0),t,font=font(25));text(x-(box[2]-box[0])/2,y-17,t,25,'white')

d.rectangle((0,0,W,170),fill=INK)
text(60,30,'云霄峰山顶 | 地形 + 7 个地标站位',54,'white')
text(64,108,'施工参考 v01   ·   Cowart 两视角标注   ·   几何占位先行，后续独立替换模型',28,'#c1dce5')
pill(2080,45,'设计草案 / 待视觉确认',ORANGE)

# Top panel: source-relative diagram, deliberately without metre scale or north arrow.
d.rounded_rectangle((40,200,1780,1310),radius=22,fill='white')
text(75,224,'01  站位关系图',37)
text(75,278,'航拍照片投影的关系示意：不是实测总平图；站距、朝向、高差需在游戏中校准。',25,MUTED)
def pos(uv): return (850+uv[0]*650, 1010-uv[1]*690)
terrain=[(-1.13,-.20),(-1.18,.18),(-.91,.34),(-.51,.43),(-.17,.55),(.10,.80),(.38,.68),(.68,.48),(1.16,.19),(1.22,-.22),(.56,-.43),(-.16,-.31)]
d.polygon([pos(p) for p in terrain],fill='#e6f0f4',outline='#7ca1b5',width=4)
# Cliff face at the edge of the inner summit snow shoulder.
cliff=[(.07,.81),(.38,.69),(.69,.48),(1.16,.19)]
line([pos(p) for p in cliff],'#486b80',9)
for i in range(12):
    u=.1+i*.083;v=.79-(u-.1)*.59; x,y=pos((u,v)); line([(x,y),(x+16,y-25)],'#7294a5',3)
text(1280,405,'D  外侧陡坡 / 内侧通行',25,MUTED)
# Main circulation route behind the terminals; line is a desired usable corridor.
route=[(-.22,-.05),(.20,.15),(.58,.15),(1.10,-.03)]
line([pos(p) for p in route],'#8ac9d2',46)
line([pos(p) for p in route],'#d9f3f4',31)
arrow(pos((.32,.15)),pos((.76,.15)),TEAL,5)
text(1060,870,'A  站前通行区',26,TEAL)
# Snow knoll at 1, and a ridge connection toward 4.
o1=next(o for o in objects if o['sourceLabel']=='object 1'); x,y=pos(o1['diagramUV'])
for r in [85,67,48]:d.ellipse((x-r,y-r*.65,x+r,y+r*.65),outline='#8eacbc',width=3)
text(1430,615,'B  圆钝雪包',25,MUTED)
line([pos((-.97,.0)),pos((-.54,.15)),pos((-.18,.28))],'#9ebdca',18)
text(110,875,'C  山脊延伸 / 窄连接',25,MUTED)

for u,label in [(0,'6 号上站'),(1,'7 号上站')]:
    x,y=pos((u,0));d.rounded_rectangle((x-75,y-29,x+75,y+29),radius=17,fill=INK)
    text(x-62,y-18,label,25,'white');arrow((x,y+40),(x-28,y+122),MUTED,4)
text(800,1150,'索道向下',23,MUTED);text(1440,1150,'索道向下',23,MUTED)

for o in objects:
    x,y=pos(o['diagramUV']);i=int(o['sourceLabel'][-1]);color=ORANGE if i==6 else TEAL
    if i in (1,4):
        d.ellipse((x-28,y-18,x+28,y+18),fill='#f4ddaf',outline=INK,width=3)
        if i==1:d.polygon([(x-27,y-5),(x,y-40),(x+27,y-5)],fill='#fff9df',outline=INK)
    elif i in (3,5,7):
        d.polygon([(x-28,y+14),(x+26,y+14),(x+26,y-17),(x-28,y-17)],fill='#dfba94',outline=INK)
        d.polygon([(x-36,y-17),(x,y-42),(x+36,y-17)],fill='#688391',outline=INK)
    elif i==2:
        line([(x-25,y+16),(x,y-38),(x+25,y+16)],'#aa8736',7)
        line([(x,y-37),(x,y+19)],'#aa8736',5)
    else:
        line([(x-23,y+18),(x-23,y-30),(x+23,y-30),(x+23,y+18)],'#a5774a',7)
    marker(x+40,y-35,str(i),color)
    if i==6:text(x+38,y+8,'待复核',20,ORANGE)

text(75,1212,'图上 U：6 号上站 → 7 号上站；V：照片内朝木屋及坡边建筑。',25,MUTED)
text(75,1250,'不标北向、不标米制比例；7 个编号沿用原标注，两个索道站另计。',25,MUTED)

# Object register.
d.rounded_rectangle((1810,200,2760,1310),radius=22,fill='white')
text(1845,224,'02  占位模型清单',37)
text(1845,279,'仅建议体块；尺寸是可调起点，不是照片测量。',25,MUTED)
for index,o in enumerate(objects):
    y=340+index*104; i=index+1; marker(1870,y+18,str(i),ORANGE if i==6 else TEAL)
    text(1910,y-6,o['name'],30)
    sx,sz,sy=o['suggestedSizeMeters']; text(1910,y+37,f'{o["placeholder"]}  |  {sx} × {sz} × {sy} m',23,MUTED)
text(1845,1090,'额外参照：5 号附近的高通信杆，不占 1–7 编号。',23,MUTED)
text(1845,1138,'统一：底心 pivot、稳定 ID、独立碰撞、可换 GLB。',23,MUTED)
text(1845,1186,'先验收地形、落地和通路，再制作正式建筑资产。',23,TEAL)
text(1845,1234,'未改游戏代码 / 未改地形 / 未生成正式 3D 模型',23,ORANGE)

# Evidence photographs stay intact; markers are projected from saved arrows.
text(60,1350,'03  原始照片编号对照',37)
text(60,1403,'圆点来自 Cowart 箭头端点；编号位置忠于原标注。照片是空间关系依据，示意图只是施工草案。',25,MUTED)
for r,ox,title in [(aerial,60,'A  航拍视角：7 个地标中可见 1–5、7'),(perspective,1420,'B  反向斜视：补足 6 号木框与崖侧关系')]:
    oy=1490; path=ROOT/'canvas/pages'/refs['pageId'][5:]/'assets'/Path(r['src']).name
    photo=Image.open(path).convert('RGB')
    # Display the aerial's original crop, exactly as its Cowart image record.
    c=r['crop'];cx=c['topLeft']['x']*photo.width;cy=c['topLeft']['y']*photo.height
    ex=c['bottomRight']['x']*photo.width;ey=c['bottomRight']['y']*photo.height
    photo=photo.crop((round(cx),round(cy),round(ex),round(ey)))
    scale=min(1315/photo.width,755/photo.height);size=(round(photo.width*scale),round(photo.height*scale));photo=photo.resize(size,Image.Resampling.LANCZOS)
    im.paste(photo,(ox,oy));text(ox,1452,title,26)
    for p in r['pins']:
        x=ox+(p['u']*r['width']-cx)*scale;y=oy+(p['v']*r['height']-cy)*scale
        label=p['label'].replace('object ','').replace('gondola no','G')
        color=INK if label.startswith('G') else TEAL
        rr=19 if len(label)==1 else 25
        marker(x,y,label,color,rr)

d.rectangle((0,2280,W,H),fill=INK)
text(60,2300,'交接文件：CLAUDE-CODE-v01.md + layout-v01.json + reference-pins-v01.json',27,'white')
text(60,2340,'状态：照片标注已读取；站位与尺寸是草案；地形高差、朝向、6 号位置待游戏内校准与用户确认。',23,'#c1dce5')
im.save(board_path)
print(json.dumps({'board':str(board_path),'layout':str(layout_path),'anchors':anchors,'objects':len(objects)},ensure_ascii=False))
