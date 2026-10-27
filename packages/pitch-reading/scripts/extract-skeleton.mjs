/** CMU ASF/AMC forward kinematics. Standard Acclaim transform: parent * C * R * inverse(C).
 * This preserves captured bone lengths instead of treating skin markers as joints.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {Vector3,Quaternion,Euler} from 'three';
const directory=new URL('../assets-source/cmu/',import.meta.url);
const asf=await readFile(new URL('124.asf',directory),'utf8');
const scale=.0254/.45*1.055;
const radians=a=>a*Math.PI/180;
const rotation=angles=>new Quaternion().setFromEuler(new Euler(...angles.map(radians),'ZYX'));
const bones=new Map();
for(const block of asf.split(':bonedata')[1].split(':hierarchy')[0].split(/\bbegin\b/).slice(1)){
  const fields={};for(const line of block.split('\n')){const [key,...parts]=line.trim().split(/\s+/);if(key)fields[key]=parts;}
  const name=fields.name[0],axis=rotation(fields.axis.slice(0,3).map(Number));
  bones.set(name,{name,direction:new Vector3(...fields.direction.map(Number)),length:Number(fields.length[0])*scale,axis,inverse:axis.clone().invert(),dof:fields.dof??[],parent:'root'});
}
for(const line of asf.split(':hierarchy')[1].split('\n')){
  const [parent,...children]=line.trim().split(/\s+/);
  if(!['root',...bones.keys()].includes(parent))continue;
  for(const child of children)bones.get(child).parent=parent;
}
function parseAmc(text){const frames=[];let frame=null;for(const line of text.split('\n')){
  const [key,...parts]=line.trim().split(/\s+/);if(!key||key.startsWith('#')||key.startsWith(':'))continue;
  if(/^\d+$/.test(key)){frame={};frames.push(frame);}else if(frame)frame[key]=parts.map(Number);
}return frames;}
function fk(frame){
  const values={root:{position:new Vector3(...frame.root.slice(0,3)).multiplyScalar(scale),orientation:rotation(frame.root.slice(3))}};
  const resolve=name=>{
    if(values[name])return values[name];const bone=bones.get(name),parent=resolve(bone.parent),angles=[0,0,0];
    bone.dof.forEach((axis,i)=>{angles[{rx:0,ry:1,rz:2}[axis]]=frame[name]?.[i]??0;});
    const orientation=parent.orientation.clone().multiply(bone.axis).multiply(rotation(angles)).multiply(bone.inverse);
    return values[name]={orientation,position:parent.position.clone().add(bone.direction.clone().multiplyScalar(bone.length).applyQuaternion(orientation))};
  };for(const name of bones.keys())resolve(name);return values;
}
const vec=(x=0,y=0,z=0)=>new Vector3(x,y,z);
const point=(s,n)=>s[n].position.clone();
function extractPoints(s){
  const headDirection=vec(0,0,1).applyQuaternion(s.head.orientation),head=point(s,'upperneck').lerp(point(s,'head'),.55);
  const heel=side=>{const ankle=point(s,side+'tibia'),dir=point(s,side+'toes').sub(ankle).normalize();return ankle.addScaledVector(dir,-.07).add(vec(0,-.05,0));};
  return {
    hipT:point(s,'rhipjoint'),hipG:point(s,'lhipjoint'),
    shoulderT:point(s,'rclavicle'),shoulderG:point(s,'lclavicle'),
    elbowT:point(s,'rhumerus'),elbowG:point(s,'lhumerus'),
    wristT:point(s,'rwrist'),wristG:point(s,'lwrist'),
    handT:point(s,'rhand'),handG:point(s,'lhand'),
    kneeT:point(s,'rfemur'),kneeG:point(s,'lfemur'),
    ankleT:point(s,'rtibia'),ankleG:point(s,'ltibia'),
    toeT:point(s,'rtoes'),toeG:point(s,'ltoes'),heelT:heel('r'),heelG:heel('l'),
    head,headFront:head.clone().addScaledVector(headDirection,.07),headBack:head.clone().addScaledVector(headDirection,-.07),
    neck:point(s,'lowerneck'),sternum:point(s,'thorax').addScaledVector(vec(0,0,1).applyQuaternion(s.thorax.orientation),.08),
  };
}
for(const [trial,start,release,end,plant,output] of [
  ['124_01',280,446,530,423,'pitching-motion.json'],
  ['124_02',240,404,490,391,'pitching-motion-compact.json'],
]){
  const frames=parseAmc(await readFile(new URL(trial+'.amc',directory),'utf8'));
  const positions=frames.map(f=>extractPoints(fk(f)));
  const origin=positions[start].ankleT.clone();origin.y=0;
  const forward=positions[plant].ankleG.clone().sub(origin);forward.y=0;forward.normalize();
  const right=new Vector3().crossVectors(vec(0,1,0),forward).normalize();
  const names=Object.keys(positions[0]);
  const result=[];
  for(let i=start;i<=end;i++){
    const flat=[];for(const name of names){const p=positions[i][name].clone().sub(origin);flat.push(...[p.dot(right),p.y,p.dot(forward)].map(v=>Number(v.toFixed(6))));}result.push(flat);
  }
  const data={source:'CMU Graphics Lab Motion Capture Database',trial,
    sourceUrl:`https://mocap.cs.cmu.edu/subjects/124/${trial}.amc`,skeletonUrl:'https://mocap.cs.cmu.edu/subjects/124/124.asf',
    termsUrl:'https://mocap.cs.cmu.edu/',representation:'ASF/AMC forward kinematics',
    attribution:'CMU Graphics Lab Motion Capture Database; NSF EIA-0196217.',
    changes:'Frame trim, Acclaim forward kinematics, SI conversion, uniform 1.055 body scaling, coordinate rotation. Artist-selected release event; no measured ball label.',
    sampleRate:120,releaseFrame:release-start,plantFrame:plant-start,
    upperArm:bones.get('rhumerus').length,lowerArm:bones.get('rradius').length+bones.get('rwrist').length,
    upperLegT:bones.get('rfemur').length,lowerLegT:bones.get('rtibia').length,
    upperLegG:bones.get('lfemur').length,lowerLegG:bones.get('ltibia').length,
    names,frames:result};
  await writeFile(new URL('../src/data/'+output,import.meta.url),JSON.stringify(data));
  console.log(trial,result.length,'arm lengths',data.upperArm,data.lowerArm);
  console.log('release',Object.fromEntries(['shoulderT','elbowT','wristT','handT','head','ankleG'].map(n=>[n,result[release-start].slice(names.indexOf(n)*3,names.indexOf(n)*3+3)])));
}
