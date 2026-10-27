import * as THREE from 'three';

/** Closed, seam-smoothed surface shared by the torso and continuous limbs. */
export class RingSurface {
  readonly mesh:THREE.Mesh;
  readonly rings:number;
  readonly sides:number;
  constructor(rings:number,sides:number,material:THREE.Material|THREE.Material[],materialAt?:(t:number)=>number){
    this.rings=rings;this.sides=sides;
    const geometry=new THREE.BufferGeometry(),vertices=rings*(sides+1)+2;
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(vertices*3),3));
    const uv=new Float32Array(vertices*2),indices:number[]=[];
    const group=(start:number,count:number,materialIndex:number)=>{
      const previous=geometry.groups.at(-1);
      if(previous&&previous.materialIndex===materialIndex&&previous.start+previous.count===start)previous.count+=count;
      else geometry.addGroup(start,count,materialIndex);
    };
    for(let ring=0;ring<rings;ring++)for(let side=0;side<=sides;side++){
      const i=ring*(sides+1)+side;uv[i*2]=1-side/sides;uv[i*2+1]=ring/(rings-1);
    }
    for(let ring=0;ring<rings-1;ring++){
      const start=indices.length;
      for(let side=0;side<sides;side++){
        const a=ring*(sides+1)+side,b=a+1,c=a+sides+1,d=c+1;
        indices.push(a,c,b,b,c,d);
      }
      group(start,indices.length-start,materialAt?.((ring+.5)/(rings-1))??0);
    }
    const firstCenter=rings*(sides+1),lastCenter=firstCenter+1;
    const capStart=indices.length;
    for(let side=0;side<sides;side++)indices.push(firstCenter,side,side+1);
    group(capStart,indices.length-capStart,materialAt?.(0)??0);
    const capEnd=indices.length;
    for(let side=0;side<sides;side++){const end=(rings-1)*(sides+1)+side;indices.push(lastCenter,end+1,end);}
    group(capEnd,indices.length-capEnd,materialAt?.(1)??0);
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(indices);
    this.mesh=new THREE.Mesh(geometry,material);this.mesh.castShadow=true;
  }
  update(sample:(t:number)=>{center:THREE.Vector3;right:THREE.Vector3;front:THREE.Vector3;width:number;depth:number}){
    const geometry=this.mesh.geometry,positions=geometry.getAttribute('position') as THREE.BufferAttribute;
    let first!:THREE.Vector3,last!:THREE.Vector3;
    for(let ring=0;ring<this.rings;ring++){
      const p=sample(ring/(this.rings-1));if(ring===0)first=p.center;if(ring===this.rings-1)last=p.center;
      for(let side=0;side<=this.sides;side++){
        const angle=side/this.sides*Math.PI*2,a=Math.cos(angle)*p.width,b=Math.sin(angle)*p.depth;
        positions.setXYZ(ring*(this.sides+1)+side,p.center.x+p.right.x*a+p.front.x*b,p.center.y+p.right.y*a+p.front.y*b,p.center.z+p.right.z*a+p.front.z*b);
      }
    }
    positions.setXYZ(this.rings*(this.sides+1),first.x,first.y,first.z);
    positions.setXYZ(this.rings*(this.sides+1)+1,last.x,last.y,last.z);
    positions.needsUpdate=true;geometry.computeVertexNormals();
    // UV seam duplicates must share normals; otherwise a bright ridge remains.
    const normals=geometry.getAttribute('normal') as THREE.BufferAttribute;
    for(let ring=0;ring<this.rings;ring++){
      const a=ring*(this.sides+1),b=a+this.sides;
      const n=new THREE.Vector3(normals.getX(a)+normals.getX(b),normals.getY(a)+normals.getY(b),normals.getZ(a)+normals.getZ(b)).normalize();
      normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);
    }
    normals.needsUpdate=true;geometry.computeBoundingSphere();
  }
}

export function profile(t:number,points:readonly (readonly [number,number])[]):number {
  if(t<=points[0][0])return points[0][1];
  let i=0;while(i<points.length-2&&t>points[i+1][0])i++;
  const a=points[i],b=points[i+1],u=THREE.MathUtils.clamp((t-a[0])/(b[0]-a[0]),0,1);
  const slope=(k:number)=>(points[k+1][1]-points[k][1])/(points[k+1][0]-points[k][0]);
  const tangent=(k:number)=>{
    if(k===0)return slope(0);if(k===points.length-1)return slope(k-1);
    const left=slope(k-1),right=slope(k);if(left*right<=0)return 0;
    const h0=points[k][0]-points[k-1][0],h1=points[k+1][0]-points[k][0],w0=2*h1+h0,w1=h1+2*h0;
    return (w0+w1)/(w0/left+w1/right);
  };
  const h=b[0]-a[0],u2=u*u,u3=u2*u;
  return (2*u3-3*u2+1)*a[1]+(u3-2*u2+u)*h*tangent(i)+(-2*u3+3*u2)*b[1]+(u3-u2)*h*tangent(i+1);
}

/** One rounded surface across the elbow/knee: no separate joint ball or flat caps. */
export class LimbSurface {
  readonly surface:RingSurface;
  readonly arm:boolean;
  constructor(arm:boolean,materials:THREE.Material[]){
    this.arm=arm;
    this.surface=new RingSurface(33,24,materials,t=>arm?(t<.255?0:t<.29?1:2):0);
  }
  update(root:THREE.Vector3,joint:THREE.Vector3,end:THREE.Vector3,reference:THREE.Vector3){
    const upper=root.distanceTo(joint),lower=joint.distanceTo(end),total=upper+lower,split=upper/total;
    const inDirection=joint.clone().sub(root).normalize(),outDirection=end.clone().sub(joint).normalize();
    const blend=Math.min(this.arm ? .035 : .045,upper*.2,lower*.2);
    const a=joint.clone().addScaledVector(inDirection,-blend),b=joint.clone().addScaledVector(outDirection,blend);
    const center=(t:number)=>{
      const distance=t*total;
      if(distance<upper-blend)return root.clone().addScaledVector(inDirection,distance);
      if(distance>upper+blend)return joint.clone().addScaledVector(outDirection,distance-upper);
      const u=(distance-upper+blend)/(2*blend);
      return a.clone().multiplyScalar((1-u)**2).addScaledVector(joint,2*u*(1-u)).addScaledVector(b,u*u);
    };
    let previous=inDirection.clone(),right=reference.clone().addScaledVector(previous,-reference.dot(previous)).normalize();
    if(right.lengthSq()<.5)right.set(1,0,0).addScaledVector(previous,-previous.x).normalize();
    const rotation=new THREE.Quaternion();
    this.surface.update(t=>{
      const tangent=center(Math.min(1,t+.001)).sub(center(Math.max(0,t-.001))).normalize();
      rotation.setFromUnitVectors(previous,tangent);right.applyQuaternion(rotation).addScaledVector(tangent,-right.dot(tangent)).normalize();previous=tangent;
      const front=new THREE.Vector3().crossVectors(right,tangent).normalize();
      const radius=this.arm?profile(t,[[0,.042],[.10,.064],[.26,.057],[.31,.053],[split,.043],[.7,.042],[1,.026]]):profile(t,[[0,.043],[.10,.07],[.22,.083],[split,.059],[.7,.061],[1,.038]]);
      return {center:center(t),right,front,width:radius,depth:radius*(this.arm ? .93 : 1.02)};
    });
  }
}
