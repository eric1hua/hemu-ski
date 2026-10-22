"""Recover the two new user arrow endpoints through the v03 board transforms."""
from pathlib import Path
from PIL import Image
import json, math
BASE=Path(__file__).resolve().parent; ROOT=BASE.parents[1]
OUT=BASE/'v04'; OUT.mkdir(exist_ok=True)
D=json.loads((BASE/'source-canvas-v04.json').read_text());S=D['snapshot']['store']
old=json.loads((BASE/'v03/reference-pins-v03-r02.json').read_text())
ASSETS=ROOT/'canvas/pages/ApwypO47DueJozzQFxZIw/assets'
def world(q,p):
    x,y=p
    while q and q.get('typeName')=='shape':
        a=q.get('rotation',0);x,y=q.get('x',0)+math.cos(a)*x-math.sin(a)*y,q.get('y',0)+math.sin(a)*x+math.cos(a)*y
        q=S.get(q.get('parentId'))
    return x,y
def inv(q,p):
    o=world(q,(0,0));ex=world(q,(1,0));ey=world(q,(0,1))
    a,b,c,d=ex[0]-o[0],ey[0]-o[0],ex[1]-o[1],ey[1]-o[1];x,y=p[0]-o[0],p[1]-o[1]
    return ((d*x-b*y)/(a*d-b*c),(-c*x+a*y)/(a*d-b*c))
specs=[('D','shape:44uhE-J7LYb5p1bCXECUs','shape:summit-location-plan-v03-r02',(1625,180,1530,1040)),
       ('C','shape:fmefHkubp-_X-f4lMY4QT','shape:summit-cross-view-check-v03-r02',(1625,180,1530,1020))]
result=[]
for view,aid,bid,rect in specs:
    ar=S[aid];board=S[bid];asset=S[board['props']['assetId']]['props'];end=ar['props']['end']
    endpoint=world(ar,(end['x'],end['y']));local=inv(board,endpoint)
    px=local[0]/board['props']['w']*asset['w'];py=local[1]/board['props']['h']*asset['h']
    v=next(x for x in old['views'] if x['view']==view);im=Image.open(ASSETS/v['file']);sw,sh=im.size
    c=v['crop'];crop=(round(c['topLeft']['x']*sw),round(c['topLeft']['y']*sh),round(c['bottomRight']['x']*sw),round(c['bottomRight']['y']*sh))
    x,y,w,h=rect;scale=min((w-38)/(crop[2]-crop[0]),(h-138)/(crop[3]-crop[1]));iw,ih=round((crop[2]-crop[0])*scale),round((crop[3]-crop[1])*scale)
    ox=x+(w-iw)//2;oy=y+80+(h-138-ih)//2
    assert ox<=px<=ox+iw and oy<=py<=oy+ih,(view,px,py)
    source=((px-ox)/scale+crop[0],(py-oy)/scale+crop[1]);uv=(source[0]/sw,source[1]/sh)
    back=(ox+(uv[0]*sw-crop[0])*scale,oy+(uv[1]*sh-crop[1])*scale)
    assert math.hypot(back[0]-px,back[1]-py)<1e-6
    result.append({'view':view,'label':'6','arrowId':aid,'origin':'user-correction-arrow-on-v03-board','status':'user-explicit-location','boardShapeId':bid,'boardPixel':[px,py],'sourceFile':v['file'],'sourceUV':list(uv),'sourcePixel':list(source),'displayUV':[(uv[0]-c['topLeft']['x'])/(c['bottomRight']['x']-c['topLeft']['x']),(uv[1]-c['topLeft']['y'])/(c['bottomRight']['y']-c['topLeft']['y'])],'canvasEndpoint':list(endpoint),'roundTripErrorPixels':math.hypot(back[0]-px,back[1]-py)})
out={'version':'v04','sourceRevision':D['revision'],'decision':'User supplied explicit object 6 arrows on both v03 boards. These replace D candidate and old C endpoint; A summer reference remains valid context.','corrections':result,'rejectedCandidate':next(x for x in old['manualVisibleFeatures'] if x['label']=='6?'),'scope':'Only object 6 updated; other category pins unchanged from v03.'}
p=OUT/'object-6-correction-v04.json'
if p.exists():raise RuntimeError(f'Refusing overwrite: {p}')
p.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
