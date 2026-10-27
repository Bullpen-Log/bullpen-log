import * as THREE from 'three';
import { type Pitcher, type Vec3 } from './physics.ts';
import { sampleDelivery, type DeliveryPose } from './motion.ts';
import {LimbSurface,RingSurface,profile} from './pitcher-surface.ts';

const v=(p:Vec3)=>new THREE.Vector3(p.x,p.y,p.z);
const Y=new THREE.Vector3(0,1,0);
export const PITCHER_MODEL_VERSION='rounded-uniform-2';
function jerseyTexture():THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#203d50';ctx.fillRect(0,0,1024,1024);
  ctx.fillStyle='#14272e';ctx.fillRect(0,982,1024,42);
  ctx.fillStyle='#d9c5a1';ctx.font='italic 700 48px Arial';ctx.textAlign='center';ctx.fillText('SINKER',768,348);
  ctx.font='600 160px Arial';ctx.fillText('17',256,570);
  ctx.strokeStyle='#324d5e';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(768,16);ctx.lineTo(768,980);ctx.stroke();
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
}
function gloveTexture():THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#906140';ctx.fillRect(0,0,512,512);
  ctx.lineWidth=3;ctx.strokeStyle='#69462f';
  for(const x of [78,110,146,178]){ctx.beginPath();ctx.moveTo(x,65);ctx.quadraticCurveTo(x-8,145,x+4,225);ctx.stroke();}
  ctx.fillStyle='#65442d';ctx.beginPath();ctx.ellipse(108,235,32,52,-.4,0,Math.PI*2);ctx.fill();
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
}
function sphere(radius:number,material:THREE.Material,sx=1,sy=1,sz=1) {
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,24,18),material);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;return mesh;
}

/** Sinker sample 3/4 joints driving continuous clothed surfaces. */
export class PitcherRig {
  group=new THREE.Group();
  private shirt=new THREE.MeshStandardMaterial({color:'#203d50',roughness:.92});
  private trim=new THREE.MeshStandardMaterial({color:'#c1a47b',roughness:.8});
  private pants=new THREE.MeshStandardMaterial({color:'#e4dfd1',roughness:1});
  private skin=new THREE.MeshStandardMaterial({color:'#bd8966',roughness:.87});
  private dark=new THREE.MeshStandardMaterial({color:'#14272e',roughness:.9});
  private body:RingSurface;
  private pelvis:RingSurface;
  private neck:THREE.Mesh;
  private head=new THREE.Group();
  private glove=new THREE.Group();
  private hand=new THREE.Group();
  private fingers:THREE.Group[]=[];
  private limbs:{surface:LimbSurface;side:'T'|'G';arm:boolean}[]=[];
  private shoes:{group:THREE.Group;side:'T'|'G'}[]=[];

  constructor() {
    const jersey=new THREE.MeshStandardMaterial({color:'#ffffff',map:jerseyTexture(),roughness:.94});
    this.body=new RingSurface(25,32,jersey);this.group.add(this.body.mesh);
    this.pelvis=new RingSurface(15,32,this.pants);this.group.add(this.pelvis.mesh);
    for(const side of ['T','G'] as const) {
      for(const arm of [true,false]){const surface=new LimbSurface(arm,arm?[this.shirt,this.trim,this.skin]:[this.pants]);this.group.add(surface.surface.mesh);this.limbs.push({surface,side,arm});}
      const shoe=new THREE.Group();shoe.add(sphere(1,this.dark,.061,.048,.145));
      const sole=sphere(1,new THREE.MeshStandardMaterial({color:'#c9c8bb',roughness:1}),.064,.012,.148);sole.position.y=-.041;shoe.add(sole);
      for(let i=0;i<3;i++) {
        const lace=new THREE.Mesh(new THREE.BoxGeometry(.073,.004,.008),this.pants);lace.position.set(0,.045,-.005+i*.025);shoe.add(lace);
      }
      this.group.add(shoe);this.shoes.push({group:shoe,side});
    }
    this.neck=sphere(1,this.skin);this.group.add(this.neck);
    this.head.add(sphere(.105,this.skin,.91,1.15,.98));
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.111,24,16,0,Math.PI*2,0,Math.PI*.56),this.dark);cap.position.y=.035;this.head.add(cap);
    const brimShape=new THREE.Shape();brimShape.moveTo(-.087,.055);brimShape.quadraticCurveTo(-.12,.125,-.073,.167);brimShape.quadraticCurveTo(0,.185,.073,.167);brimShape.quadraticCurveTo(.12,.125,.087,.055);brimShape.quadraticCurveTo(0,.075,-.087,.055);
    const brimGeometry=new THREE.ExtrudeGeometry(brimShape,{depth:.006,bevelEnabled:true,bevelSize:.004,bevelThickness:.003,bevelSegments:3,steps:1,curveSegments:12});
    brimGeometry.rotateX(Math.PI/2);const brim=new THREE.Mesh(brimGeometry,this.dark);brim.position.y=.043;brim.castShadow=true;this.head.add(brim);
    const nose=sphere(.023,this.skin,.7,1,1.1);nose.position.set(0,-.009,.11);this.head.add(nose);
    for(const side of [-1,1]) {
      const ear=sphere(.024,this.skin,.47,1,.7);ear.position.set(side*.108,-.004,0);this.head.add(ear);
      const eye=sphere(.007,this.dark,1,.7,.45);eye.position.set(side*.036,.012,.098);this.head.add(eye);
      const brow=new THREE.Mesh(new THREE.BoxGeometry(.029,.005,.006),this.dark);brow.position.set(side*.035,.026,.098);this.head.add(brow);
    }
    this.group.add(this.head);
    const palm=sphere(.045,this.skin,.82,1.05,.50);palm.position.y=.043;this.hand.add(palm);
    for(let i=0;i<4;i++){
      const root=new THREE.Group();root.position.set((i-1.5)*.018,.065,.003);
      const finger=new THREE.Mesh(new THREE.CapsuleGeometry(.009,.038,5,10),this.skin);finger.position.y=.025;finger.castShadow=true;root.add(finger);
      this.hand.add(root);this.fingers.push(root);
    }
    const thumb=sphere(.016,this.skin,.8,1.9,.9);thumb.position.set(-.034,.055,.018);thumb.rotation.z=.65;this.hand.add(thumb);this.group.add(this.hand);
    const leather=new THREE.MeshStandardMaterial({color:'#ffffff',map:gloveTexture(),roughness:1});
    const mittGeometry=new THREE.SphereGeometry(1,36,24),mittVertices=mittGeometry.getAttribute('position');
    for(let i=0;i<mittVertices.count;i++){
      const x=mittVertices.getX(i),y=mittVertices.getY(i),z=mittVertices.getZ(i),top=THREE.MathUtils.smoothstep(y,.1,.9);
      const thumb=.016*Math.exp(-((x+.7)**2+(y-.1)**2)*10);
      mittVertices.setXYZ(i,x*.105-thumb,y*.122+.012+Math.cos(x*13)*.004*top,z*.057+.008*THREE.MathUtils.smoothstep(y,0,.8));
    }
    mittGeometry.computeVertexNormals();
    const gloveSurface=new THREE.Mesh(mittGeometry,leather);gloveSurface.castShadow=true;this.glove.add(gloveSurface);
    this.group.add(this.glove);
  }

  update(time:number,pitcher:Pitcher,release:Vec3,launchVelocity:Vec3) {
    const pose=sampleDelivery(time,pitcher,release,launchVelocity),p={} as Record<keyof DeliveryPose,THREE.Vector3>;
    for(const key of Object.keys(pose) as (keyof DeliveryPose)[])p[key]=v(pose[key]);
    const hip=p.hipT.clone().add(p.hipG).multiplyScalar(.5),shoulder=p.shoulderT.clone().add(p.shoulderG).multiplyScalar(.5);
    const up=shoulder.clone().sub(hip).normalize(),lateral=p.shoulderG.clone().sub(p.shoulderT).normalize();
    if(pitcher.hand==='L')lateral.negate();
    lateral.addScaledVector(up,-lateral.dot(up)).normalize();
    const forward=new THREE.Vector3().crossVectors(lateral,up).normalize();
    const hipAxis=p.hipG.clone().sub(p.hipT).multiplyScalar(pitcher.hand==='L'?-1:1).normalize();
    const hipWidth=p.hipT.distanceTo(p.hipG)/2,shoulderWidth=p.shoulderT.distanceTo(p.shoulderG)/2;
    this.body.update(t=>{
      const axis=hipAxis.clone().lerp(lateral,THREE.MathUtils.smoothstep(t,0,1));axis.addScaledVector(up,-axis.dot(up)).normalize();
      const width=profile(t,[[0,hipWidth+.034],[.22,hipWidth+.034],[.65,shoulderWidth+.014],[.84,shoulderWidth+.02],[.93,shoulderWidth],[1,.058]]);
      const depth=profile(t,[[0,.115],[.3,.125],[.65,.14],[.84,.125],[.93,.095],[1,.055]]);
      return {center:hip.clone().lerp(shoulder,t*1.1-.01),right:axis,front:new THREE.Vector3().crossVectors(axis,up).normalize(),width,depth};
    });
    this.pelvis.update(t=>({center:hip.clone().addScaledVector(up,THREE.MathUtils.lerp(-.115,.025,t)),right:hipAxis,front:new THREE.Vector3().crossVectors(hipAxis,up).normalize(),width:profile(t,[[0,.025],[.12,.09],[.3,hipWidth+.01],[.6,hipWidth+.03],[.85,hipWidth+.02],[1,hipWidth+.01]]),depth:profile(t,[[0,.02],[.15,.07],[.35,.105],[.6,.115],[1,.105]])}));
    for(const limb of this.limbs){
      // The capture marks the outer shoulder/hip, not a visible end cap. Bury the
      // surface root inside the shirt/trouser yoke while keeping elbow/knee/wrist/ankle.
      const root=p[`${limb.arm?'shoulder':'hip'}${limb.side}`].clone().lerp(limb.arm?shoulder:hip,limb.arm ? .16 : .22);
      if(limb.arm)root.addScaledVector(up,-.018);
      let end=p[`wrist${limb.side}`];
      if(!limb.arm){
        const heel=p[`heel${limb.side}`],toe=p[`toe${limb.side}`],footForward=toe.clone().sub(heel).normalize();
        const footRight=new THREE.Vector3().crossVectors(Y,footForward).normalize(),footUp=new THREE.Vector3().crossVectors(footForward,footRight).normalize();
        end=heel.clone().lerp(toe,.5).addScaledVector(footUp,.035);
      }
      limb.surface.update(root,p[`${limb.arm?'elbow':'knee'}${limb.side}`],end,forward);
    }
    const headForward=p.headFront.clone().sub(p.headBack).normalize(),headRight=new THREE.Vector3().crossVectors(Y,headForward).normalize(),headUp=new THREE.Vector3().crossVectors(headForward,headRight).normalize();
    this.head.position.copy(p.head).addScaledVector(headUp,-.035);this.head.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(headRight,headUp,headForward));
    const neckBase=shoulder.clone().addScaledVector(up,.045),neckTop=this.head.position.clone().addScaledVector(headUp,-.09);
    this.neck.position.copy(neckBase).lerp(neckTop,.5);this.neck.scale.set(.043,neckBase.distanceTo(neckTop)/2+.025,.043);this.neck.quaternion.setFromUnitVectors(Y,neckTop.sub(neckBase).normalize());
    this.hand.position.copy(p.wristT);this.hand.quaternion.setFromUnitVectors(Y,p.handT.clone().sub(p.wristT).normalize());
    this.glove.position.copy(p.wristG);this.glove.quaternion.setFromUnitVectors(Y,p.wristG.clone().sub(p.elbowG).normalize());
    this.hand.scale.x=pitcher.hand==='L'?-1:1;this.glove.scale.x=pitcher.hand==='L'?1:-1;
    const opening=THREE.MathUtils.smoothstep(time,-.028,.018);
    this.fingers.forEach((finger,i)=>{finger.rotation.x=.78*(1-opening)-.12*opening;finger.rotation.z=(i-1.5)*.045*opening;});
    for(const shoe of this.shoes) {
      const heel=p[`heel${shoe.side}`],toe=p[`toe${shoe.side}`],forward=toe.clone().sub(heel).normalize();
      const right=new THREE.Vector3().crossVectors(Y,forward).normalize(),up=new THREE.Vector3().crossVectors(forward,right).normalize();
      shoe.group.position.copy(heel).lerp(toe,.5).addScaledVector(up,.018);
      shoe.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
    }
    this.trim.color.set(pitcher.color);
    return pose;
  }
}
