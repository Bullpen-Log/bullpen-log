/* 데생 인형 예시 페이지 코드 — build.mts 가 head.html · 자료(OBP · S4)와 묶는다. 설명은 docs/designs/pitch-3d-mannequin.md */
const T=THREE, V3=(a)=>new T.Vector3(a[0],a[1],a[2]);
/* 두 자료를 같은 꼴로: x 홈 쪽, y 투수 왼쪽(1루), z 위, 미터 */
function fromObp(p){const ix=Object.fromEntries(OBP.names.map((n,i)=>[n,i]));const g=(f,n)=>{const k=ix[n]*3;return V3(f.slice(k,k+3));};
  return {label:'Driveline 샘플 · '+(p.mph*1.609).toFixed(0)+' km/h',info:`${p.level} · ${Number(p.age).toFixed(0)}세 · 키 ${Math.round(p.height*100)}cm`,height:p.height,dt:p.t[1]-p.t[0],
  ev:[['다리 최고',p.ev.pkh_time],['앞발 닿음',p.ev.fp_10_time],['최대 외회전',p.ev.MER_time],['릴리스',p.ev.BR_time]].map(([l,t])=>[l,p.t.findIndex(x=>x>=t)]),
  frames:p.f.map(f=>({rh:g(f,'rear_hip'),lh:g(f,'lead_hip'),rk:g(f,'rear_knee_jc'),lk:g(f,'lead_knee_jc'),ra:g(f,'rear_ankle_jc'),la:g(f,'lead_ankle_jc'),
    sh:g(f,'shoulder_jc'),gs:g(f,'glove_shoulder_jc'),el:g(f,'elbow_jc'),ge:g(f,'glove_elbow_jc'),wr:g(f,'wrist_jc'),gw:g(f,'glove_wrist_jc'),ha:g(f,'hand_jc'),gh:g(f,'glove_hand_jc'),
    td:g(f,'thorax_dist'),tp:g(f,'thorax_prox')})),ground:null};}
function fromLab(D,label,info){const ix=Object.fromEntries(D.names.map((n,i)=>[n,i]));const R=D.hand!=='L';const s=(a,b)=>R?a:b;
  /* 자료는 [앞, 위, 오른쪽] — 여기는 x 앞 · y 왼쪽 · z 위라 오른쪽을 뒤집는다(그대로 옮기면 거울상) */
  const g=(f,n)=>{const p=f[ix[n]];return new T.Vector3(p[0],-p[2],p[1]);};
  const ev=D.ev;const dt=0.15/Math.max(1,ev.release-ev.footPlant);
  return {label,info,height:D.heightCm/100,dt,
  ev:[['다리 최고',ev.kneeUp],['앞발 착지',ev.footPlant],['릴리스',ev.release]],
  frames:D.frames.map(f=>{const hip=g(f,'lHip').add(g(f,'rHip')).multiplyScalar(.5),shm=g(f,'lSh').add(g(f,'rSh')).multiplyScalar(.5);
   return {rh:g(f,s('rHip','lHip')),lh:g(f,s('lHip','rHip')),rk:g(f,s('rKn','lKn')),lk:g(f,s('lKn','rKn')),ra:g(f,s('rAn','lAn')),la:g(f,s('lAn','rAn')),
    rhe:g(f,s('rHe','lHe')),rto:g(f,s('rTo','lTo')),lhe:g(f,s('lHe','rHe')),lto:g(f,s('lTo','rTo')),
    sh:g(f,s('rSh','lSh')),gs:g(f,s('lSh','rSh')),el:g(f,s('rEl','lEl')),ge:g(f,s('lEl','rEl')),wr:g(f,s('rWr','lWr')),gw:g(f,s('lWr','rWr')),
    ha:g(f,s('rHandMid','lHandMid')),gh:g(f,s('lHandMid','rHandMid')),td:hip.clone().lerp(shm,0.55),tp:hip.clone().lerp(shm,1.05),
    nose:g(f,'nose'),ear:g(f,'lEar').add(g(f,'rEar')).multiplyScalar(.5)};}),ground:D.ground,mound:D.mound};}
const SETS=[fromObp(OBP.pitches[0]),fromLab(S4,S4.label,S4.info)];
/* 발끝 자료가 없는 예시(모션 캡처)는 발 방향을 어림 — 시작은 투수판과 나란히, 앞발은 착지 때 홈 쪽(살짝 닫힘), 뒷발은 골반이 돌 때 따라 돈다 */
for(const s of SETS){const at=l=>(s.ev.find(([n])=>n===l)||[])[1];s.ku=at('다리 최고');s.fp=s.ev[1][1];s.br=at('릴리스');
 const f0=s.frames[0];s.side=Math.sign(f0.rh.x-f0.lh.x)||-1;s.ankleZ=Math.min(f0.ra.z,f0.la.z);}
/* 머리 방향(귀 · 코 자료가 있을 때) — 장면마다 흔들리지 않게 앞뒤 5장면을 고르게 섞는다 */
for(const s of SETS){const fr=s.frames;if(!fr[0].ear)continue;const W=5,raw=fr.map(J=>[J.ear.clone().sub(J.sh.clone().add(J.gs).multiplyScalar(.5)),J.nose.clone().sub(J.ear)]);
 fr.forEach((J,i)=>{const a=new T.Vector3(),b=new T.Vector3();for(let j=Math.max(0,i-W);j<=Math.min(fr.length-1,i+W);j++){const q=1-Math.abs(j-i)/(W+1);a.addScaledVector(raw[j][0],q);b.addScaledVector(raw[j][1],q);}J.hup=a.normalize();J.hfw=b.normalize();});}
const cv=document.getElementById('c');
const R=new T.WebGLRenderer({canvas:cv,antialias:true,alpha:true});R.setPixelRatio(Math.min(2,devicePixelRatio));
R.outputEncoding=T.sRGBEncoding;R.toneMapping=T.ACESFilmicToneMapping;R.toneMappingExposure=1.15;
R.shadowMap.enabled=true;R.shadowMap.type=T.PCFSoftShadowMap;
const S=new T.Scene();const C=new T.PerspectiveCamera(28,1,0.08,600);C.up.set(0,0,1);
const lin=c=>new T.Color(c).convertSRGBToLinear();
S.add(new T.HemisphereLight(lin(0xf4f7ff),lin(0x3a3f48),0.85));
const L1=new T.DirectionalLight(lin(0xfff6ea),1.35);L1.castShadow=true;L1.shadow.mapSize.set(2048,2048);
Object.assign(L1.shadow.camera,{left:-2.4,right:2.4,top:2.4,bottom:-2.4,near:0.5,far:16});L1.shadow.bias=-0.0005;L1.shadow.normalBias=0.015;L1.shadow.radius=4;S.add(L1,L1.target);
const L2=new T.DirectionalLight(lin(0xa9c2e2),0.5);L2.position.set(-3,3,2);S.add(L2);
const L3=new T.DirectionalLight(lin(0xffffff),0.35);S.add(L3,L3.target);
/* 색은 그대로 — 화면 색 공간(sRGB)으로 옮겨 그늘만 부드럽게 */
const mat=(c,r,o={})=>new T.MeshStandardMaterial({color:lin(c),roughness:r??0.65,side:T.DoubleSide,...o});
const MAT={skin:mat(0xdcb08f,0.6),shirt:mat(0x3a7fc4,0.8),pants:mat(0xe9e4da,0.88),belt:mat(0x2b2b2b,0.5),sock:mat(0x2a3446,0.9),
 shoe:new T.MeshPhysicalMaterial({color:lin(0x1c1c1c),roughness:0.42,clearcoat:0.7,clearcoatRoughness:0.3,side:T.DoubleSide}),sole:mat(0xf2f2f2,0.6),
 glove:mat(0x8b5a2b,0.55),lace:mat(0x5e3a1a,0.6),ball:mat(0xffffff,0.45),seam:mat(0xc8312c,0.6),stripe:mat(0x1f4f84,0.7),button:mat(0xf2efe6,0.4),buckle:mat(0xc9a227,0.35,{metalness:0.6})};
/* 분석 보기: 뼈(상아색, 골반 주황 · 가슴 파랑)와 잰 선 */
const BM={bone:mat(0xefe7d6,0.5),joint:mat(0x8e9aa8,0.35),pelvis:mat(0xf08a3c,0.5),chest:mat(0x4aa3e8,0.5)};
const LC={pelvis:0xff9a4a,chest:0x5cb4ff,trunk:0x7be0a8,knee:0xffd166,arm:0xf27bd1,elbow:0xc49bff,ref:0xdfe6ee};
const LM={},FM={};for(const[k,c]of Object.entries(LC)){LM[k]=new T.MeshBasicMaterial({color:lin(c),transparent:true,depthTest:false,depthWrite:false});FM[k]=new T.MeshBasicMaterial({color:lin(c),transparent:true,depthTest:false,depthWrite:false,side:T.DoubleSide});}
const DEPTH=new T.MeshBasicMaterial({colorWrite:false,side:T.DoubleSide});
const world=new T.Group(),body=new T.Group(),bones=new T.Group(),lines=new T.Group();S.add(world,body,bones,lines);
const UP=new T.Vector3(0,1,0),ZV=new T.Vector3(0,0,1),RX=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2);
let G=body;
function put(o){G.add(o);if(G===body)o.castShadow=true;if(G===lines)o.renderOrder=10;return o;}
function clear(g){for(const o of [...g.children]){g.remove(o);o.geometry?.dispose();}}
function lathe(a,b,prof,m,seg=32){const d=b.clone().sub(a),h=d.length();const pts=prof.map(([t,r])=>new T.Vector2(Math.max(0.002,r),t*h-h/2));const o=new T.Mesh(new T.LatheGeometry(pts,seg),m);o.position.copy(a.clone().add(b).multiplyScalar(.5));o.quaternion.setFromUnitVectors(UP,d.normalize());return put(o);}
function ell(p,sx,sy,sz,m,q){const o=new T.Mesh(new T.SphereGeometry(1,32,22),m);o.position.copy(p);o.scale.set(sx,sy,sz);if(q)o.quaternion.copy(q);return put(o);}
function ring(p,dir,r,t,m){const o=new T.Mesh(new T.TorusGeometry(r,t,10,40),m);o.position.copy(p);o.quaternion.setFromUnitVectors(ZV,dir.clone().normalize());return put(o);}
function band(p,q,sx,sy,tz,m,tube=0.14){const o=new T.Mesh(new T.TorusGeometry(1,tube,10,48),m);o.quaternion.copy(q).multiply(RX);o.scale.set(sx,sy,tz);o.position.copy(p);return put(o);}
function basis(x,y,z){return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));}
function frame(x,u){const xa=x.clone().normalize();const ya=u.clone().sub(xa.clone().multiplyScalar(u.dot(xa))).normalize();const za=new T.Vector3().crossVectors(xa,ya);return {xa,ya,fw:za.clone().negate(),q:basis(xa,ya,za)};}
function prof(keys,t){for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const[t0,v0]=keys[i-1],[t1,v1]=keys[i];const u=(t-t0)/(t1-t0),s=u*u*(3-2*u);return v0+(v1-v0)*s;}return keys.at(-1)[1];}
function curve(pts,t){for(let i=1;i<pts.length;i++)if(t<=pts[i][0]){const[t0,a]=pts[i-1],[t1,b]=pts[i];return a.clone().lerp(b,(t-t0)/(t1-t0));}return pts.at(-1)[1].clone();}
const sm=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
/* 길이 방향 고리를 이어 만든 매끈한 겉면(신발 · 장갑). P(t) 가운데, X · U 옆 · 위, w 너비 · up 위 · dn 아래, 두 끝은 막는다 */
function loft(P,X,U,w,up,dn,m,{RN=28,K=44,n=2.6}={}){const pos=[],idx=[];
 for(let r=0;r<=RN;r++){const t=r/RN,c=P(t),ww=w(t),uu=up(t),dd=dn(t);
  for(let i=0;i<K;i++){const a=i/K*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);const x=ww*Math.sign(ca)*Math.abs(ca)**(2/n),y=(sa>0?uu:dd)*Math.sign(sa)*Math.abs(sa)**(2/n);
   pos.push(c.x+X.x*x+U.x*y,c.y+X.y*x+U.y*y,c.z+X.z*x+U.z*y);}}
 for(let r=0;r<RN;r++)for(let i=0;i<K;i++){const a=r*K+i,b=r*K+(i+1)%K;idx.push(a,a+K,b,b,a+K,b+K);}
 const c0=pos.length/3,p0=P(0),p1=P(1);pos.push(p0.x,p0.y,p0.z,p1.x,p1.y,p1.z);
 for(let i=0;i<K;i++){idx.push(c0,(i+1)%K,i,c0+1,RN*K+i,RN*K+(i+1)%K);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return put(new T.Mesh(g,m));}
/* 신발: 윗부분(검정, 발목 깃 · 둥근 앞코) + 흰 밑창 + 발등 끈 */
function shoe(heel,toe,up0,k){const fx=toe.clone().sub(heel);const l=Math.max(fx.length(),0.25*k);fx.normalize();const U=up0.clone().sub(fx.clone().multiplyScalar(up0.dot(fx))).normalize();const X=new T.Vector3().crossVectors(fx,U);
 const s0=heel.clone().add(fx.clone().multiplyScalar(-0.025*k));const P=t=>s0.clone().add(fx.clone().multiplyScalar(t*l)).add(U.clone().multiplyScalar(0.018*k));
 loft(P,X,U,t=>prof([[0,0.012*k],[0.07,0.034*k],[0.28,0.04*k],[0.62,0.049*k],[0.86,0.043*k],[1,0.008*k]],t),t=>prof([[0,0.03*k],[0.08,0.07*k],[0.3,0.08*k],[0.48,0.064*k],[0.78,0.04*k],[0.95,0.026*k],[1,0.01*k]],t),()=>0.004*k,MAT.shoe);
 const Ps=t=>P(t).add(U.clone().multiplyScalar(-0.008*k));
 loft(Ps,X,U,t=>prof([[0,0.014*k],[0.07,0.037*k],[0.28,0.042*k],[0.62,0.052*k],[0.86,0.046*k],[1,0.012*k]],t),()=>0.006*k,()=>0.011*k,MAT.sole,{n:3.2,RN:22});
 for(const t of [0.42,0.5,0.58]){const c=P(t).add(U.clone().multiplyScalar(prof([[0.4,0.066*k],[0.6,0.052*k]],t)-0.002*k));const o=new T.Mesh(new T.BoxGeometry(0.05*k,0.006*k,0.005*k),MAT.sole);o.quaternion.copy(basis(X,fx,U));o.position.copy(c);put(o);}}
/* 발 자세(발끝 자료가 없을 때): 수평 방향 dir, 발목이 올라간 만큼 발끝을 내려 바닥에 둔다(최대 pmax) */
function footPose(an,dir,k,base,pmax){const L=0.25*k,hgt=an.z-base;let ph=0;if(hgt>0.005)ph=Math.min(pmax,Math.asin(Math.min(1,hgt/(0.78*L))));
 const d3=dir.clone().multiplyScalar(Math.cos(ph)).add(ZV.clone().multiplyScalar(-Math.sin(ph))),n=ZV.clone().multiplyScalar(Math.cos(ph)).add(dir.clone().multiplyScalar(Math.sin(ph)));
 const heel=an.clone().sub(d3.clone().multiplyScalar(0.06*k)).sub(n.clone().multiplyScalar(Math.max(0.04,base-0.012)));return [heel,heel.clone().add(d3.clone().multiplyScalar(L)),n];}
/* 몸통 — 사타구니부터 목 밑까지 한 겹. 아래는 골반 틀, 위는 가슴 틀을 따르고 그 사이에서 돌아간다 */
function torso(J,pf,cf,k){const hm=J.rh.clone().add(J.lh).multiplyScalar(.5),shm=J.sh.clone().add(J.gs).multiplyScalar(.5);
 const hw=Math.min(J.rh.distanceTo(J.lh)/2,0.09*k),sw=J.sh.distanceTo(J.gs)/2;
 const crotch=hm.clone().add(pf.ya.clone().multiplyScalar(-0.075*k)).add(pf.fw.clone().multiplyScalar(-0.01*k));
 const neck=shm.clone().add(cf.ya.clone().multiplyScalar(0.075*k));
 const C=[[0,crotch],[0.16,hm],[0.36,hm.clone().lerp(J.td,0.75)],[0.55,J.td.clone().lerp(shm,0.12)],[0.76,J.td.clone().lerp(shm,0.62)],[0.9,shm],[1,neck]];
 const W=[[0,hw+0.04*k],[0.12,hw+0.052*k],[0.24,hw+0.042*k],[0.38,0.132*k],[0.55,0.143*k],[0.74,Math.max(0.15*k,sw-0.01*k)],[0.88,Math.max(0.15*k,sw-0.005*k)],[0.95,sw*0.5],[1,0.058*k]];
 const DF=[[0,0.075*k],[0.14,0.09*k],[0.3,0.093*k],[0.42,0.09*k],[0.58,0.097*k],[0.74,0.1*k],[0.9,0.085*k],[1,0.055*k]];
 const DB=[[0,0.085*k],[0.12,0.102*k],[0.24,0.098*k],[0.4,0.094*k],[0.6,0.1*k],[0.78,0.106*k],[0.92,0.088*k],[1,0.055*k]];
 /* 가운데 선은 매끈한 곡선, 단면은 늘 그 곡선에 수직 — 허리를 숙여도 단면끼리 겹쳐 접히지 않게. 비틀림(골반 → 가슴)은 그대로 섞는다 */
 const sp=new T.CatmullRomCurve3(C.map(x=>x[1]),false,'centripetal'),tk=C.map(x=>x[0]);
 const ring=t=>{let i=1;while(i<tk.length-1&&t>tk[i])i++;const u=Math.min(1,Math.max(0,(i-1+(t-tk[i-1])/(tk[i]-tk[i-1]))/(tk.length-1)));
  const c=sp.getPoint(u),Y=sp.getTangent(u).normalize(),q=new T.Quaternion().copy(pf.q).slerp(cf.q,sm((t-0.2)/0.5));
  const X=new T.Vector3(1,0,0).applyQuaternion(q);X.sub(Y.clone().multiplyScalar(X.dot(Y))).normalize();const Fw=new T.Vector3().crossVectors(Y,X);return {c,X,Y,Fw,q:basis(X,Y,Fw.clone().negate())};};
 const RN=48,K=64,split=16,pos=[[],[]],idx=[[],[]];
 for(let r=0;r<=RN;r++){const t=r/RN,{c,X,Fw}=ring(t);const w=prof(W,t),df=prof(DF,t),db=prof(DB,t),n=t<0.2?2.4:2.8;
  for(const part of [0,1]){if((part===0&&r>split)||(part===1&&r<split))continue;
   for(let i=0;i<K;i++){const a=i/K*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);const x=w*Math.sign(ca)*Math.abs(ca)**(2/n),z=(sa>0?df:db)*Math.sign(sa)*Math.abs(sa)**(2/n);
    const p=c.clone().add(X.clone().multiplyScalar(x)).add(Fw.clone().multiplyScalar(z));pos[part].push(p.x,p.y,p.z);}}}
 for(const part of [0,1]){const rings=part===0?split+1:RN-split+1;for(let r=0;r<rings-1;r++)for(let i=0;i<K;i++){const a=r*K+i,b=r*K+(i+1)%K;idx[part].push(a,a+K,b,b,a+K,b+K);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos[part],3));g.setIndex(idx[part]);g.computeVertexNormals();put(new T.Mesh(g,part===0?MAT.pants:MAT.shirt));}
 /* 사타구니 아래 막기 · 벨트(고리 넷) · 앞판 줄과 단추 · 깃 */
 ell(crotch.clone().add(pf.ya.clone().multiplyScalar(0.04*k)),hw+0.02*k,0.05*k,0.08*k,MAT.pants,pf.q);
 const bt=0.325,BR=ring(bt),beltC=BR.c,bw=prof(W,bt),bdf=prof(DF,bt),bdb=prof(DB,bt);band(beltC,BR.q,bw*1.01,(bdf+bdb)/2*1.02,0.09*k,MAT.belt,0.16);
 const buckle=new T.Mesh(new T.BoxGeometry(0.05*k,0.036*k,0.01*k),MAT.buckle);buckle.quaternion.copy(BR.q);buckle.position.copy(beltC.clone().add(BR.Fw.clone().multiplyScalar(bdf+0.006)));put(buckle);
 for(const sx of [-0.62,0.62]){const lp=beltC.clone().add(BR.X.clone().multiplyScalar(sx*bw)).add(BR.Fw.clone().multiplyScalar(bdf*0.82+0.006));const o=new T.Mesh(new T.BoxGeometry(0.012*k,0.05*k,0.008*k),MAT.pants);o.quaternion.copy(BR.q);o.position.copy(lp);put(o);}
 /* 앞판 줄 · 단추 — 몸통 곡면을 따라 조각조각 */
 const at=t=>{const R=ring(t);return {p:R.c.clone().add(R.Fw.clone().multiplyScalar(prof(DF,t))),X:R.X,Fw:R.Fw};};
 for(let i=0;i<12;i++){const a=at(0.36+0.045*i),b=at(0.36+0.045*(i+1));const d=b.p.clone().sub(a.p),l=d.length();d.normalize();const fw=a.Fw.clone().add(b.Fw).normalize();const x=new T.Vector3().crossVectors(d,fw).normalize();
  const o=new T.Mesh(new T.BoxGeometry(0.02*k,l*1.04,0.006*k),MAT.stripe);o.quaternion.copy(basis(x,d,new T.Vector3().crossVectors(x,d)));o.position.copy(a.p.clone().add(b.p).multiplyScalar(.5).add(fw.clone().multiplyScalar(0.001)));put(o);}
 for(const t of [0.46,0.56,0.66,0.76]){const a=at(t);ell(a.p.clone().add(a.Fw.clone().multiplyScalar(0.004*k)),0.008*k,0.008*k,0.003*k,MAT.button,basis(a.X,new T.Vector3().crossVectors(a.Fw.clone().negate(),a.X),a.Fw.clone().negate()));}
 band(neck.clone().add(cf.ya.clone().multiplyScalar(-0.006*k)),cf.q,0.064*k,0.06*k,0.06*k,MAT.stripe,0.14);
 return {neck,shm,hm,hw,C,W,DF,DB};}
function limb(a,b,r0,r1,m,bulge=0,peak=0.35){const P=[];for(let i=0;i<=20;i++){const t=i/20;let r=r0+(r1-r0)*t;r*=1+bulge*Math.exp(-((t-peak)**2)/0.045);P.push([t,r]);}return lathe(a,b,P,m);}
function ball(p,r,m){return ell(p,r,r,r,m);}
/* 분석 선 도구 */
let LW=0.005,labels=[];
function seg(a,b,m){const d=b.clone().sub(a),h=d.length();if(h<1e-4)return;const o=new T.Mesh(new T.CylinderGeometry(LW,LW,h,8),m);o.position.copy(a.clone().add(b).multiplyScalar(.5));o.quaternion.setFromUnitVectors(UP,d.normalize());put(o);}
function dot(p,m,r=2.2){const o=new T.Mesh(new T.SphereGeometry(LW*r,14,10),m);o.position.copy(p);put(o);}
/* c 에서 u 쪽부터 v 쪽까지 반지름 r 부채꼴 — 선과 옅은 면, 가운데 점을 돌려줌 */
function arc(c,u,v,r,key){u=u.clone().normalize();v=v.clone().normalize();const th=u.angleTo(v);let ax=new T.Vector3().crossVectors(u,v);
 if(ax.lengthSq()<1e-10)return c.clone().add(u.clone().multiplyScalar(r));ax.normalize();const n=Math.max(6,Math.ceil(th*20)),pts=[];
 for(let i=0;i<=n;i++)pts.push(c.clone().add(u.clone().applyAxisAngle(ax,th*i/n).multiplyScalar(r)));
 put(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),n*2,LW*0.8,6),LM[key]));
 const P=[c.x,c.y,c.z];for(const p of pts)P.push(p.x,p.y,p.z);const I=[];for(let i=1;i<=n;i++)I.push(0,i,i+1);
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setIndex(I);put(new T.Mesh(g,FM[key]));
 return c.clone().add(u.clone().applyAxisAngle(ax,th/2).multiplyScalar(r));}
function label(p,name,val,key,off){labels.push({p:off?p.clone().add(off):p.clone(),html:`${name}<b>${Math.round(val)}°</b>`,c:'#'+LC[key].toString(16).padStart(6,'0')});}
function flat(v){const o=v.clone();o.z=0;return o.normalize();}
const deg=r=>r*180/Math.PI;
/* 뼈 도구 */
function bone(a,b,r,jr){const d=b.clone().sub(a).normalize();const a2=a.clone().add(d.clone().multiplyScalar(jr*0.55)),b2=b.clone().sub(d.clone().multiplyScalar(jr*0.55));
 lathe(a2,b2,[[0,r*1.6],[0.05,r*1.45],[0.15,r*0.95],[0.5,r*0.78],[0.85,r*0.95],[0.95,r*1.45],[1,r*1.6]],BM.bone,16);}
let ana=0,anaTarget=0,showAna=true;
function draw(set,f){clear(body);clear(bones);clear(lines);labels=[];
 const J=set.frames[f],k=set.height/1.8;G=body;
 /* 골반 위 방향 — 몸통 축만 따르면 몸을 숙일 때 바지까지 같이 숙여져 엉덩이가 튀어나온다. 허리를 숙이는 몫의 절반쯤은 엉덩관절이 맡으니 몸통 축과 '허벅지 반대쪽'을 섞는다 */
 const hm0=J.rh.clone().add(J.lh).multiplyScalar(.5),tUp=J.td.clone().sub(hm0).normalize(),thUp=J.rh.clone().sub(J.rk).normalize().add(J.lh.clone().sub(J.lk).normalize()).normalize();
 const pf=frame(J.rh.clone().sub(J.lh),tUp.clone().multiplyScalar(0.6).add(thUp.multiplyScalar(0.4)));
 const cf=frame(J.sh.clone().sub(J.gs),J.tp.clone().sub(J.td));
 const TS=torso(J,pf,cf,k),{neck,shm,hm}=TS;
 /* 다리: 허벅지(바지) · 정강이 위(바지, 밑단) · 종아리(양말) · 신발 */
 const feet=[],rub=new T.Vector3(0,set.side,0),pfH=flat(pf.fw),land=new T.Vector3(1,set.side*0.3,0).normalize();
 for(const [hp,kn,an0,he,to,rear] of [[J.rh,J.rk,J.ra,J.rhe,J.rto,true],[J.lh,J.lk,J.la,J.lhe,J.lto,false]]){
  const hsc=Math.min(1,0.1*k/(J.rh.distanceTo(J.lh)/2));const hipUp=hm.clone().add(hp.clone().sub(hm).multiplyScalar(hsc*0.88)).add(pf.ya.clone().multiplyScalar(0.03*k));
  const tdir=kn.clone().sub(hipUp).normalize();lathe(hipUp.clone().sub(tdir.clone().multiplyScalar(0.05*k)),kn,[[0,0.05*k],[0.1,0.085*k],[0.24,0.094*k],[0.45,0.088*k],[0.75,0.071*k],[1,0.059*k]],MAT.pants);ball(kn,0.059*k,MAT.pants);
  let heel,toe,n=ZV,lift=0;
  if(he&&to){/* 발은 발목에 단단히 붙인 한 덩어리 — 자료의 뒤꿈치 · 발끝은 방향(앞뒤 3장면과 고르게)만 쓴다. 자리까지 따르면 발목과 뒤꿈치 사이가 장면마다 6~14cm 로 튀어 신발이 떨어졌다 붙었다. 신발 등은 무릎 쪽 */
   const fr=set.frames,a=Math.max(0,f-3),b=Math.min(fr.length-1,f+3),hk=rear?'rhe':'lhe',tk=rear?'rto':'lto';const d3=new T.Vector3();
   for(let i=a;i<=b;i++)d3.add(fr[i][tk].clone().sub(fr[i][hk]).normalize().multiplyScalar(1-Math.abs(i-f)/4));d3.normalize();
   n=kn.clone().sub(an0);n.sub(d3.clone().multiplyScalar(n.dot(d3))).normalize();
   heel=an0.clone().sub(d3.clone().multiplyScalar(0.045*k)).sub(n.clone().multiplyScalar(0.085*k));toe=heel.clone().add(d3.clone().multiplyScalar(0.25*k));
   /* 땅을 짚은 장면에 자료의 발목이 낮게 잡히면 신발이 바닥에 묻힌다 — 그만큼(최대 5cm) 발목째 올린다 */
   let gz=0,gw=0;for(let i=a;i<=b;i++){const q=1-Math.abs(i-f)/4;gz+=Math.min(fr[i][hk].z,fr[i][tk].z)*q;gw+=q;}lift=Math.min(0.05,Math.max(0,gz/gw-Math.min(heel.z,toe.z)));heel.z+=lift;toe.z+=lift;}
  else{const dir=rear?rub.clone().lerp(pfH,sm((f-set.fp)/(set.br+0.1/set.dt-set.fp))).normalize():rub.clone().lerp(land,sm((f-set.ku)/(set.fp-set.ku))).normalize();
   [heel,toe,n]=footPose(an0,dir,k,set.ankleZ,rear?1.2:0.45);}
  const an=an0.clone();an.z+=lift;
  const mid=kn.clone().lerp(an,0.42);limb(kn,mid,0.06*k,0.057*k,MAT.pants,0.07,0.55);ring(mid,an.clone().sub(kn),0.056*k,0.0055*k,MAT.pants);limb(mid,an,0.054*k,0.035*k,MAT.sock,0.1,0.12);ball(an,0.036*k,MAT.sock);
  shoe(heel,toe,n,k);
  const fx=toe.clone().sub(heel).normalize();feet.push([heel.clone().add(n.clone().multiplyScalar(0.03*k)),heel.clone().add(fx.clone().multiplyScalar(0.23*k)).add(n.clone().multiplyScalar(0.02*k))]);}
 /* 팔: 어깨(소매, 끝단 줄) · 위팔 · 아래팔 · 손 */
 for(const [s,e,w,h,throwing] of [[J.sh,J.el,J.wr,J.ha,true],[J.gs,J.ge,J.gw,J.gh,false]]){
  ell(s,0.053*k,0.056*k,0.053*k,MAT.shirt);const sleeve=s.clone().lerp(e,0.42);limb(s,sleeve,0.053*k,0.049*k,MAT.shirt,0.02,0.3);ring(sleeve,e.clone().sub(s),0.049*k,0.0065*k,MAT.stripe);
  limb(sleeve,e,0.045*k,0.038*k,MAT.skin,0.1,0.25);ball(e,0.038*k,MAT.skin);
  limb(e,w,0.04*k,0.026*k,MAT.skin,0.13,0.22);ball(w,0.026*k,MAT.skin);
  const hd=h.clone().sub(w).normalize();const side=new T.Vector3().crossVectors(hd,e.clone().sub(s)).normalize();const nrm=new T.Vector3().crossVectors(side,hd).normalize();const hq=basis(side,hd,nrm);
  const hc=w.clone().add(hd.clone().multiplyScalar(0.045*k));
  if(throwing){ell(hc,0.031*k,0.048*k,0.019*k,MAT.skin,hq);const bp=hc.clone().add(hd.clone().multiplyScalar(0.04*k)).add(nrm.clone().multiplyScalar(0.012*k));
   const thb=hc.clone().add(side.clone().multiplyScalar(0.03*k)).add(hd.clone().multiplyScalar(0.005*k));limb(thb,thb.clone().add(hd.clone().multiplyScalar(0.03*k)).add(side.clone().multiplyScalar(0.008*k)),0.011*k,0.009*k,MAT.skin);
   ball(bp,0.037*k,MAT.ball);const sq=basis(side,hd,nrm);const sr=new T.Mesh(new T.TorusGeometry(0.0372*k,0.0018*k,6,48),MAT.seam);sr.quaternion.copy(sq);sr.scale.set(1,0.55,1);sr.position.copy(bp);put(sr);}
  else{const gc=hc.clone().add(hd.clone().multiplyScalar(0.02*k));ell(gc,0.06*k,0.112*k,0.04*k,MAT.glove,hq);
   ell(gc.clone().add(side.clone().multiplyScalar(0.05*k)).add(hd.clone().multiplyScalar(-0.012*k)),0.024*k,0.07*k,0.032*k,MAT.glove,hq);
   ell(gc.clone().add(nrm.clone().multiplyScalar(0.022*k)).add(hd.clone().multiplyScalar(0.01*k)),0.048*k,0.09*k,0.02*k,MAT.lace,hq);
   ring(w.clone().add(hd.clone().multiplyScalar(0.008*k)),hd,0.032*k,0.007*k,MAT.glove);}}
 /* 목 · 머리(귀 · 코) */
 const nk=neck.clone().add(cf.ya.clone().multiplyScalar(0.07*k));limb(neck.clone().add(cf.ya.clone().multiplyScalar(-0.03*k)),nk,0.06*k,0.05*k,MAT.skin,-0.06,0.6);
 /* 머리는 목 끝에 붙인다 — 귀 · 코 자료는 방향만 쓰고(앞뒤 장면과 고르게, 목에서 35° 안), 자리는 목에서 정한 거리 */
 let up=cf.ya.clone(),hf=cf.fw.clone();if(J.hup){up=J.hup.clone();const a=up.angleTo(cf.ya),mx=0.6;if(a>mx){const ax=new T.Vector3().crossVectors(cf.ya,up).normalize();up=cf.ya.clone().applyAxisAngle(ax,mx);}if(J.hfw.lengthSq()>0.5)hf=J.hfw.clone();}
 hf.sub(up.clone().multiplyScalar(hf.dot(up)));if(hf.lengthSq()<1e-6)hf=cf.fw.clone();hf.normalize();
 const hc=nk.clone().add(up.clone().multiplyScalar(0.1*k)).add(hf.clone().multiplyScalar(0.012*k));
 const zb=hf.clone().negate();const hx=new T.Vector3().crossVectors(up,zb).normalize();const hq=basis(hx,up,zb);
 limb(neck.clone().add(cf.ya.clone().multiplyScalar(0.02*k)),hc,0.052*k,0.046*k,MAT.skin);ell(hc,0.079*k,0.108*k,0.097*k,MAT.skin,hq);
 ell(hc.clone().add(hf.clone().multiplyScalar(0.094*k)).add(up.clone().multiplyScalar(-0.014*k)),0.011*k,0.019*k,0.015*k,MAT.skin,hq);
 for(const sgn of [1,-1])ell(hc.clone().add(hx.clone().multiplyScalar(sgn*0.077*k)).add(hf.clone().multiplyScalar(-0.008*k)),0.011*k,0.024*k,0.015*k,MAT.skin,hq);
 /* 잰 값 */
 const Tr=shm.clone().sub(hm).normalize();
 let sp=deg(Math.atan2((J.rh.y-J.lh.y),(J.rh.x-J.lh.x))-Math.atan2((J.sh.y-J.gs.y),(J.sh.x-J.gs.x)));while(sp>180)sp-=360;while(sp<-180)sp+=360;
 const kneeF=180-deg(J.lh.clone().sub(J.lk).angleTo(J.la.clone().sub(J.lk)));
 const tilt=deg(Math.atan2(Tr.x,Tr.z));
 const abd=deg(J.el.clone().sub(J.sh).angleTo(Tr.clone().negate()));
 const elbF=180-deg(J.sh.clone().sub(J.el).angleTo(J.wr.clone().sub(J.el)));
 document.getElementById('sep').textContent='골반 · 가슴 방향 차이 '+Math.abs(Math.round(sp))+'°';
 /* 멈췄을 때: 속 뼈와 잰 선 */
 if(ana>0.001||anaTarget>0){
  G=bones;const jr=0.024*k,br=0.013*k;
  for(const p of [J.rh,J.lh,J.rk,J.lk,J.ra,J.la,J.sh,J.gs,J.el,J.ge,J.wr,J.gw])ball(p,jr,BM.joint);
  bone(J.rh,J.rk,br,jr);bone(J.rk,J.ra,br*0.9,jr);bone(J.lh,J.lk,br,jr);bone(J.lk,J.la,br*0.9,jr);
  for(const [a,b] of feet)bone(a,b,br*0.7,jr*0.5);
  bone(J.sh,J.el,br*0.9,jr);bone(J.el,J.wr,br*0.75,jr);bone(J.gs,J.ge,br*0.9,jr);bone(J.ge,J.gw,br*0.75,jr);bone(J.wr,J.ha,br*0.55,jr*0.6);bone(J.gw,J.gh,br*0.55,jr*0.6);
  band(hm.clone().add(pf.ya.clone().multiplyScalar(0.035*k)),pf.q,TS.hw+0.035*k,0.075*k,0.1*k,BM.pelvis,0.09);
  band(curve(TS.C,0.84),cf.q,Math.max(0.15*k,J.sh.distanceTo(J.gs)/2-0.01*k),0.085*k,0.1*k,BM.chest,0.09);
  const base=neck.clone().add(cf.ya.clone().multiplyScalar(-0.035*k));bone(base,J.sh,br*0.75,jr);bone(base,J.gs,br*0.75,jr);
  for(let i=0;i<12;i++){let p,q;if(i<9){const t=0.18+0.72*i/8;p=curve(TS.C,t);q=new T.Quaternion().copy(pf.q).slerp(cf.q,Math.min(1,Math.max(0,(t-0.2)/0.5)));p.add(ZV.clone().applyQuaternion(q).multiplyScalar(0.06*k));}else{q=cf.q;p=neck.clone().lerp(nk,(i-8)/3).add(cf.fw.clone().multiplyScalar(-0.01*k));}ell(p,0.026*k,0.014*k,0.022*k,BM.bone,q);}
  ell(hc,0.07*k,0.088*k,0.08*k,BM.bone,hq);
  G=lines;LW=0.005*k;const hz=new T.Vector3(0,0,1);
  /* 골반 · 어깨 선(실제 자리) */
  const pd=J.rh.clone().sub(J.lh).multiplyScalar(0.5),sd=J.sh.clone().sub(J.gs).multiplyScalar(0.5);
  seg(hm.clone().sub(pd.clone().multiplyScalar(1.6)),hm.clone().add(pd.clone().multiplyScalar(1.6)),LM.pelvis);dot(J.rh,LM.pelvis);dot(J.lh,LM.pelvis);
  seg(shm.clone().sub(sd.clone().multiplyScalar(1.45)),shm.clone().add(sd.clone().multiplyScalar(1.45)),LM.chest);dot(J.sh,LM.chest);dot(J.gs,LM.chest);
  /* 분리: 위에서 본 두 방향을 허리 높이 한 판에 */
  const wc=hm.clone();wc.z=J.td.z;const u=flat(pd),v=flat(sd),rr=0.36*k;
  seg(wc,wc.clone().add(u.clone().multiplyScalar(rr*1.12)),LM.pelvis);seg(wc,wc.clone().add(v.clone().multiplyScalar(rr*1.12)),LM.chest);
  const smid=arc(wc,u,v,rr*0.8,'trunk');label(smid,'상하체 분리',Math.abs(sp),'trunk',smid.clone().sub(wc).normalize().multiplyScalar(0.13*k));
  /* 몸통 기울기: 수직선과 몸통 축 */
  seg(hm,hm.clone().add(Tr.clone().multiplyScalar(shm.distanceTo(hm)*1.3)),LM.trunk);seg(hm,hm.clone().add(hz.clone().multiplyScalar(0.36*k)),LM.ref);
  const tm=arc(hm,hz,Tr,0.22*k,'trunk');label(tm,'몸통 기울기',Math.abs(tilt),'trunk',new T.Vector3(0,0,0.05*k).add(flat(Tr).multiplyScalar(0.12*k)));
  /* 앞무릎 굽힘: 허벅지 연장선과 정강이 */
  const th=J.lk.clone().sub(J.lh).normalize(),sn=J.la.clone().sub(J.lk);seg(J.lk,J.lk.clone().add(th.clone().multiplyScalar(0.2*k)),LM.ref);
  const km=arc(J.lk,th,sn,0.14*k,'knee');label(km,'앞무릎 굽힘',kneeF,'knee',km.clone().sub(J.lk).normalize().multiplyScalar(0.12*k));
  /* 어깨 벌림: 몸통 아래쪽과 위팔 */
  const ua=J.el.clone().sub(J.sh);seg(J.sh,J.sh.clone().sub(Tr.clone().multiplyScalar(0.2*k)),LM.ref);
  const am=arc(J.sh,Tr.clone().negate(),ua,0.15*k,'arm');label(am,'어깨 벌림',abd,'arm',am.clone().sub(J.sh).normalize().multiplyScalar(0.12*k));
  /* 팔꿈치 굽힘: 위팔 연장선과 아래팔 */
  seg(J.el,J.el.clone().add(ua.clone().normalize().multiplyScalar(0.16*k)),LM.ref);
  const em=arc(J.el,ua,J.wr.clone().sub(J.el),0.1*k,'elbow');label(em,'팔꿈치 굽힘',elbF,'elbow',em.clone().sub(J.el).normalize().multiplyScalar(0.11*k));
 }
 G=body;applyAna();
 const near=set.ev.find(([,i])=>Math.abs(i-f)<=Math.max(1,Math.round(0.01/set.dt)));const ev=document.getElementById('ev');if(near){ev.textContent=near[0];ev.classList.add('on');}else ev.classList.remove('on');
 document.getElementById('time').textContent=(f*set.dt).toFixed(3)+'s';document.getElementById('scrub').value=f;}
/* 인형은 비치게(맨 앞 겉면만), 뼈 · 선은 짙게 */
function applyAna(){const a=ana;
 for(const m of Object.values(MAT)){const tr=a>0.004;if(m.transparent!==tr){m.transparent=tr;m.needsUpdate=true;}m.opacity=1-0.78*a;m.depthWrite=!tr;}
 for(const m of Object.values(BM)){const tr=a<0.996;if(m.transparent!==tr){m.transparent=tr;m.needsUpdate=true;}m.opacity=a;}
 for(const m of Object.values(LM))m.opacity=a;for(const m of Object.values(FM))m.opacity=0.2*a;
 document.getElementById('legend').style.opacity=a;}
/* 비칠 때는 네 번 그린다: 바닥 · 뼈(인형은 그림자만) → 인형 깊이만 → 인형 맨 앞 겉면 → 잰 선 */
function render(){if(ana<=0.004){R.shadowMap.autoUpdate=true;R.autoClear=true;R.render(S,C);return;}
 const M=Object.values(MAT);R.shadowMap.autoUpdate=true;R.autoClear=true;lines.visible=false;M.forEach(m=>m.colorWrite=false);R.render(S,C);
 /* 하늘(배경 그림)은 그릴 때마다 다시 칠해져 앞 장면을 덮으므로 첫 번째에만 */
 const bg=S.background;S.background=null;
 R.shadowMap.autoUpdate=false;R.autoClear=false;world.visible=bones.visible=false;S.overrideMaterial=DEPTH;R.render(S,C);S.overrideMaterial=null;
 M.forEach(m=>m.colorWrite=true);R.render(S,C);
 body.visible=false;lines.visible=true;R.render(S,C);
 world.visible=bones.visible=body.visible=true;R.autoClear=true;S.background=bg;}
/* 바닥 · 마운드 · 그림자 */
const shadowPlane=new T.Mesh(new T.PlaneGeometry(12,12),new T.ShadowMaterial({opacity:0.32}));shadowPlane.receiveShadow=true;
function stage(set){clear(world);
 const fr=set.frames;let cx=0,cy=0,cz=0;for(const J of fr){cx+=(J.rh.x+J.lh.x)/2;cy+=(J.rh.y+J.lh.y)/2;cz+=(J.rh.z+J.lh.z)/2;}cx/=fr.length;cy/=fr.length;cz/=fr.length;
 S.background=park?SKY:null;S.fog=park?FOG:null;
 if(park)buildPark(set);
 else{const grid=new T.GridHelper(8,16,0x3c4858,0x2a3442);grid.material.transparent=true;grid.material.opacity=0.55;grid.rotation.x=Math.PI/2;grid.position.set(cx,cy,0.001);world.add(grid);
  shadowPlane.position.set(cx,cy,0.002);world.add(shadowPlane);}
 if(set.ground==='mound'&&set.mound)buildMound(set);
 center.set(cx,cy,cz+0.12);
 L1.position.set(cx+1.6,cy-2.4,4.6);L1.target.position.set(cx,cy,0.6);L3.position.set(cx-2.5,cy+2.5,3.2);L3.target.position.set(cx,cy,1);}
/* 공식 규격 마운드 — 앱의 3D 화면(lib/pitch-3d/v2/pose-rig.ts moundHeightAt)과 같은 꼴 · 같은 자리 · 같은 높이 배율.
   투수판 위 25.4cm, 투수판 앞 15cm 부터 1피트에 1인치 내리막, 지름 5.5m, 꼭대기 폭 1.5m */
const MOUND={top:0.254,flatFront:0.152,flatBack:0.6,flatWidth:1.524,radius:2.743,centerAhead:0.457};
function moundFn(x0,y0,sc){const cx=x0+MOUND.centerAhead,R=MOUND.radius,back=cx-R,half=MOUND.flatWidth/2;
 return (x,y)=>{if(Math.hypot(x-cx,y-y0)>=R)return 0;const d=x-x0;
  const along=d>=MOUND.flatFront?MOUND.top-(d-MOUND.flatFront)/12:d>=-MOUND.flatBack?MOUND.top:MOUND.top*(x-back)/(x0-MOUND.flatBack-back);
  const hh=Math.sqrt(Math.max(0,R*R-(x-cx)**2)),s=Math.abs(y-y0);const across=s<=half?MOUND.top:hh<=half?0:MOUND.top*(hh-s)/(hh-half);
  return sc*Math.max(0,Math.min(along,across));};}
/* 흙 결: 두 겹 값 잡음(0~1) */
function noise(x,y){const h=(i,j)=>{const s=Math.sin(i*127.1+j*311.7)*43758.5453;return s-Math.floor(s);};const f=(x,y)=>{const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,a=h(i,j),b=h(i+1,j),c=h(i,j+1),d=h(i+1,j+1),su=u*u*(3-2*u),sv=v*v*(3-2*v);return a+(b-a)*su+(c-a)*sv+(a-b-c+d)*su*sv;};return 0.6*f(x*9,y*9)+0.4*f(x*31,y*31);}
const MOUND_MAT=new T.MeshStandardMaterial({vertexColors:true,roughness:0.96,side:T.DoubleSide});
function buildMound(set){const h=set.height,m=set.mound,x0=m.x0*h,y0=-m.z0*h,H=moundFn(x0,y0,m.scale),cx=x0+MOUND.centerAhead,R=MOUND.radius;
 const land=set.frames[set.ev[1][1]].la,base=lin(0x8d6a4c),clay=lin(0x7a573c),rim=lin(0x4a3a2e),col=new T.Color();
 const NR=90,NA=180,pos=[],cols=[],idx=[];
 for(let r=0;r<=NR;r++){const rr=R*(r/NR);for(let a=0;a<NA;a++){const t=a/NA*Math.PI*2,x=cx+rr*Math.cos(t),y=y0+rr*Math.sin(t);pos.push(x,y,H(x,y)+0.0015);
  const n=noise(x,y),dl=Math.hypot(x-land.x,y-land.y),dr=Math.hypot(x-(x0-0.08),y-y0);
  col.copy(base).lerp(clay,Math.max(sm(1-dl/0.55),sm(1-dr/0.6))*0.85).lerp(rim,sm((rr-(R-0.4))/0.4)*0.8).multiplyScalar(0.9+0.2*n);cols.push(col.r,col.g,col.b);}}
 for(let r=0;r<NR;r++)for(let a=0;a<NA;a++){const p=r*NA+a,q=r*NA+(a+1)%NA;idx.push(p,p+NA,q,q,p+NA,q+NA);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(cols,3));g.setIndex(idx);g.computeVertexNormals();
 const mm=new T.Mesh(g,MOUND_MAT);mm.receiveShadow=true;world.add(mm);
 /* 투수판: 흰 고무판(61 × 15cm), 꼭대기에서 1cm 위 */
 const top=MOUND.top*m.scale,rub=new T.Mesh(new T.BoxGeometry(0.152,0.61,0.03),mat(0xf4f2ec,0.55));rub.position.set(x0-0.076,y0,top-0.005);rub.receiveShadow=true;rub.castShadow=true;world.add(rub);}
/* 야구장(밤 경기) — 실제 규격: 투수판 앞 모서리에서 홈플레이트 뒤 꼭짓점까지 18.44m, 베이스 사이 27.43m, 내야 흙 반지름 28.96m(투수판에서),
   좌우 펜스 100.6m · 가운데 121.9m. 특정 구장 · 구단 표시는 넣지 않는다. 분석이 묻히지 않게 멀수록 안개로 흐리게 */
let park=true;
const SKY=(()=>{const c=document.createElement('canvas');c.width=4;c.height=256;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,256);
 gr.addColorStop(0,'#060a14');gr.addColorStop(0.55,'#13203a');gr.addColorStop(1,'#2b3c58');g.fillStyle=gr;g.fillRect(0,0,4,256);const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;return t;})();
const FOG=new T.Fog(lin(0x223150).getHex(),45,230);
const PARK_MAT=new T.MeshStandardMaterial({vertexColors:true,roughness:0.95});
/* 관중: 어두운 좌석 위 작은 점(옷 색) — 아래 띠는 흰색(벽 · 난간은 꼭짓점 색만 보이게) */
const CROWD=(()=>{const c=document.createElement('canvas');c.width=1024;c.height=512;const g=c.getContext('2d');g.fillStyle='#1c2738';g.fillRect(0,0,1024,512);
 const pal=['#c9c4b8','#8a2f2f','#2f4f8a','#d0b07a','#3d3d45','#7a6a5a','#e6e2da','#4a6a4a','#9a8a6a','#2a2a30'];let s=7;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
 for(let y=4;y<488;y+=7)for(let x=0;x<1024;x+=5){if((x%128)<6)continue;if(rnd()<0.22)continue;g.fillStyle=pal[Math.floor(rnd()*pal.length)];g.globalAlpha=0.55+0.4*rnd();g.fillRect(x+rnd()*1.5,y+rnd()*2,3,4);}
 g.globalAlpha=1;g.fillStyle='#ffffff';g.fillRect(0,490,1024,22);const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.wrapS=T.RepeatWrapping;t.anisotropy=8;return t;})();
const CHALK=new T.MeshStandardMaterial({color:lin(0xf3f1ea),roughness:0.7});
function parkSpot(set){if(set.mound){const h=set.height;return {x0:set.mound.x0*h,y0:-set.mound.z0*h};}const f0=set.frames[0];return {x0:f0.ra.x-0.1,y0:f0.ra.y};}
function buildPark(set){const {x0,y0}=parkSpot(set),xh=x0+18.44,B=27.43,s2=Math.SQRT1_2;
 const e1=new T.Vector2(-s2,s2),e3=new T.Vector2(-s2,-s2);/* 홈에서 1루(투수 왼쪽 +y) · 3루 쪽 */
 const uv=(x,y)=>{const dx=x-xh,dy=y-y0;return [dx*e1.x+dy*e1.y,dx*e3.x+dy*e3.y];};
 const ang=(x,y)=>Math.atan2(y-y0,-(x-xh));/* 0 = 가운데 펜스 쪽, ±45° = 파울 기둥 */
 const fence=a=>100.6+21.3*Math.max(0,Math.cos(2*a));
 const wallAt=a=>{const b=Math.abs(a),q=Math.PI/4;return b<=q?fence(a):b>=3*q?18.3:Math.min(fence(q),18/Math.sin(b-q));};
 const grass=lin(0x35602f),grass2=lin(0x2f5629),dirt=lin(0x8d6a4c),track=lin(0x6e5640),col=new T.Color();
 const paint=(x,y)=>{const [u,v]=uv(x,y),a=ang(x,y),r=Math.hypot(x-xh,y-y0),rm=Math.hypot(x-(x0-0.076),y-y0),n=noise(x*0.25,y*0.25);
  const fair=u>-0.9&&v>-0.9;
  let d=false;
  if(Math.hypot(x-(xh-0.4),y-y0)<3.96)d=true;/* 홈 둘레 */
  else if(fair&&rm<28.96&&!(u>0.91&&v>0.91&&u<B-0.91&&v<B-0.91))d=true;/* 내야 흙(잔디 네모 밖) */
  else if(fair&&(Math.abs(u)<0.91||Math.abs(v)<0.91)&&Math.max(u,v)<B+0.5)d=true;/* 베이스 길 */
  for(const [bu,bv] of [[B,0],[B,B],[0,B]])if(Math.hypot(u-bu,v-bv)<2.7)d=true;/* 베이스 둘레 */
  if(d){col.copy(dirt);}else if(Math.abs(a)<=Math.PI/4+0.01&&r>fence(a)-4.6)col.copy(track);
  else{/* 잔디 깎은 줄무늬 — 외야는 가운데 쪽 띠, 내야는 바둑판 */const band=Math.floor(r/4.5)%2,chk=(Math.floor(u/3)+Math.floor(v/3))%2;col.copy(fair&&u>0&&v>0&&u<B&&v<B?(chk?grass:grass2):(band?grass:grass2));}
  col.multiplyScalar(0.92+0.16*n);return col;};
 /* 땅: 내야는 촘촘하게(20cm), 바깥은 성기게(1m) */
 const plane=(xa,xb,ya,yb,step,z)=>{const nx=Math.ceil((xb-xa)/step),ny=Math.ceil((yb-ya)/step),pos=[],cols=[],idx=[];
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const x=xa+(xb-xa)*i/nx,y=ya+(yb-ya)*j/ny;pos.push(x,y,z);const c=paint(x,y);cols.push(c.r,c.g,c.b);}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const p=j*(nx+1)+i;idx.push(p,p+1,p+nx+1,p+1,p+nx+2,p+nx+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(cols,3));g.setIndex(idx);g.computeVertexNormals();
  const m=new T.Mesh(g,PARK_MAT);m.receiveShadow=true;world.add(m);};
 plane(xh-140,xh+30,y0-110,y0+110,1.2,-0.004);plane(xh-42,xh+6,y0-24,y0+24,0.2,0);
 /* 흰 선 · 베이스 · 홈플레이트 · 타석 */
 const box=(x,y,w,l,rot,z=0.004,hh=0.008)=>{const o=new T.Mesh(new T.BoxGeometry(w,l,hh),CHALK);o.position.set(x,y,z);o.rotation.z=rot;o.receiveShadow=true;world.add(o);};
 for(const sg of [1,-1]){const a=Math.PI/4*sg,L=fence(Math.PI/4);const dx=-Math.cos(a),dy=Math.sin(a);box(xh+dx*L/2,y0+dy*L/2,0.076,L,Math.atan2(dy,dx)-Math.PI/2);
  /* 파울 기둥 */const pole=new T.Mesh(new T.CylinderGeometry(0.2,0.2,14,12),new T.MeshStandardMaterial({color:lin(0xe8c547),roughness:0.5}));pole.rotation.x=Math.PI/2;pole.position.set(xh+dx*(L+0.5),y0+dy*(L+0.5),7);world.add(pole);
  /* 타석(가로 1.22 · 세로 1.83m, 홈플레이트 옆에서 15cm) */const yc=y0+sg*(0.216+0.152+0.61),xc=xh-0.216;
  for(const o of [-0.61,0.61])box(xc,yc+o,1.83,0.076,0);for(const o of [-0.915,0.915])box(xc+o,yc,0.076,1.296,0);}
 for(const [bu,bv] of [[B,0],[B,B],[0,B]]){const x=xh+e1.x*bu+e3.x*bv,y=y0+e1.y*bu+e3.y*bv;box(x,y,0.381,0.381,Math.PI/4,0.04,0.08);}
 const hp=new T.Shape();hp.moveTo(0,0);hp.lineTo(-0.216,0.216);hp.lineTo(-0.432,0.216);hp.lineTo(-0.432,-0.216);hp.lineTo(-0.216,-0.216);hp.closePath();
 const hm=new T.Mesh(new T.ShapeGeometry(hp),CHALK);hm.position.set(xh,y0,0.006);hm.receiveShadow=true;world.add(hm);
 /* 펜스 · 관중석: 홈을 가운데 둔 둘레를 따라 벽 → 계단식 관중석 */
 const NA=360,ROWS=14,pos=[],cols=[],uvs=[],idx=[],wall=lin(0x1d3a2d),back=lin(0x1a2436),pad=lin(0xd8b43a);
 for(let i=0;i<=NA;i++){const a=-Math.PI+2*Math.PI*i/NA,r0=wallAt(a),dx=-Math.cos(a),dy=Math.sin(a),fair=Math.abs(a)<=Math.PI/4,wh=fair?3:1.2;
  const prof=[[r0,0],[r0,wh-0.12],[r0,wh],[r0+0.4,wh]];for(let k=1;k<=ROWS;k++)prof.push([r0+0.4+k*2.3,wh+k*1.45]);prof.push([r0+0.4+ROWS*2.3+0.5,wh+ROWS*1.45+6]);
  prof.forEach(([r,z],k)=>{pos.push(xh+dx*r,y0+dy*r,z);const crowd=k>=4&&k<prof.length-1;
   if(crowd)col.setRGB(0.7,0.7,0.7);else col.copy(k<2?(fair?wall:back):k===2?pad:back);cols.push(col.r,col.g,col.b);
   uvs.push(i/NA*70,crowd?0.06+0.92*(k-4)/(prof.length-5):0.02);});}
 const P=ROWS+5;for(let i=0;i<NA;i++)for(let k=0;k<P-1;k++){const a=i*P+k,b=(i+1)*P+k;idx.push(a,b,a+1,b,b+1,a+1);}
 const sg=new T.BufferGeometry();sg.setAttribute('position',new T.Float32BufferAttribute(pos,3));sg.setAttribute('color',new T.Float32BufferAttribute(cols,3));sg.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));sg.setIndex(idx);sg.computeVertexNormals();
 world.add(new T.Mesh(sg,new T.MeshStandardMaterial({vertexColors:true,map:CROWD,roughness:0.9,side:T.DoubleSide})));
 /* 조명탑 — 관중석 뒤 높이 */
 const LIT=new T.MeshBasicMaterial({color:0xfff6e0}),POLE=new T.MeshStandardMaterial({color:lin(0x3a4250),roughness:0.6});
 for(const a of [-2.5,-1.6,-0.75,0.75,1.6,2.5]){const r=wallAt(a)+36,x=xh-Math.cos(a)*r,y=y0+Math.sin(a)*r;const p=new T.Mesh(new T.CylinderGeometry(0.5,0.8,48,10),POLE);p.rotation.x=Math.PI/2;p.position.set(x,y,24);world.add(p);
  const panel=new T.Mesh(new T.BoxGeometry(1,9,5),LIT);panel.position.set(x,y,50);panel.rotation.z=Math.atan2(y0-y,xh-x);world.add(panel);}
 /* 발 디딘 땅이 마운드가 아니면(모션 캡처 · 평지) 흙 원과 투수판만 */
 if(!set.mound){const dd=new T.Mesh(new T.CircleGeometry(MOUND.radius,72),new T.MeshStandardMaterial({color:lin(0x8d6a4c),roughness:0.95}));dd.position.set(x0+MOUND.centerAhead,y0,0.003);dd.receiveShadow=true;world.add(dd);
  const rub=new T.Mesh(new T.BoxGeometry(0.152,0.61,0.02),mat(0xf4f2ec,0.55));rub.position.set(x0-0.076,y0,0.01);rub.receiveShadow=true;world.add(rub);}}
const center=new T.Vector3();let yaw=0,pitch=0.12,dist=4.5;
const LBX=document.getElementById('labels');
function cam(){const w=cv.clientWidth,h=cv.clientHeight;R.setSize(w,h,false);C.aspect=w/h;C.updateProjectionMatrix();C.position.set(center.x+dist*Math.cos(pitch)*Math.sin(yaw),center.y-dist*Math.cos(pitch)*Math.cos(yaw),center.z+dist*Math.sin(pitch));C.lookAt(center);render();
 while(LBX.children.length<labels.length){const d=document.createElement('div');d.className='lb';LBX.appendChild(d);}
 const placed=[];[...LBX.children].forEach((d,i)=>{const L=labels[i];if(!L||ana<0.02){d.style.display='none';return;}const v=L.p.clone().project(C);if(v.z>1){d.style.display='none';return;}
  d.style.display='';d.style.setProperty('--c',L.c);d.innerHTML=L.html;d.style.opacity=ana;const bw=d.offsetWidth+6,bh=d.offsetHeight+4;let x=(v.x+1)/2*w,y=(1-v.y)/2*h;
  for(let n=0;n<40&&placed.some(p=>Math.abs(p[0]-x)<(p[2]+bw)/2&&Math.abs(p[1]-y)<(p[3]+bh)/2);n++)y+=n%2?-(n+1)*4:(n+1)*4;
  placed.push([x,y,bw,bh]);d.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%)`;});}
let cur=0,F=0,playing=true,speed=0.25,acc=0,last=0;
const play=document.getElementById('play');
function setPlaying(p){playing=p;play.textContent=p?'일시정지':'재생';}
function choose(i){cur=i;F=0;acc=0;const s=SETS[i];stage(s);document.getElementById('scrub').max=s.frames.length-1;document.getElementById('hud').innerHTML=`<b>${s.label}</b><br>${s.info}`;[...document.querySelectorAll('#pick button')].forEach((b,k)=>b.setAttribute('aria-pressed',k===i));
 const keys=document.getElementById('keys');keys.innerHTML='';s.ev.forEach(([l,fi])=>{const b=document.createElement('button');b.type='button';b.textContent=l;b.onclick=()=>{F=fi;setPlaying(false);draw(s,F);cam();};keys.appendChild(b);});
 draw(s,F);cam();}
SETS.forEach((s,i)=>{const b=document.createElement('button');b.type='button';b.textContent=s.label;b.onclick=()=>choose(i);document.getElementById('pick').appendChild(b);});
[[1,'1×'],[0.25,'¼×'],[0.1,'⅒×']].forEach(([v,l])=>{const b=document.createElement('button');b.type='button';b.textContent=l;b.setAttribute('aria-pressed',v===speed);b.onclick=()=>{speed=v;[...document.getElementById('speeds').children].forEach(c=>c.setAttribute('aria-pressed',c===b));};document.getElementById('speeds').appendChild(b);});
[['옆(3루 쪽)',0,0.12],['비스듬히',-0.6,0.2],['뒤(2루 쪽)',-Math.PI/2,0.18],['앞(포수 쪽)',Math.PI/2,0.15],['위',0,1.35]].forEach(([l,y,p])=>{const b=document.createElement('button');b.type='button';b.textContent=l;b.onclick=()=>{yaw=y;pitch=p;cam();};document.getElementById('views').appendChild(b);});
document.getElementById('legend').innerHTML=[['pelvis','골반'],['chest','어깨'],['trunk','몸통'],['knee','무릎'],['arm','어깨 벌림'],['elbow','팔꿈치']].map(([k,t])=>`<span style="--c:#${LC[k].toString(16).padStart(6,'0')}"><i></i>${t}</span>`).join('');
[['야구장',true],['단색',false]].forEach(([l,v])=>{const b=document.createElement('button');b.type='button';b.textContent=l;b.setAttribute('aria-pressed',v===park);b.onclick=()=>{park=v;[...document.getElementById('bg').children].forEach(x=>x.setAttribute('aria-pressed',x===b));stage(SETS[cur]);draw(SETS[cur],F);cam();};document.getElementById('bg').appendChild(b);});
const anaBtn=document.getElementById('ana');anaBtn.onclick=()=>{showAna=!showAna;anaBtn.setAttribute('aria-pressed',showAna);};
play.onclick=()=>setPlaying(!playing);
document.getElementById('scrub').oninput=e=>{F=+e.target.value;setPlaying(false);draw(SETS[cur],F);cam();};
let drag=null;cv.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY,yaw,pitch];cv.setPointerCapture(e.pointerId);});
cv.addEventListener('pointermove',e=>{if(!drag)return;yaw=drag[2]-(e.clientX-drag[0])*0.009;pitch=Math.max(-0.15,Math.min(1.45,drag[3]+(e.clientY-drag[1])*0.007));cam();});
cv.addEventListener('pointerup',()=>drag=null);
cv.addEventListener('wheel',e=>{e.preventDefault();dist=Math.max(2.2,Math.min(9,dist*(1+Math.sign(e.deltaY)*0.08)));cam();},{passive:false});
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;if(REDUCE)setPlaying(false);
function loop(ts){if(!last)last=ts;const dt=Math.min(0.1,(ts-last)/1000);last=ts;const s=SETS[cur];let moved=false;
 anaTarget=(!playing&&showAna)?1:0;
 if(ana!==anaTarget){ana+=(anaTarget-ana)*Math.min(1,REDUCE?1:dt*7);if(Math.abs(anaTarget-ana)<0.004)ana=anaTarget;moved=true;}
 if(playing){acc+=dt*speed;while(acc>=s.dt){acc-=s.dt;F++;moved=true;if(F>=s.frames.length)F=0;}}
 if(moved){draw(s,F);cam();}requestAnimationFrame(loop);}
addEventListener('resize',cam);choose(0);requestAnimationFrame(loop);
