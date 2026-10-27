import * as THREE from 'three';
import {PLATE_Z} from './physics.ts';
const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);

/** Navy evening sky; keep both the horizon and clouds below the white ball's luminance. */
export function createSky(){
  const sky=new THREE.Mesh(new THREE.BoxGeometry(1600,1600,1600),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,toneMapped:false,
    uniforms:{
      horizon:{value:new THREE.Color('#273a58')},zenith:{value:new THREE.Color('#101a34')},
      cloudShadow:{value:new THREE.Color('#29364e')},cloudLight:{value:new THREE.Color('#43516b')},
    },
    vertexShader:`varying vec3 skyWorld;void main(){vec4 w=modelMatrix*vec4(position,1.0);skyWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform vec3 horizon;uniform vec3 zenith;uniform vec3 cloudShadow;uniform vec3 cloudLight;varying vec3 skyWorld;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float n=0.0,a=0.53;mat2 r=mat2(1.63,1.17,-1.17,1.63);for(int i=0;i<5;i++){n+=a*noise(p);p=r*p+vec2(7.3,2.7);a*=0.48;}return n;}
      void main(){
        vec3 ray=normalize(skyWorld-cameraPosition);float h=max(0.0,ray.y);
        vec3 color=mix(horizon,zenith,pow(smoothstep(0.0,0.72,h),0.65));
        vec2 uv=ray.xz/max(0.045,h)*0.66+vec2(3.2,9.7);
        float broad=fbm(uv*0.43),detail=fbm(uv*2.1);
        float density=broad*0.78+detail*0.22;
        float mask=smoothstep(0.515,0.66,density)*smoothstep(0.025,0.13,h);
        float light=fbm(uv*0.43+vec2(-0.16,0.12))-broad;
        vec3 cloud=mix(cloudShadow,cloudLight,clamp(0.68+light*3.0,0.0,1.0));
        color=mix(color,cloud,mask*0.38);
        gl_FragColor=vec4(color,1.0);
#include <colorspace_fragment>
      }`,
  }));sky.renderOrder=-10;return sky;
}

function paddingTexture(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d')!,gradient=ctx.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,'#46715b');gradient.addColorStop(.2,'#3d6651');gradient.addColorStop(.85,'#355d49');gradient.addColorStop(1,'#2c4e3d');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
  ctx.fillStyle='#233e3550';ctx.fillRect(0,0,3,256);ctx.fillStyle='#a0b89a17';ctx.fillRect(4,0,2,256);
  for(let i=0;i<1200;i++){const x=(i*73)%256,y=(i*137)%256;ctx.fillStyle=i%2?'#ffffff04':'#00000004';ctx.fillRect(x,y,1,2);}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=THREE.RepeatWrapping;map.anisotropy=4;return map;
}

// Dimensions are in metres from home plate, so painted distances match the wall.
const FIELD_START=-1.08,FIELD_END=1.08;
function fieldRadius(a:number){return 122-22*Math.pow(Math.min(1,Math.abs(a)/(Math.PI/4)),1.7);}
function fieldPoint(a:number,y:number,offset=0){const r=fieldRadius(a)+offset;return v(Math.sin(a)*r,y,PLATE_Z-Math.cos(a)*r);}

function curvedBand(start:number,end:number,near:number,far:number,low:number,high:number,material:THREE.Material){
  const n=Math.ceil((end-start)*70),positions:number[]=[],indices:number[]=[];
  // Two radial edges; either a horizontal terrace or a vertical fascia.
  for(let i=0;i<=n;i++){const a=start+(end-start)*i/n;positions.push(...fieldPoint(a,low,near).toArray(),...fieldPoint(a,high,far).toArray());}
  for(let i=0;i<n;i++){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return new THREE.Mesh(geometry,material);
}

function paintedLabel(text:string,subtext:string,width:number,height:number,color='#f2efdc'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.textAlign='center';
  ctx.font='800 310px Arial';ctx.fillText(text,512,330);ctx.font='500 70px Arial';ctx.fillText(subtext,512,445);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map,transparent:true,alphaTest:.02,depthWrite:false,roughness:1}));
}

function fenceBrand(text:string){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#254b3e';ctx.fillRect(0,0,1024,256);
  ctx.fillStyle='#e2e4d3';ctx.textAlign='center';ctx.font='800 108px Arial';ctx.fillText(text,512,133);
  ctx.fillStyle='#afc3b1';ctx.font='28px Arial';ctx.fillText('BASEBALL CLUB',512,201);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  return new THREE.Mesh(new THREE.PlaneGeometry(10,2),new THREE.MeshStandardMaterial({map,roughness:1}));
}
function faceField(mesh:THREE.Object3D,a:number){
  const tangent=fieldPoint(a+.001,0).sub(fieldPoint(a-.001,0)).normalize();
  mesh.rotation.y=Math.atan2(-tangent.z,tangent.x);
}

function floodlightTower(a:number){
  const group=new THREE.Group();group.name='stadium-floodlight';
  const base=fieldPoint(a,0,4),metal=new THREE.MeshStandardMaterial({color:'#677985',roughness:.7});
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.14,.25,25,10),metal);
  mast.position.copy(base);mast.position.y=12.5;group.add(mast);
  const bank=new THREE.Group();bank.position.copy(base);bank.position.y=25;bank.lookAt(0,1,2);
  bank.add(new THREE.Mesh(new THREE.BoxGeometry(4.6,1.55,.2),new THREE.MeshStandardMaterial({color:'#30414b',roughness:.85})));
  const lampMaterial=new THREE.MeshBasicMaterial({color:'#fffbed',toneMapped:false});
  const lampGeometry=new THREE.CircleGeometry(.17,12);
  for(let row=0;row<2;row++)for(let column=0;column<8;column++){
    const lamp=new THREE.Mesh(lampGeometry,lampMaterial);lamp.position.set((column-3.5)*.53,(row-.5)*.61,.115);bank.add(lamp);
  }
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d')!,glow=ctx.createRadialGradient(64,64,0,64,64,64);
  glow.addColorStop(0,'#e9f4ff70');glow.addColorStop(.2,'#d1e6ff30');glow.addColorStop(1,'#b5d7ff00');
  ctx.fillStyle=glow;ctx.fillRect(0,0,128,128);
  const glowMap=new THREE.CanvasTexture(canvas);glowMap.colorSpace=THREE.SRGBColorSpace;
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,transparent:true,opacity:.45,depthWrite:false,toneMapped:false}));
  halo.position.z=.15;halo.scale.set(7,5,1);bank.add(halo);group.add(bank);return group;
}

/** Early-prototype padded fence with simple club signs and painted distances. */
export function createOutfield(){
  const group=new THREE.Group();group.name='continuous-outfield-fence';
  const height=3.2,steps=200;
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=0;i<=steps;i++){const a=FIELD_START+(FIELD_END-FIELD_START)*i/steps;for(const y of [0,height]){positions.push(...fieldPoint(a,y).toArray());uv.push(i/steps*(FIELD_END-FIELD_START)*115/1.85,y/height);}}
  for(let i=0;i<steps;i++){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const wall=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:paddingTexture(),color:'#ffffff',roughness:.98,side:THREE.DoubleSide}));wall.name='outfield-padding';group.add(wall);
  const rimPoints=Array.from({length:steps+1},(_,i)=>fieldPoint(FIELD_START+(FIELD_END-FIELD_START)*i/steps,height+.03));
  const rim=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPoints),steps,.075,6,false),new THREE.MeshStandardMaterial({color:'#c3ac68',roughness:.85}));group.add(rim);
  group.add(curvedBand(FIELD_START,FIELD_END,-3.3,-.05,.014,.014,new THREE.MeshStandardMaterial({color:'#aa8c6c',roughness:1,side:THREE.DoubleSide})));
  for(const a of [-Math.PI/4,-.36,0,.36,Math.PI/4]){
    const distance=paintedLabel(String(Math.round(fieldRadius(a))),'m',4.8,2.55);
    distance.name='distance-'+Math.round(fieldRadius(a));distance.position.copy(fieldPoint(a,1.65,-.09));faceField(distance,a);group.add(distance);
  }
  for(const a of [-Math.PI/4,Math.PI/4]){
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,12,8),new THREE.MeshStandardMaterial({color:'#d8ba60',roughness:.8}));pole.position.copy(fieldPoint(a,6));group.add(pole);
  }
  for(const [i,a] of [-.96,-.54,-.17,.17,.54,.96].entries()){
    const sign=fenceBrand(i%2?'PRACTICE':'SINKER');sign.position.copy(fieldPoint(a,1.65,-.18));faceField(sign,a);group.add(sign);
  }
  group.add(floodlightTower(-.47),floodlightTower(.47));
  return group;
}
