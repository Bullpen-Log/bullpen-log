import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LimbSurface} from '../src/pitcher-surface.ts';
import {sampleDelivery,preparationDuration} from '../src/motion.ts';
import {PITCHERS} from '../src/physics.ts';

test('arm and leg surfaces stay closed, smooth at their UV seam, and bounded through both source motions',()=>{
  const vector=(p:{x:number;y:number;z:number})=>new THREE.Vector3(p.x,p.y,p.z);
  for(const arm of [true,false]){
    const surface=new LimbSurface(arm,[new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial()]);
    for(const pitcher of [PITCHERS[0],PITCHERS[2]])for(const t of [-preparationDuration(pitcher),-.3,-.04,0,.3])for(const side of ['T','G'] as const){
      const pose=sampleDelivery(t,pitcher,pitcher.release);
      const root=vector(pose[`${arm?'shoulder':'hip'}${side}`]),joint=vector(pose[`${arm?'elbow':'knee'}${side}`]),end=vector(pose[`${arm?'wrist':'ankle'}${side}`]);
      surface.update(root,joint,end,new THREE.Vector3(0,0,1));
      const geometry=surface.surface.mesh.geometry,positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
      const welded=new Map<string,number>(),ids:number[]=[],edges=new Map<string,number>();
      for(let i=0;i<positions.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(positions,i);
        assert.ok([point.x,point.y,point.z,normals.getX(i),normals.getY(i),normals.getZ(i)].every(Number.isFinite));
        const nearest=Math.min(point.distanceTo(new THREE.Line3(root,joint).closestPointToPoint(point,true,new THREE.Vector3())),point.distanceTo(new THREE.Line3(joint,end).closestPointToPoint(point,true,new THREE.Vector3())));
        assert.ok(nearest<(arm?.10:.12),'surface spikes beyond the anatomical segment');
        const key=point.toArray().map(n=>n.toFixed(5)).join(',');if(!welded.has(key))welded.set(key,welded.size);ids.push(welded.get(key)!);
      }
      const index=geometry.getIndex()!;
      for(let i=0;i<index.count;i+=3){
        const tri=[ids[index.getX(i)],ids[index.getX(i+1)],ids[index.getX(i+2)]];
        assert.equal(new Set(tri).size,3,'collapsed triangle');
        for(let j=0;j<3;j++){const edge=[tri[j],tri[(j+1)%3]].sort((a,b)=>a-b).join(':');edges.set(edge,(edges.get(edge)??0)+1);}
      }
      assert.ok([...edges.values()].every(count=>count===2),'open seam or end cap');
      for(let ring=0;ring<surface.surface.rings;ring++){
        const a=ring*(surface.surface.sides+1),b=a+surface.surface.sides;
        assert.ok(new THREE.Vector3().fromBufferAttribute(normals,a).distanceTo(new THREE.Vector3().fromBufferAttribute(normals,b))<1e-6,'visible shading seam');
      }
      assert.ok(geometry.groups.length<=5,'unnecessarily fragmented draw groups');
    }
  }
});
