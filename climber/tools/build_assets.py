"""Deterministic low-poly glTF 2.0 asset authoring. No external 3D dependency.

Y up, metres, forward +Z. All props have their lowest vertex at Y=0.
The character uses a genuine glTF skin (rigid weights for a faceted style).
"""
from pathlib import Path
import json, math, struct, random
import numpy as np

OUT = Path(__file__).resolve().parents[1] / 'assets'
RNG = random.Random(44)
PALETTE = {
 'bark': '#654231', 'wood': '#b58754', 'cut': '#d2af72',
 'leaf': '#2e7051', 'leafLight': '#57915c', 'leafDark': '#21503e',
 'stone': '#817c72', 'sandstone': '#a78e6c', 'redstone': '#ad5943',
 'snow': '#e2eef1', 'ice': '#82cfdf', 'iceLight': '#c0edf0',
 'obsidian': '#242537', 'obsidianLight': '#423c59', 'lava': '#ff6c27',
 'mushroom': '#b85749', 'cream': '#ead4ae', 'cactus': '#4f8b61',
 'skin': '#c9906b', 'shirt': '#db8043', 'pants': '#314d61',
 'boots': '#3c3534', 'pack': '#677a52', 'metal': '#b7bec0',
 'rope': '#e3b85f', 'flag': '#eab958', 'eye': '#272a30',
}

def rgba(h):
 return [int(h[i:i+2],16)/255 for i in (1,3,5)]+[1.0]

class Mesh:
 def __init__(self): self.parts={}
 def tri(self,a,b,c,mat,joint=0):
  self.parts.setdefault(mat,[]).append((np.array(a,float),np.array(b,float),np.array(c,float),joint))
 def quad(self,a,b,c,d,mat,joint=0):
  self.tri(a,b,c,mat,joint); self.tri(a,c,d,mat,joint)
 def tube(self,a,b,r1,r2,mat,n=8,joint=0):
  a,b=np.array(a,float),np.array(b,float); axis=b-a; axis/=np.linalg.norm(axis)
  u=np.cross(axis,[0,0,1] if abs(axis[2])<.9 else [1,0,0]); u/=np.linalg.norm(u); v=np.cross(axis,u)
  rings=[[p+r*(math.cos(i*2*math.pi/n)*u+math.sin(i*2*math.pi/n)*v) for i in range(n)] for p,r in [(a,r1),(b,r2)]]
  for i in range(n):
   k=(i+1)%n
   self.quad(rings[0][i],rings[0][k],rings[1][k],rings[1][i],mat,joint)
   self.tri(a,rings[0][k],rings[0][i],mat,joint); self.tri(b,rings[1][i],rings[1][k],mat,joint)
 def ellipsoid(self,c,s,mat,n=9,rings=5,joint=0,rough=0):
  c,s=np.array(c),np.array(s); rows=[]
  for j in range(1,rings):
   phi=math.pi*j/rings
   rows.append([c+s*np.array([math.sin(phi)*math.cos(i*2*math.pi/n),math.cos(phi),math.sin(phi)*math.sin(i*2*math.pi/n)])*(1+RNG.uniform(-rough,rough)) for i in range(n)])
  top=c+s*[0,1,0]; bottom=c-s*[0,1,0]
  for i in range(n):
   k=(i+1)%n; self.tri(top,rows[0][k],rows[0][i],mat,joint); self.tri(bottom,rows[-1][i],rows[-1][k],mat,joint)
   for j in range(len(rows)-1): self.quad(rows[j][i],rows[j][k],rows[j+1][k],rows[j+1][i],mat,joint)
 def box(self,c,s,mat,joint=0):
  c=np.array(c); s=np.array(s)/2
  p=[c+s*np.array([x,y,z]) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
  for a,b,c,d in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(3,7,6,2),(0,1,5,4)]: self.quad(p[a],p[b],p[c],p[d],mat,joint)
 def ground(self):
  lo=min(p[1] for tris in self.parts.values() for t in tris for p in t[:3])
  for tris in self.parts.values():
   for t in tris:
    for p in t[:3]: p[1]-=lo

class GLB:
 def __init__(self):
  self.bin=bytearray(); self.d={'asset':{'version':'2.0','generator':'Climber low-poly asset kit'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'Asset','children':[]}],'meshes':[],'materials':[],'bufferViews':[],'accessors':[],'buffers':[]}
 def accessor(self,arr,kind,component=5126,target=None):
  a=np.asarray(arr,dtype={5126:'<f4',5123:'<u2'}[component]); self.bin.extend(b'\0'*((-len(self.bin))%4)); offset=len(self.bin); raw=a.tobytes(); self.bin.extend(raw)
  view={'buffer':0,'byteOffset':offset,'byteLength':len(raw)}
  if target: view['target']=target
  vi=len(self.d['bufferViews']); self.d['bufferViews'].append(view)
  count=len(a); ac={'bufferView':vi,'componentType':component,'count':count,'type':kind}
  if component==5126 and kind in ('VEC3','SCALAR'):
   ac['min']=np.atleast_1d(a.min(axis=0)).tolist(); ac['max']=np.atleast_1d(a.max(axis=0)).tolist()
  ai=len(self.d['accessors']); self.d['accessors'].append(ac); return ai
 def mesh(self,m,skinned=False):
  primitives=[]
  for name,tris in m.parts.items():
   material={'name':name,'pbrMetallicRoughness':{'baseColorFactor':rgba(PALETTE[name]),'metallicFactor':.12 if name=='metal' else 0,'roughnessFactor':.42 if name in ('ice','obsidian') else .9}}
   if name=='lava': material['emissiveFactor']=[1,.19,.015]
   mi=len(self.d['materials']); self.d['materials'].append(material)
   vertices=[]; normals=[]; joints=[]
   for a,b,c,j in tris:
    normal=np.cross(b-a,c-a); length=np.linalg.norm(normal)
    if length<1e-10: continue
    normal/=length
    vertices.extend([a,b,c]); normals.extend([normal]*3); joints.extend([[j,0,0,0]]*3)
   attr={'POSITION':self.accessor(vertices,'VEC3',target=34962),'NORMAL':self.accessor(normals,'VEC3',target=34962)}
   if skinned:
    attr['JOINTS_0']=self.accessor(joints,'VEC4',5123,34962); attr['WEIGHTS_0']=self.accessor([[1,0,0,0]]*len(vertices),'VEC4',target=34962)
   primitives.append({'attributes':attr,'material':mi,'mode':4})
  self.d['meshes'].append({'primitives':primitives})
  ni=len(self.d['nodes']); self.d['nodes'].append({'name':'Geometry','mesh':len(self.d['meshes'])-1}); self.d['nodes'][0]['children'].append(ni); return ni
 def save(self,name):
  self.d['buffers']=[{'byteLength':len(self.bin)}]; js=json.dumps(self.d,separators=(',',':')).encode(); js+=b' '*((-len(js))%4); data=bytes(self.bin); data+=b'\0'*((-len(data))%4)
  raw=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(data))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data
  (OUT/name).write_bytes(raw)

def rock(m,c,s,mat='stone'): m.ellipsoid(c,s,mat,n=8,rings=4,rough=.18)
def leaf(m,a,b,w,mat='leaf'):
 a,b=np.array(a),np.array(b); d=b-a; side=np.cross(d,[0,1,0]); side/=max(np.linalg.norm(side),.001); mid=a+d*.48+[0,.16,0]
 m.quad(a,mid+side*w,b,mid-side*w,mat); m.quad(a,mid-side*w,b,mid+side*w,mat)

def props():
 result={}
 m=Mesh()
 for i in range(11):
  a=i*2*math.pi/11; rock(m,(.65*math.cos(a),.14,.65*math.sin(a)),(.2,.16,.17))
 for i in range(5):
  a=i*2.4; x,z=.45*math.cos(a),.45*math.sin(a)
  m.tube((-x,.16,-z),(x,.23,z),.095,.08,'bark'); m.tube((x,.23,z),(x*1.01,.232,z*1.01),.074,.074,'cut')
 result['campfire']=m
 m=Mesh()
 for i in range(7):
  a=(.055*i*i,.7*i,0); b=(.055*(i+1)**2,.7*(i+1),0); m.tube(a,b,.23-i*.018,.215-i*.018,'bark')
 top=np.array((.055*49,4.9,0))
 for i in range(10):
  a=i*2*math.pi/10; end=top+np.array([2.1*math.cos(a),-.8,2.1*math.sin(a)])
  leaf(m,top,end,.44,'leafLight' if i%3==0 else 'leaf')
 for i in range(3): m.ellipsoid(top+[-.22+i*.22,-.22,.12],(.14,.18,.14),'bark')
 result['palm']=m
 m=Mesh(); rock(m,(0,.65,0),(1.1,.75,.9),'sandstone'); rock(m,(.65,.17,.3),(.4,.25,.5),'sandstone'); result['beach_rock']=m
 m=Mesh(); m.tube((0,0,0),(0,3.9,0),.34,.16,'bark')
 for i in range(6):
  a=i*2.4; end=(1.15*math.cos(a),3.7+(i%3)*.5,1.15*math.sin(a)); m.tube((0,2.1,0),end,.13,.035,'bark'); m.ellipsoid(end,(1.5,1.1,1.3),'leafLight' if i%2 else 'leaf',rough=.12)
 for i in range(5):
  a=i*2*math.pi/5; m.tube((0,.6,0),(.7*math.cos(a),.05,.7*math.sin(a)),.17,.07,'bark')
 result['jungle_tree']=m
 m=Mesh()
 for x,y,z in [(-.45,.45,0),(.4,.5,.1),(0,.65,-.2),(0,.35,.4)]: m.ellipsoid((x,y,z),(.65,.55,.6),'leafLight' if x<0 else 'leaf',rough=.15)
 result['bush']=m
 def mushroom(m,x,z,h,r):
  m.tube((x,0,z),(x+.08,h*.73,z),r*.19,r*.14,'cream',10)
  # Dome cap with flat pale gills, a walkable broad surface.
  n=16; rows=[]
  for rr,yy in [(0,h),(r*.48,h*.97),(r*.86,h*.87),(r,h*.76)]:
   rows.append([(x+rr*math.cos(i*2*math.pi/n),yy,z+rr*math.sin(i*2*math.pi/n)) for i in range(n)])
  for j in range(3):
   for i in range(n):
    k=(i+1)%n; m.quad(rows[j][i],rows[j][k],rows[j+1][k],rows[j+1][i],'mushroom')
  for i in range(n): m.tri((x,h*.72,z),rows[-1][i],rows[-1][(i+1)%n],'cream')
  for i in range(9):
   a=i*2.4; rr=r*(.3+.11*(i%4)); yy=h*float(np.interp(rr/r,[0,.48,.86,1],[1,.97,.87,.76])); m.ellipsoid((x+rr*math.cos(a),yy+.035,z+rr*math.sin(a)),(r*.085,.05,r*.075),'cream',n=6,rings=3)
 m=Mesh(); mushroom(m,0,0,3.7,1.65); result['giant_mushroom']=m
 m=Mesh()
 for x,z,h,r in [(-.3,0,.5,.32),(.26,.12,.75,.4),(.05,-.3,.34,.24)]: mushroom(m,x,z,h,r)
 result['small_mushrooms']=m
 m=Mesh(); m.tube((0,0,0),(0,5.1,0),.2,.07,'bark')
 for y,r in [(1.15,1.5),(2.1,1.2),(3,.95),(3.8,.65)]:
  m.tube((0,y,0),(0,y+1.45,0),r,0,'leafDark',10); m.tube((0,y+.24,0),(0,y+1.48,0),r*.91,0,'snow',10)
 result['snow_pine']=m
 m=Mesh()
 for x,z,h,r in [(0,0,1.8,.36),(.5,.1,1.1,.25),(-.4,.15,.85,.22),(.1,-.4,.65,.22)]:
  m.tube((x,0,z),(x,h*.78,z),r,r*.85,'ice',6); m.tube((x,h*.78,z),(x+.08,h,z),r*.85,0,'iceLight',6)
 result['ice_crystals']=m
 m=Mesh(); m.tube((0,0,0),(0,2.65,0),.26,.22,'cactus',10); m.ellipsoid((0,2.64,0),(.22,.22,.22),'cactus')
 for s,y in [(-1,1.2),(1,1.65)]:
  m.tube((0,y,0),(s*.65,y,0),.17,.16,'cactus'); m.tube((s*.65,y,0),(s*.65,y+.75,0),.16,.13,'cactus'); m.ellipsoid((s*.65,y+.75,0),(.13,.13,.13),'cactus')
 for i in range(28):
  a=i*2.4; y=.2+(i%9)*.25; p=np.array([.26*math.cos(a),y,.26*math.sin(a)]); m.tube(p,p+np.array([.065*math.cos(a),.04,.065*math.sin(a)]),.009,0,'cream',3)
 result['cactus']=m
 m=Mesh(); rock(m,(0,.65,0),(1.2,.8,.95),'redstone'); rock(m,(.8,.17,.3),(.4,.25,.35),'redstone'); result['red_boulder']=m
 m=Mesh()
 for x,z,h,r in [(0,0,2.8,.65),(.6,.1,1.35,.35),(-.4,-.2,.9,.3)]:
  m.tube((x,0,z),(x+.1,h*.65,z),r,r*.55,'obsidian',5); m.tube((x+.1,h*.65,z),(x+.27,h,z-.12),r*.55,0,'obsidianLight',5)
 result['obsidian_spike']=m
 m=Mesh(); rock(m,(0,.43,0),(.95,.55,.72),'obsidian')
 for a,b,c,j in list(m.parts['obsidian']):
  normal=np.cross(b-a,c-a); normal/=np.linalg.norm(normal)
  if normal[1]<.15: continue
  # Bright fissures follow the exported rock facets and remain above the surface.
  start=a*.7+b*.15+c*.15+normal*.009; end=a*.15+b*.2+c*.65+normal*.009
  direction=end-start; across=np.cross(normal,direction); across/=np.linalg.norm(across); across*=.014
  m.quad(start-across,end-across,end+across,start+across,'lava')
 result['glowing_lava_rock']=m
 m=Mesh(); rock(m,(0,.65,0),(1.05,.75,.8)); m.ellipsoid((0,1.13,0),(.85,.27,.65),'snow',n=8,rings=4,rough=.1); result['snow_rock']=m
 m=Mesh(); m.tube((0,0,0),(0,3,0),.035,.028,'metal'); m.ellipsoid((0,3,0),(.065,.065,.065),'metal')
 for i in range(8):
  x0=.035+i*.125; x1=x0+.125; z0=.11*math.sin(i*.65); z1=.11*math.sin((i+1)*.65)
  m.quad((x0,2.88,z0),(x0,2.21,z0),(x1,2.21,z1),(x1,2.88,z1),'flag'); m.quad((x0,2.88,z0),(x1,2.88,z1),(x1,2.21,z1),(x0,2.21,z0),'flag')
 result['summit_flag']=m
 return result

def quat(axis,angle):
 a=np.array(axis,float); a/=np.linalg.norm(a); return [*(a*math.sin(angle/2)),math.cos(angle/2)]

def qmul(a,b):
 a,b=np.array(a),np.array(b)
 return [*(a[3]*b[:3]+b[3]*a[:3]+np.cross(a[:3],b[:3])),a[3]*b[3]-np.dot(a[:3],b[:3])]

def character():
 g=GLB(); m=Mesh(); bones=[]; ids={}
 def bone(name,pos,parent=None):
  i=len(bones); ids[name]=i; bones.append((name,np.array(pos,float),parent)); return i
 bone('Hips',(0,.91,0)); bone('Spine',(0,1.1,0),'Hips'); bone('Chest',(0,1.34,0),'Spine'); bone('Neck',(0,1.48,0),'Chest'); bone('Head',(0,1.58,0),'Neck')
 for side,s in [('Left',1),('Right',-1)]:
  bone(side+'UpperArm',(s*.24,1.4,0),'Chest'); bone(side+'ForeArm',(s*.51,1.4,0),side+'UpperArm'); bone(side+'Hand',(s*.75,1.4,0),side+'ForeArm')
  bone(side+'UpLeg',(s*.12,.89,0),'Hips'); bone(side+'Leg',(s*.12,.5,0),side+'UpLeg'); bone(side+'Foot',(s*.12,.12,.035),side+'Leg')
 # Model is in true T pose; each faceted section is rigidly weighted to its bone.
 m.ellipsoid((0,1.2,0),(.235,.28,.14),'shirt',joint=ids['Spine']); m.box((0,.94,0),(.38,.15,.26),'pants',ids['Hips'])
 m.tube((0,1.43,0),(0,1.56,0),.065,.065,'skin',joint=ids['Neck']); m.ellipsoid((0,1.61,0),(.115,.14,.108),'skin',joint=ids['Head'])
 m.ellipsoid((0,1.715,0),(.125,.035,.12),'shirt',joint=ids['Head'])
 m.box((0,1.724,.11),(.18,.018,.09),'shirt',ids['Head'])
 for x in [-.042,.042]: m.box((x,1.64,.105),(.018,.022,.012),'eye',ids['Head'])
 m.box((0,1.24,-.17),(.3,.36,.15),'pack',ids['Spine']); m.box((0,1.23,-.255),(.2,.18,.04),'bark',ids['Spine'])
 for x in [-.135,.135]: m.box((x,1.25,.135),(.035,.32,.02),'pack',ids['Spine'])
 m.tube((-.18,1.01,.15),(.18,1.01,.15),.022,.022,'rope',joint=ids['Hips'])
 for side,s in [('Left',1),('Right',-1)]:
  j=ids[side+'UpperArm']; m.tube((s*.2,1.4,0),(s*.48,1.4,0),.085,.065,'shirt',joint=j)
  j=ids[side+'ForeArm']; m.tube((s*.51,1.4,0),(s*.74,1.4,0),.061,.043,'skin',joint=j)
  j=ids[side+'Hand']; m.box((s*.79,1.4,0),(.095,.075,.07),'skin',j)
  for k in range(4): m.tube((s*.825,1.4,-.025+k*.017),(s*(.89-abs(k-1.5)*.008),1.4,-.025+k*.017),.009,.007,'skin',5,j)
  m.tube((s*.78,1.37,.02),(s*.82,1.345,.025),.014,.01,'skin',5,j)
  j=ids[side+'UpLeg']; m.tube((s*.12,.9,0),(s*.12,.51,0),.102,.075,'pants',joint=j)
  j=ids[side+'Leg']; m.tube((s*.12,.5,0),(s*.12,.14,.02),.075,.055,'pants',joint=j)
  j=ids[side+'Foot']; m.box((s*.12,.085,.08),(.155,.17,.28),'boots',j); m.box((s*.12,.015,.08),(.16,.03,.29),'eye',j)
 meshnode=g.mesh(m,True); g.d['nodes'][meshnode]['skin']=0
 node_ids=[]
 for name,pos,parent in bones:
  node_ids.append(len(g.d['nodes'])); delta=pos-(bones[ids[parent]][1] if parent else np.zeros(3)); g.d['nodes'].append({'name':name,'translation':delta.tolist(),'children':[]})
 for i,(name,pos,parent) in enumerate(bones):
  g.d['nodes'][node_ids[ids[parent]] if parent else 0]['children'].append(node_ids[i])
 matrices=[]
 for name,pos,parent in bones:
  a=np.eye(4); a[:3,3]=-pos; matrices.append(a.T.flatten())
 g.d['skins']=[{'name':'ClimberRig','joints':node_ids,'skeleton':node_ids[0],'inverseBindMatrices':g.accessor(matrices,'MAT4')}]
 g.d['animations']=[]
 for clip,duration in [('Idle',2.4),('Walking',1),('Running',.65),('Climbing',1.6),('Falling',1.2)]:
  anim={'name':clip,'samplers':[],'channels':[]}; times=np.linspace(0,duration,25); ti=g.accessor(times,'SCALAR')
  for name in ids:
   if name in ('Neck','Head','Spine','Hips'): continue
   values=[]
   for t in times:
    p=2*math.pi*t/duration; s=1 if name.startswith('Left') else -1; axis=[1,0,0]; angle=0
    if 'UpperArm' in name:
     if clip=='Climbing': axis=[0,0,1]; angle=s*(.95+.45*math.sin(p)*s)
     elif clip=='Falling': axis=[0,0,1]; angle=s*(-.35+.1*math.sin(p))
     else: axis=[0,0,1]; angle=-s*1.35
    elif 'ForeArm' in name:
     if clip=='Climbing': axis=[0,0,1]; angle=s*(.55+.42*math.sin(p+.8)*s)
     elif clip=='Running': angle=-.85
     else: angle=-.12
    elif 'UpLeg' in name:
     angle=(.85 if clip=='Running' else .5 if clip=='Walking' else 0)*math.sin(p)*s
     if clip=='Climbing': angle=-.6-.4*math.sin(p)*s
     if clip=='Falling': angle=s*.25
    elif name.endswith('Leg'):
     angle=0 if clip=='Idle' else max(0,-math.sin(p)*s)*(1.15 if clip=='Running' else .55)
     if clip=='Climbing': angle=.9+.4*math.sin(p)*s
    elif name=='Chest': angle=.018*math.sin(p) if clip=='Idle' else -.12 if clip=='Climbing' else .06
    q=quat(axis,angle)
    if 'UpperArm' in name and clip in ('Walking','Running'):
     q=qmul(quat([1,0,0],(.65 if clip=='Running' else .4)*math.sin(p)*-s),q)
    values.append(q)
   oi=g.accessor(values,'VEC4'); si=len(anim['samplers']); anim['samplers'].append({'input':ti,'output':oi,'interpolation':'LINEAR'}); anim['channels'].append({'sampler':si,'target':{'node':node_ids[ids[name]],'path':'rotation'}})
  g.d['animations'].append(anim)
 g.save('climber.glb'); return m

def main():
 OUT.mkdir(parents=True,exist_ok=True); models=props()
 for name,m in models.items():
  m.ground()
  if name=='giant_mushroom':
   height=max(p[1] for tris in m.parts.values() for t in tris for p in t[:3])
   for tris in m.parts.values():
    for t in tris:
     for p in t[:3]: p[1]*=3.7/height
  g=GLB(); g.d['nodes'][0]['name']=name; g.mesh(m); g.save(name+'.glb')
 models['climber']=character()
 metadata={}
 for name,m in models.items():
  points=np.array([p for tris in m.parts.values() for t in tris for p in t[:3]])
  metadata[name]={'file':name+'.glb','dimensions_m':np.round(points.max(0)-points.min(0),3).tolist(),'bounds_min':np.round(points.min(0),3).tolist(),'bounds_max':np.round(points.max(0),3).tolist(),'triangles':sum(len(v) for v in m.parts.values())}
 (OUT/'model-info.json').write_text(json.dumps(metadata,indent=2)+'\n')
 return models

if __name__=='__main__': main()
