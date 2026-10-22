"""Draw source-coordinate technical location boards, without generative APIs."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, math, re, hashlib

ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
OUT=BASE/'v03'; OUT.mkdir(exist_ok=True)
D=json.loads((BASE/'source-canvas-v03.json').read_text())
S=D['snapshot']['store']; PAGE='page:ApwypO47DueJozzQFxZIw'
ASSETS=ROOT/'canvas/pages'/PAGE[5:]/'assets'
FONT='/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
BG='#f1f4f1'; INK='#173c46'; MUTED='#52696d'; RED='#bf3e42'; BLUE='#166c99'; AMBER='#ae6811'
def font(n): return ImageFont.truetype(FONT,n)
def text(q):
    def walk(n):
        if isinstance(n,dict): return n.get('text','')+''.join(walk(x) for x in n.get('content',[]))
        return ''
    return walk(q.get('props',{}).get('richText',{}))
def transform(q,p):
    x,y=p
    while q and q.get('typeName')=='shape':
        a=q.get('rotation',0); x,y=q.get('x',0)+math.cos(a)*x-math.sin(a)*y,q.get('y',0)+math.sin(a)*x+math.cos(a)*y
        q=S.get(q.get('parentId'))
    return x,y
def local(q,p):
    o=transform(q,(0,0)); ex=transform(q,(1,0)); ey=transform(q,(0,1))
    a,b=ex[0]-o[0],ey[0]-o[0]; c,d=ex[1]-o[1],ey[1]-o[1]
    x,y=p[0]-o[0],p[1]-o[1]; det=a*d-b*c
    return ((d*x-b*y)/det,(-c*x+a*y)/det)
def write_new(p,value):
    if p.exists(): raise RuntimeError(f'Refusing overwrite: {p}')
    if isinstance(value,Image.Image): value.save(p)
    else: p.write_text(value)
def jsave(p,value): write_new(p,json.dumps(value,ensure_ascii=False,indent=2)+'\n')

ids=[('A','夏季俯拍 · 站区主定位','shape:9o1i2eJCM-Lz5D55oEQcb'),
     ('B','夏季斜视 · 前后与朝向校核','shape:yDBsS0IR-SWCpyx5i7AG7'),
     ('C','冬季反向 · 高差与对应关系校核','shape:f4Cd84sY31U6KS_ifR5jA'),
     ('D','冬季航拍 · 扩展区与9号定位','shape:RfsvqorpGtAjIcjak0wgp')]
views=[]
for key,title,sid in ids:
    q=S[sid]; asset=S[q['props']['assetId']]['props']; crop=q['props'].get('crop') or {'topLeft':{'x':0,'y':0},'bottomRight':{'x':1,'y':1}}
    pins=[]
    for ar in S.values():
        if ar.get('typeName')!='shape' or ar.get('type')!='arrow': continue
        label=text(ar); m=re.fullmatch(r'object\s*(\d+)',label.strip(),re.I)
        g=re.fullmatch(r'gondola\s*no\s*(\d+)',label.strip(),re.I)
        if not(m or g):continue
        p=ar['props']['end']; ax,ay=local(q,transform(ar,(p['x'],p['y'])))
        u,v=ax/q['props']['w'],ay/q['props']['h']
        if not(0<=u<=1 and 0<=v<=1):continue
        su=crop['topLeft']['x']+u*(crop['bottomRight']['x']-crop['topLeft']['x'])
        sv=crop['topLeft']['y']+v*(crop['bottomRight']['y']-crop['topLeft']['y'])
        tag=m.group(1) if m else 'G'+g.group(1)
        pins.append({'label':tag,'arrowId':ar['id'],'origin':'user-arrow-endpoint','displayUV':[u,v],'sourceUV':[su,sv],
                     'status':'source-annotated'})
    views.append({'view':key,'title':title,'shapeId':sid,'file':Path(asset['src']).name,'crop':crop,'pins':pins})

# Visible-feature picks are deliberately separate from the user's arrows.
manual=[{'view':'D','label':'6?','sourceUV':[927.5/2778,548.75/1284],'status':'candidate-only','origin':'visual-feature-pick','note':'Visible wooden frame left of mast; not user-confirmed cross-view identity.'},
        {'view':'D','label':'9a','sourceUV':[1452.5/2778,318.75/1284],'status':'visible-instance-center','origin':'visual-feature-pick'},
        {'view':'D','label':'9b','sourceUV':[1513.75/2778,296.875/1284],'status':'visible-instance-center','origin':'visual-feature-pick'},
        {'view':'D','label':'9c','sourceUV':[1783.75/2778,345.625/1284],'status':'visible-instance-center','origin':'visual-feature-pick'}]
data={'version':'v03','sourcePageId':PAGE,'sourceRevision':D['revision'],'coordinates':'Normalized source-image pixels; not orthographic ground coordinates or world positions.','views':views,'manualVisibleFeatures':manual,
      'primaryReferences':{'1':'A','2':'A','3':'A; B,C,D cross-check category area; individual three set centers not recovered','4':'A','5':'A','6':'A: explicitly chosen by user as primary; B/C cross-check; D visible identity candidate','7':'A and D','8':'A and B','9':'D; source arrow marks category, manual picks distinguish three visible pods'},
      'forbiddenPlacementSource':'summit-overview-art-v02.png: user rejected spatial layout'}
jsave(OUT/'reference-pins-v03-r02.json',data)

def label(draw,p,tag,offset=(0,-50),color=RED):
    x,y=p; tx,ty=x+offset[0],y+offset[1]
    tw=draw.textbbox((0,0),tag,font=font(31))[2]; w=max(50,tw+24)
    draw.line((x,y,tx,ty),fill='white',width=8);draw.line((x,y,tx,ty),fill=color,width=4)
    draw.ellipse((x-6,y-6,x+6,y+6),fill=color,outline='white',width=2)
    draw.rounded_rectangle((tx-w/2,ty-24,tx+w/2,ty+24),radius=12,fill=color,outline='white',width=3)
    draw.text((tx-tw/2,ty-21),tag,font=font(31),fill='white')

offsets={
 'A':{'1':(-65,40),'2':(35,-55),'3':(20,-55),'4':(65,20),'5':(-50,50),'6':(-10,60),'7':(50,-50),'8':(50,-60),'G6':(100,-20),'G7':(-80,-60)},
 'D':{'1':(80,10),'2':(-30,60),'3':(15,65),'4':(40,65),'5':(-40,65),'7':(-55,-50),'8':(10,65),'9':(-75,-55),'G6':(-80,40),'G7':(70,50),'6?':(-80,-35),'9a':(0,80),'9b':(15,-65),'9c':(80,0)},
 'B':{'1':(100,-30),'2':(-30,65),'3':(-90,-40),'5':(-70,-65),'6':(-40,65),'7':(65,-45),'8':(-20,65),'G6':(-85,50),'G7':(70,60)},
 'C':{'1':(55,45),'2':(-35,-65),'3':(-20,65),'4':(-80,-45),'5':(60,55),'6':(75,-20),'7':(-80,-45),'8':(-70,-55),'G6':(-65,60),'G7':(-65,50)}}

def panel(board,v,rect,focus=None,include_manual=False):
    draw=ImageDraw.Draw(board); x,y,w,h=rect
    draw.rounded_rectangle((x,y,x+w,y+h),radius=16,fill='white',outline='#c1cdcf',width=2)
    draw.text((x+24,y+14),v['view']+'  '+v['title'],font=font(34),fill=INK)
    im=Image.open(ASSETS/v['file']).convert('RGB')
    if focus: l,t,r,b=focus
    else:
        c=v['crop'];l,t,r,b=c['topLeft']['x'],c['topLeft']['y'],c['bottomRight']['x'],c['bottomRight']['y']
    crop=(round(l*im.width),round(t*im.height),round(r*im.width),round(b*im.height))
    sw,sh=im.size;im=im.crop(crop);im.thumbnail((w-38,h-138),Image.Resampling.LANCZOS)
    # Upscale original-image panel with known crop transform, keeping aspect ratio.
    scale=min((w-38)/(crop[2]-crop[0]),(h-138)/(crop[3]-crop[1]))
    size=(round((crop[2]-crop[0])*scale),round((crop[3]-crop[1])*scale))
    im=Image.open(ASSETS/v['file']).convert('RGB').crop(crop).resize(size,Image.Resampling.LANCZOS)
    ox=x+(w-im.width)//2;oy=y+80+(h-138-im.height)//2;board.paste(im,(ox,oy))
    def project(uv):return ox+(uv[0]*sw-crop[0])*scale,oy+(uv[1]*sh-crop[1])*scale
    for p in v['pins']:
        label(draw,project(p['sourceUV']),p['label'],offsets[v['view']].get(p['label'],(0,-50)),AMBER if p['status']=='cross-view-check-required' else RED)
    if include_manual:
        for p in manual:
            label(draw,project(p['sourceUV']),p['label'],offsets['D'][p['label']],BLUE)
    draw.text((x+24,y+h-43),'source: '+v['file'],font=font(23),fill=MUTED)

names=['传统蒙古包','四国路牌','转经轮：3组×7轮','敖包与经幡','通信杆旁小木屋','巨型木相框','咖啡小屋','双座秋千','现代穹顶：3间']
positions=[
 'A：G7外侧、6号旁；D：G7后侧雪包',
 'A：两站之间，8与6之间；D：中央通行面',
 'A：G6与敖包4之间的连接段；3组不能合成一个空棚',
 'A：G6另一侧的步道端头；D：画面最左端，局部出画',
 'A：G6外侧、通信杆脚旁；D：G6后方木屋',
 'A：1与2外侧、靠7的广场边缘；用户指定按A定位；B/C校核；D木框为候选',
 'A：下缘外侧平台；D：通信杆后方雪肩；不是独立高山顶',
 'A：G7靠2的一侧；B：G7口外中央侧；两座板',
 'D：7号更远处的坡肩，9a/9b/9c三间；A未提供该区域落点']
board=Image.new('RGB',(3200,2240),BG);draw=ImageDraw.Draw(board)
draw.text((60,28),'云霄峰 · 定位施工图 v03',font=font(68),fill=INK)
draw.text((65,115),'保留真实照片与原箭头落点 / 暂停使用 v02 AI 总览施工 / 不是测绘坐标',font=font(31),fill=MUTED)
panel(board,views[0],(45,180,1530,1040),focus=(.22,.37,.78,.99))
panel(board,views[3],(1625,180,1530,1040),include_manual=True)
draw.text((65,1250),'红色：用户原箭头端点     蓝色：目视实体候选 / 单间中心     A/B/C/D保留各自相机视角，不直接合并像平面坐标',font=font(30),fill=INK)
for i,(name,pos) in enumerate(zip(names,positions)):
    y=1330+i*77
    if i%2==0:draw.rounded_rectangle((50,y-4,3150,y+68),radius=8,fill='#e2e9e7')
    draw.text((75,y),str(i+1),font=font(39),fill=RED)
    draw.text((145,y+2),name,font=font(35),fill=INK)
    draw.text((720,y+7),pos,font=font(29),fill=INK)
draw.text((65,2050),'坐标只用于匹配照片：没有实测米数、北向、世界坐标或高程。红点不等于物体底心。',font=font(31),fill=INK)
draw.text((65,2110),'6号已指定A为主定位；3号三组各自中心/朝向仍待校准；不得用 AI 图或任意像平面缩放代替。',font=font(30),fill=MUTED)
write_new(OUT/'summit-location-plan-v03-r02.png',board)

board=Image.new('RGB',(3200,1370),BG);draw=ImageDraw.Draw(board)
draw.text((60,28),'云霄峰 · 反向视角校核 v03',font=font(62),fill=INK)
draw.text((65,112),'原图 A/D 主定位，B/C 查前后、高差与对应关系；不会把不同视角的屏幕左右直接合并',font=font(31),fill=MUTED)
panel(board,views[1],(45,180,1530,1020))
panel(board,views[2],(1625,180,1530,1020))
draw.text((65,1230),'6号已按用户指定以 A 夏季俯拍为准；B/C 原标注保留用于校核，不复制第二个相框。',font=font(31),fill=INK)
draw.text((65,1290),'照片时间与季节可能不同；全部原标注保持可见，最终世界朝向须在游戏内用相机校准。',font=font(30),fill=MUTED)
write_new(OUT/'summit-cross-view-check-v03-r02.png',board)

old=json.loads((BASE/'v02/layout-v02.json').read_text())
old.update({'version':'v03','sourceRevision':D['revision'],'sourcePriority':'User source arrows/photos and explicit conflict decisions only; rejected v02 AI overview forbidden for placement.','coordinateStatus':'No world-coordinate calibration yet.','referencePins':'reference-pins-v03-r02.json'})
for obj in old['objects']:
    tag=str(obj['number']); obj['imagePlanePins']=[{'view':v['view'],'arrowId':p['arrowId'],'sourceUV':p['sourceUV'],'status':p['status']} for v in views for p in v['pins'] if p['label']==tag]
    obj['placementRule']=positions[obj['number']-1]
    obj['worldPosition']=None;obj['yawRadians']=None
    if obj['number']==6:obj['primaryReferenceDecision']={'view':'A','by':'user','instruction':'Use summer aerial annotation as primary. D frame identity candidate; B/C secondary cross-check. Do not duplicate.'}
    if obj['number']==9:obj['visibleInstanceCenters']=[p for p in manual if p['label'].startswith('9')]
jsave(OUT/'layout-v03-r02.json',old)
lines=['# 原图端点坐标 v03','','UV 取值 0–1，左上角为原图原点。是原图箭头端点，不是世界坐标或物体底心。','','| 编号 | A 夏季俯拍 | B 夏季斜视 | C 冬季反向 | D 冬季航拍 |','| --- | --- | --- | --- | --- |']
for tag in ['G6','G7']+[str(i) for i in range(1,10)]:
    cells=[]
    for v in views:
        p=next((p for p in v['pins'] if p['label']==tag),None)
        cells.append(('%.4f, %.4f'%tuple(p['sourceUV'])+(' 冲突' if p['status']=='cross-view-check-required' else '')) if p else '无原箭头')
    lines.append('| '+tag+' | '+' | '.join(cells)+' |')
lines+=['','D 中蓝色 6?、9a/9b/9c 为单独保存的目视候选，不混进用户原箭头表。','A 的9缺失、D的6缺失，不代表可以自行补一个“确认点”。']
write_new(OUT/'SOURCE-COORDINATES-v03-r02.md','\n'.join(lines)+'\n')
print(json.dumps({'views':{v['view']:len(v['pins']) for v in views},'visibleFeaturePicks':len(manual),'outputs':[p.name for p in OUT.iterdir()]},ensure_ascii=False))
