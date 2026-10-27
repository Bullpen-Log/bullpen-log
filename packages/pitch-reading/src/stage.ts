import type {DisplayCalibration} from './display-calibration.ts';
import * as THREE from 'three';
import {phoneBallScale} from './phone-presentation.ts';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PitcherRig } from './pitcher.ts';
import {createSky,createOutfield} from './environment.ts';
import { at, trackingAt, trackingEnd, BALL_RADIUS, PLATE_Z, PLATE_FRONT_Z, type Pitch, type Pitcher, type Vec3 } from './physics.ts';
import {assessZone,STRIKE_ZONE,MIDDLE_Z,END_BOTTOM} from './strike-zone.ts';
import {HOME_PLATE,plateOutline} from './batter-reference.ts';
import { battingCamera, moundHeight } from './world.ts';

export type ViewName = 'batter' | 'tracking' | 'side' | 'top' | 'delivery-front' | 'delivery-side' | 'delivery-back';
export type StageFrame = {
  time: number; deliveryTime: number; ballVisible: boolean; held: boolean; reveal: boolean; ballScale: number;
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function line(points: THREE.Vector3[], color: THREE.ColorRepresentation, opacity = 1): THREE.Line {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}
function groundTexture(kind:'grass'|'dirt'):THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=kind==='grass'?'#496d49':'#ae8b63';ctx.fillRect(0,0,512,512);
  let seed=1198;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
  for(let i=0;i<24000;i++) {
    const light=random()>.5,x=random()*512,y=random()*512;
    ctx.fillStyle=kind==='grass'?(light?'#71906333':'#163f272e'):(light?'#e7c49a3b':'#64482d30');
    ctx.fillRect(x,y,kind==='grass'?.6+random()*.6:1+random()*1.4,kind==='grass'?2+random()*6:1+random()*1.3);
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;return map;
}

export class PitchStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(39, 1, 0.04, 2000);
  private rig = new PitcherRig();
  private ball = new THREE.Group();
  private ballSeams = new THREE.Group();
  private seamMaterial=new THREE.LineBasicMaterial({color:'#b66657',transparent:true,opacity:0,depthWrite:false});
  private trail = new THREE.Group();
  private zone = new THREE.Group();
  private landing: THREE.Mesh;
  private shadow: THREE.Mesh;
  private pitcher!: Pitcher;
  private pitch!: Pitch;
  private view: ViewName = 'batter';
  private eye: 'R' | 'L' = 'R';
  private observer: ResizeObserver;
  private display:DisplayCalibration|null=null;
  private phonePresentation=false;
  private lastFrame: StageFrame | null = null;
  private disposed = false;
  private markerCameraPosition=new THREE.Vector3();
  private controls: OrbitControls;

  constructor(private host: HTMLElement, onFailure: (message: string) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Match native 2x displays instead of rendering at 1.8x and resampling every
    // moving edge in the compositor. Keep the cap for high-DPR phone fill rate.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .95;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '가상 투수와 공의 3D 시뮬레이션');
    this.renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault(); onFailure('3D 화면 연결이 끊겼습니다. 새로고침 후 다시 시작해 주세요.');
    });
    this.host.append(this.renderer.domElement);
    this.scene.add(createSky());
    this.scene.fog=new THREE.Fog('#1e3048',140,390);
    this.scene.add(new THREE.HemisphereLight('#b6c9e4','#65775a',1.05));
    // Neutral floodlight banks keep the field bright independently of the dark sky.
    const key = new THREE.DirectionalLight('#f0f5ff',3.4); key.position.set(-27,26,25);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=7;key.shadow.camera.bottom=-5;
    key.shadow.camera.near=.1;key.shadow.camera.far=80;
    key.shadow.normalBias=.008;key.shadow.radius=3; this.scene.add(key);
    const fill = new THREE.DirectionalLight('#e2eeff',2.3); fill.position.set(29,24,-20);this.scene.add(fill);
    const moundLight=new THREE.SpotLight('#fff6e7',850,90,.86,.72,2);
    moundLight.position.set(20,24,9);moundLight.target.position.set(0,0,1);
    this.scene.add(moundLight,moundLight.target);
    this.buildField();
    this.scene.add(this.camera);
    this.scene.add(this.rig.group);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 24), new THREE.MeshBasicMaterial({ color: '#f7f8f4' }));
    this.ball.add(sphere);
    this.ball.add(this.ballSeams);
    for (const offset of [-0.7, 0.7]) {
      const seam: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const theta = i / 64 * Math.PI * 2;
        const phi = offset + Math.sin(theta * 2) * 0.18;
        seam.push(V(Math.cos(theta) * Math.cos(phi), Math.sin(phi), Math.sin(theta) * Math.cos(phi)).multiplyScalar(BALL_RADIUS * 1.012));
      }
      this.ballSeams.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(seam),this.seamMaterial));
    }
    this.ball.visible = false; this.scene.add(this.ball, this.trail, this.zone);
    this.landing = new THREE.Mesh(new THREE.RingGeometry(BALL_RADIUS*1.35, BALL_RADIUS*1.55, 48),
      new THREE.MeshBasicMaterial({ color: '#f4bb75', side: THREE.DoubleSide }));
    this.scene.add(this.landing); this.landing.visible = false;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24),
      new THREE.MeshBasicMaterial({ color: '#10231e', opacity: 0.2, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.03; this.scene.add(this.shadow); this.shadow.visible = false;
    const {halfWidth:x,bottom,top}=STRIKE_ZONE;
    const rectangle=(z:number,low:number,color:string,opacity:number)=>this.zone.add(line([
      V(-x,low,z),V(x,low,z),V(x,top,z),V(-x,top,z),V(-x,low,z)
    ],color,opacity));
    rectangle(MIDDLE_Z,bottom,'#d4e6e1',.95);
    rectangle(PLATE_Z,END_BOTTOM,'#8fbfc8',.42);
    for(let i=1;i<3;i++){
      this.zone.add(line([V(-x+2*x*i/3,bottom,MIDDLE_Z),V(-x+2*x*i/3,top,MIDDLE_Z)],'#d4e6e1',.36));
      this.zone.add(line([V(-x,bottom+(top-bottom)*i/3,MIDDLE_Z),V(x,bottom+(top-bottom)*i/3,MIDDLE_Z)],'#d4e6e1',.36));
    }
    for(const side of [-1,1]){
      this.zone.add(line([V(side*x,bottom,MIDDLE_Z),V(side*x,END_BOTTOM,PLATE_Z)],'#8fbfc8',.25));
      this.zone.add(line([V(side*x,top,MIDDLE_Z),V(side*x,top,PLATE_Z)],'#8fbfc8',.25));
    }
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.host);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enabled=false;this.controls.enablePan=false;this.controls.minDistance=2.7;this.controls.maxDistance=12;
    this.controls.minPolarAngle=.12;this.controls.maxPolarAngle=Math.PI*.88;
    this.controls.addEventListener('change',()=>{if(!this.disposed)this.renderer.render(this.scene,this.camera);});
    this.resize();
  }

  private buildField() {
    const grass=groundTexture('grass');grass.repeat.set(60,60);
    const stripeGrass=grass.clone();stripeGrass.repeat.set(50,1.85);
    const dirt=groundTexture('dirt');dirt.repeat.set(3.2,3.2);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), new THREE.MeshStandardMaterial({ color: '#ffffff',map:grass, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.z = -30; ground.receiveShadow = true; this.scene.add(ground);
    for (let i = 0; i < 23; i++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(240, 5.5), new THREE.MeshStandardMaterial({ color: i % 2 ? '#ffffff' : '#d8e7d2',map:stripeGrass, roughness: 1 }));
      stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, 0.004, 20 - i * 5.5); stripe.receiveShadow = true; this.scene.add(stripe);
    }
    const dirtMaterial = new THREE.MeshStandardMaterial({ color: '#e3d1b8',map:dirt, roughness: 1 });
    const dirtCircle = (radius: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), dirtMaterial);
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, 0.012, z); mesh.receiveShadow = true; this.scene.add(mesh);
    };
    dirtCircle(2.6, 0); dirtCircle(3.1, PLATE_Z);
    const bases=[V(0,.015,PLATE_Z),V(19.396,.015,PLATE_Z-19.396),V(0,.015,PLATE_Z-38.792),V(-19.396,.015,PLATE_Z-19.396)];
    for(let i=0;i<4;i++) {
      const a=bases[i],b=bases[(i+1)%4],side=b.clone().sub(a).cross(V(0,1,0)).normalize().multiplyScalar(.8);
      const vertices=[a.clone().add(side),a.clone().sub(side),b.clone().add(side),b.clone().sub(side)];
      const geometry=new THREE.BufferGeometry().setFromPoints(vertices);geometry.setIndex([0,2,1,1,2,3]);geometry.computeVertexNormals();
      const path=new THREE.Mesh(geometry,dirtMaterial);path.receiveShadow=true;this.scene.add(path);
      if(i>0){const base=new THREE.Mesh(new THREE.BoxGeometry(.38,.045,.38),new THREE.MeshStandardMaterial({color:'#e9e4ce',roughness:1}));base.position.copy(a).add(V(0,.035,0));base.rotation.y=Math.PI/4;this.scene.add(base);}
    }
    const moundGeometry=new THREE.RingGeometry(0,2.75,80,24),moundVertices=moundGeometry.getAttribute('position');
    for(let i=0;i<moundVertices.count;i++){const x=moundVertices.getX(i),z=-moundVertices.getY(i);moundVertices.setXYZ(i,x,moundHeight(x,z)+.006,z);}
    moundGeometry.computeVertexNormals();
    const mound=new THREE.Mesh(moundGeometry,dirtMaterial);mound.receiveShadow=true;this.scene.add(mound);
    const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.025, 0.15), new THREE.MeshStandardMaterial({ color: '#e9e3d3' }));
    rubber.position.set(0,.2725,-.075); this.scene.add(rubber);
    // The pointed rear apex is at PLATE_Z; the broad front edge faces the mound.
    const plateShape = new THREE.Shape();
    plateOutline(PLATE_FRONT_Z,PLATE_Z).forEach(([x,z],i)=>{if(i===0)plateShape.moveTo(x,PLATE_Z-z);else plateShape.lineTo(x,PLATE_Z-z);});
    plateShape.closePath();
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape), new THREE.MeshStandardMaterial({ color: '#e8e3d2', side: THREE.DoubleSide }));
    plate.rotation.x = -Math.PI / 2; plate.position.set(0, 0.025, PLATE_Z); this.scene.add(plate);
    for (const side of [-1, 1]) {
      const inner=HOME_PLATE.width/2+.1524,outer=inner+1.2192,back=PLATE_Z-.2159+.9144,front=back-1.8288;
      const vertices=[V(side*inner,.03,back),V(side*outer,.03,back),V(side*outer,.03,front),V(side*inner,.03,front),V(side*inner,.03,back)];
      this.scene.add(line(vertices, '#d5d8c3', 0.7));
      this.scene.add(line([V(0,.024,PLATE_Z),V(side*60,.024,PLATE_Z-60)], '#d9ddc8', 0.7));
      const lightPole = new THREE.Mesh(new THREE.CylinderGeometry(.1,.17,19,8), new THREE.MeshStandardMaterial({ color: '#6d8781' }));
      lightPole.position.set(side*29,9.5,-20); this.scene.add(lightPole);
      const light = new THREE.Mesh(new THREE.BoxGeometry(3.5,1.2,.25),new THREE.MeshStandardMaterial({ color:'#f2f6ff',emissive:'#dfeaff',emissiveIntensity:2,roughness:.6 }));
      light.position.set(side*29,19,-20); light.rotation.y = -side*.18; this.scene.add(light);
    }
    this.scene.add(createOutfield());
  }


  setPitch(pitcher: Pitcher, pitch: Pitch) {
    this.pitcher = pitcher; this.pitch = pitch;
    for (const child of [...this.trail.children]) {
      this.trail.remove(child);
      const mesh = child as THREE.Line; mesh.geometry?.dispose();
      if (mesh.material) (mesh.material as THREE.Material).dispose();
    }
    const points = Array.from({length:181},(_,i) => { const p = trackingAt(pitch,trackingEnd(pitch)*i/180); return V(p.x,p.y,p.z); });
    const color=assessZone(pitch).call==='strike'?'#efb66e':'#80c7e9';
    this.trail.add(line(points,color,0.9));
    (this.landing.material as THREE.MeshBasicMaterial).color.set(color);
    for(let i=1;i<6;i++) {
      const p=at(pitch,pitch.duration*i/6);
      const dot=new THREE.Mesh(new THREE.SphereGeometry(.025,8,6),new THREE.MeshBasicMaterial({color:'#e4c08c',transparent:true,opacity:.65}));
      dot.position.set(p.x,p.y,p.z); this.trail.add(dot);
    }
    const point=assessZone(pitch).point;this.landing.position.set(point.x,point.y,point.z);
  }

  configureDisplay(display:DisplayCalibration,phone=false){this.display=display;this.phonePresentation=phone;this.resize();}
  projection(){return {verticalFov:this.camera.fov,horizontalFov:2*Math.atan(Math.tan(this.camera.fov*Math.PI/360)*this.camera.aspect)*180/Math.PI,eyeHeight:this.camera.position.y,plateDistance:Math.abs(this.camera.position.x),plateDepth:this.camera.position.z-PLATE_Z};}
  syncViewport(){this.resize();}
  setView(view: ViewName, eye: 'R' | 'L') {
    this.view=view;this.eye=eye;this.positionCamera();
    if(this.lastFrame)this.draw(this.lastFrame);
  }
  /** Fixed eye point: end observation when the complete ball leaves the display window. */
  observationLimit(maxTime:number,scale:number){
    this.camera.updateMatrixWorld();
    const visible=(time:number)=>{
      const p=at(this.pitch,time),local=V(p.x,p.y,p.z).applyMatrix4(this.camera.matrixWorldInverse);
      const projected=V(p.x,p.y,p.z).project(this.camera),radius=BALL_RADIUS*scale/(-local.z*Math.tan(this.camera.fov*Math.PI/360));
      return local.z<0&&Math.abs(projected.x)+radius/this.camera.aspect<=1&&Math.abs(projected.y)+radius<=1;
    };
    for(let time=0;time<=maxTime;time+=.0025)if(!visible(time)){
      let lo=Math.max(0,time-.0025),hi=time;for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(visible(mid))lo=mid;else hi=mid;}return lo;
    }
    return Infinity;
  }
  private positionCamera() {
    this.camera.up.set(0,1,0);
    if(this.controls)this.controls.enabled=this.view.startsWith('delivery-');
    if(this.view==='batter') {
      const config=battingCamera(this.eye,this.camera.aspect,PLATE_Z,this.display?{width:this.host.clientWidth,calibration:this.display,phone:this.phonePresentation}:undefined);
      this.camera.fov=config.verticalFov;
      this.camera.position.set(config.position.x,config.position.y,config.position.z);
      this.camera.lookAt(config.target.x,config.target.y,config.target.z);
    } else if(this.view==='tracking'){
      // Look toward home from the pitcher side, keeping the zone large in the frame.
      this.camera.fov=32;this.camera.position.set(-.45,1.4,PLATE_FRONT_Z-3.8);this.camera.lookAt(0,.35,PLATE_FRONT_Z+.2);
    } else if(this.view==='side') {
      this.camera.fov=47;this.camera.position.set(25,6.5,PLATE_Z/2);
      this.camera.lookAt(0,1.1,PLATE_Z/2);
    } else if(this.view==='top') {
      this.camera.fov=47;this.camera.up.set(0,0,-1);
      this.camera.position.set(0,27,PLATE_Z/2);this.camera.lookAt(0,0,PLATE_Z/2);
    } else {
      this.camera.fov=34;
      if(this.view==='delivery-front')this.camera.position.set(2.9,2.05,6.3);
      else if(this.view==='delivery-side')this.camera.position.set(6.2,1.95,.9);
      else this.camera.position.set(-2.4,2.15,-4.9);
      this.camera.lookAt(-.15,1.02,.8);
      this.controls?.target.set(-.15,1.02,.8);this.controls?.update();
    }
    this.camera.updateProjectionMatrix();
  }
  private resize() {
    if(this.disposed)return;
    const width=this.host.clientWidth,height=this.host.clientHeight;
    if(!width||!height)return;
    this.renderer.setSize(width,height,false);this.camera.aspect=width/height;
    this.positionCamera();
    if(this.lastFrame)this.draw(this.lastFrame);
  }
  draw(frame: StageFrame) {
    if(this.disposed||!this.pitch)return;
    this.lastFrame=frame;
    const pose=this.rig.update(frame.deliveryTime,this.pitcher,this.pitch.release,this.pitch.velocity);
    const held=frame.held&&frame.deliveryTime<0;
    const p=held?pose.grip:trackingAt(this.pitch,frame.time);
    this.ball.position.set(p.x,p.y,p.z);this.ball.scale.setScalar(frame.ballScale);
    // Rotate only the decorative stitching, never the tessellated sphere silhouette.
    this.ballSeams.rotation.set(frame.time*18,frame.time*9,0);
    this.ball.visible=held||frame.ballVisible;this.trail.visible=frame.reveal;this.zone.visible=frame.reveal;
    const path=this.trail.children[0] as THREE.Line|undefined;
    this.camera.updateMatrixWorld();
    // A fixed one-pixel seam overwhelmed a distant 6–10px ball. Fade stitching by
    // projected size, while keeping the physical sphere and perspective untouched.
    const ballDepth=-this.markerCameraPosition.copy(this.ball.position).applyMatrix4(this.camera.matrixWorldInverse).z;
    let diameter=BALL_RADIUS*frame.ballScale*this.host.clientHeight/(Math.max(.001,ballDepth)*Math.tan(this.camera.fov*Math.PI/360));
    if(this.phonePresentation&&this.view==='batter'&&ballDepth>BALL_RADIUS){
      const scale=phoneBallScale(frame.ballScale,diameter);
      this.ball.scale.setScalar(scale);diameter*=scale/frame.ballScale;
    }
    this.seamMaterial.opacity=.8*THREE.MathUtils.smoothstep(diameter,12,24);
    // Slow decorative stitching is not a measured spin cue. From the batter's
    // eyes an in-flight ball stays white instead of flickering between red arcs.
    this.ballSeams.visible=(this.view!=='batter'||held)&&ballDepth>BALL_RADIUS&&this.seamMaterial.opacity>.005;
    this.trail.children.slice(1).forEach((dot,i)=>{
      const depth=-this.markerCameraPosition.copy(dot.position).applyMatrix4(this.camera.matrixWorldInverse).z;
      dot.visible=depth>.25&&(this.view!=='tracking'||frame.time>=this.pitch.duration*(i+1)/6);
      // These are path annotations, so cap their on-screen radius at 3 CSS pixels.
      const maxRadius=6*depth*Math.tan(this.camera.fov*Math.PI/360)/Math.max(1,this.host.clientHeight);
      dot.scale.setScalar(Math.max(.001,Math.min(1,maxRadius/.025)));
    });
    path?.geometry.setDrawRange(0,this.view==='tracking'?Math.max(0,Math.min(181,Math.floor(frame.time/trackingEnd(this.pitch)*180)+1)):181);
    this.landing.visible=frame.reveal&&(this.view!=='tracking'||frame.time>=assessZone(this.pitch).decisionTime);
    this.shadow.visible=frame.reveal&&frame.ballVisible&&!held;
    this.shadow.position.set(p.x,.03,p.z);
    this.renderer.render(this.scene,this.camera);
  }
  dispose() {
    this.disposed=true;this.observer.disconnect();this.controls.dispose();
    this.scene.traverse(object=>{
      const mesh=object as THREE.Mesh;mesh.geometry?.dispose();
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      for(const material of materials)if(material){const map=(material as THREE.MeshStandardMaterial).map;map?.dispose();material.dispose();}
    });
    this.renderer.dispose();this.renderer.domElement.remove();
    (this.scene.background as THREE.Texture)?.dispose?.();
  }
}
