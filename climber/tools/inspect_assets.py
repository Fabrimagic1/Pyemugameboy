"""Read the delivered binaries, validate their data, render actual meshes/skin poses."""
from pathlib import Path
import json, struct, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT=Path(__file__).resolve().parents[1]/'assets'
def load(path):
 raw=path.read_bytes(); magic,ver,size=struct.unpack_from('<III',raw)
 assert magic==0x46546c67 and ver==2 and size==len(raw)
 length,tag=struct.unpack_from('<II',raw,12); assert tag==0x4e4f534a
 d=json.loads(raw[20:20+length]); offset=20+length; bl,bt=struct.unpack_from('<II',raw,offset); assert bt==0x004e4942
 data=raw[offset+8:]; assert len(data)==bl
 def acc(i):
  a=d['accessors'][i]; v=d['bufferViews'][a['bufferView']]; start=v.get('byteOffset',0)+a.get('byteOffset',0)
  cols={'SCALAR':1,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]; dtype={5126:'<f4',5123:'<u2'}[a['componentType']]
  assert start+a['count']*cols*np.dtype(dtype).itemsize<=len(data)
  r=np.frombuffer(data,dtype=dtype,count=a['count']*cols,offset=start).reshape(-1,cols).copy(); assert np.isfinite(r).all(); return r
 for i in range(len(d['accessors'])): acc(i)
 return d,acc

def rot(q):
 x,y,z,w=q
 return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],[0,0,0,1]],dtype=float)

def triangles(d,acc,clip=None,phase=0):
 rotations={}
 if clip is not None:
  anim=next(a for a in d['animations'] if a['name']==clip)
  for ch in anim['channels']:
   sampler=anim['samplers'][ch['sampler']]; qs=acc(sampler['output']); rotations[ch['target']['node']]=qs[round(phase*(len(qs)-1))]
 world={}
 def visit(i,parent):
  node=d['nodes'][i]; local=rot(rotations.get(i,node.get('rotation',[0,0,0,1]))); local[:3,3]=node.get('translation',[0,0,0]); world[i]=parent@local
  for child in node.get('children',[]): visit(child,world[i])
 for i in d['scenes'][0]['nodes']: visit(i,np.eye(4))
 result=[]
 for ni,node in enumerate(d['nodes']):
  if 'mesh' not in node: continue
  for p in d['meshes'][node['mesh']]['primitives']:
   at=p['attributes']; points=acc(at['POSITION']); normals=acc(at['NORMAL']); assert len(points)%3==0; assert np.allclose(np.linalg.norm(normals,axis=1),1,atol=1e-4)
   h=np.c_[points,np.ones(len(points))]
   if 'skin' in node:
    skin=d['skins'][node['skin']]; inv=acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1); js=acc(at['JOINTS_0']); ws=acc(at['WEIGHTS_0'])
    assert js.max()<len(skin['joints']); assert np.allclose(ws.sum(1),1)
    mats=np.array([world[j]@ib for j,ib in zip(skin['joints'],inv)])
    transformed=np.zeros_like(h)
    for k in range(4): transformed+=np.einsum('nij,nj->ni',mats[js[:,k]],h)*ws[:,k,None]
    points=transformed[:,:3]
   else: points=(world[ni]@h.T).T[:,:3]
   color=np.array(d['materials'][p['material']]['pbrMetallicRoughness']['baseColorFactor'][:3])*255
   for tri in points.reshape(-1,3,3): result.append((tri,color))
 return result

def render(tris,size=(420,370),fixed=None):
 im=Image.new('RGB',size,'#17252b'); draw=ImageDraw.Draw(im)
 # Fixed three-quarter orthographic camera; painter's algorithm on explicit triangles.
 yaw=-.62; tilt=.32
 rx=np.array([[1,0,0],[0,math.cos(tilt),-math.sin(tilt)],[0,math.sin(tilt),math.cos(tilt)]])
 ry=np.array([[math.cos(yaw),0,math.sin(yaw)],[0,1,0],[-math.sin(yaw),0,math.cos(yaw)]])
 camera=rx@ry; points=np.array([t for t,c in tris]); view=points@camera.T
 lo=view.reshape(-1,3).min(0); hi=view.reshape(-1,3).max(0)
 scale=min((size[0]-55)/(hi[0]-lo[0]),(size[1]-60)/(hi[1]-lo[1])); center=(lo+hi)/2
 light=np.array([-.45,.8,.5]); light/=np.linalg.norm(light)
 draw.ellipse((size[0]*.24,size[1]-35,size[0]*.76,size[1]-13),fill='#101c21')
 for i in np.argsort(view[:,:,2].mean(1)):
  tri,col=tris[i]; normal=np.cross(tri[1]-tri[0],tri[2]-tri[0]); normal/=max(np.linalg.norm(normal),1e-9)
  brightness=.55+.45*max(0,np.dot(normal,light)); color=tuple(np.clip(col*brightness,0,255).astype(int))
  p=view[i]; xy=np.c_[(p[:,0]-center[0])*scale+size[0]/2,-(p[:,1]-center[1])*scale+size[1]/2-5]
  draw.polygon([tuple(x) for x in xy],fill=color)
 return im

def main():
 files=list(OUT.glob('*.glb')); assert len(files)==16
 info=json.loads((OUT/'model-info.json').read_text()); report={}; sheet=Image.new('RGB',(1680,1640),'#17252b'); draw=ImageDraw.Draw(sheet)
 try: font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',18)
 except OSError: font=ImageFont.load_default()
 for i,path in enumerate(files):
  d,a=load(path); tris=triangles(d,a); points=np.concatenate([t for t,c in tris]); height=float(points[:,1].max()-points[:,1].min())
  assert abs(points[:,1].min())<1e-5
  if path.stem=='climber':
   assert abs(height-1.75)<.01; assert {x['name'] for x in d['animations']}=={'Idle','Walking','Running','Climbing','Falling'}
   for anim in d['animations']:
    for s in anim['samplers']:
     times=a(s['input']).flatten(); assert np.all(np.diff(times)>0); assert len(times)==len(a(s['output'])); assert np.allclose(np.linalg.norm(a(s['output']),axis=1),1,atol=1e-5)
    for phase in [0,.25,.5,.75,1]: triangles(d,a,anim['name'],phase)
  if path.stem=='giant_mushroom': assert abs(height-3.7)<1e-5
  report[path.name]={'triangles':len(tris),'bytes':path.stat().st_size,'height_m':round(height,4),'valid':True}
  frame=render(tris); x=(i%4)*420; y=(i//4)*410; sheet.paste(frame,(x,y)); draw.text((x+18,y+373),f'{path.stem}  |  {height:.2f} m',font=font,fill='#dce5de')
 sheet.save(OUT/'preview-models.jpg',quality=93)
 d,a=load(OUT/'climber.glb'); animsheet=Image.new('RGB',(1500,700),'#17252b'); ad=ImageDraw.Draw(animsheet)
 for row,phase in enumerate([.2,.7]):
  for col,clip in enumerate(['Idle','Walking','Running','Climbing','Falling']):
   animsheet.paste(render(triangles(d,a,clip,phase),(300,310)),(col*300,row*350)); ad.text((col*300+20,row*350+316),f'{clip}  t={phase:.1f}',font=font,fill='#dce5de')
 animsheet.save(OUT/'preview-animations.jpg',quality=93)
 for name in ['rock','ground']:
  im=Image.open(OUT/(name+'.jpg')); assert im.size==(1024,1024) and im.format=='JPEG'; report[name+'.jpg']={'size':list(im.size),'format':im.format}
 (OUT/'validation.json').write_text(json.dumps(report,indent=2)+'\n'); print(json.dumps(report,indent=2))

if __name__=='__main__': main()
