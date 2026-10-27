/** Convert the requested Sinker sample to the prototype's SI joint convention. */
import {readFile,writeFile} from 'node:fs/promises';
const sample=Number(process.argv[2]??4);if(![3,4].includes(sample))throw new Error('Unsupported sample');
const data=JSON.parse(await readFile(new URL('../assets-source/sinker/sample-'+sample+'-prepared.json',import.meta.url),'utf8'));
const names=['hipT','hipG','shoulderT','shoulderG','elbowT','elbowG','wristT','wristG','handT','handG','kneeT','kneeG','ankleT','ankleG','toeT','toeG','heelT','heelG','head','headFront','headBack','neck','sternum'];
const first=data.joints[0],ground=Math.min(first.rhe[2],first.rto[2]);
const origin=data.rubber?.x??first.ra[0];
const world=p=>[p[1],p[2]-ground,p[0]-origin];
const add=(a,b,s=1)=>a.map((v,i)=>v+b[i]*s);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const F=data.joints.map((j,i)=>{
 const f=data.frames[i],head=f.head.hc,points={
 hipT:j.rh,hipG:j.lh,shoulderT:j.sh,shoulderG:j.gs,elbowT:j.el,elbowG:j.ge,
 wristT:j.wr,wristG:j.gw,handT:j.ha,handG:j.gh,kneeT:j.rk,kneeG:j.lk,
 ankleT:f.rear.ankle,ankleG:f.lead.ankle,toeT:f.rear.toe,toeG:f.lead.toe,heelT:f.rear.heel,heelG:f.lead.heel,
 head,headFront:add(head,f.head.fw,.07),headBack:add(head,f.head.fw,-.07),neck:f.head.neck,sternum:mix(j.sh,j.gs,.5),
 };
 return names.flatMap(n=>world(points[n]).map(v=>+v.toFixed(6)));
});
const ix=n=>names.indexOf(n)*3;
const distance=(f,a,b)=>Math.hypot(...[0,1,2].map(k=>f[ix(a)+k]-f[ix(b)+k]));
const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
const segment=(a,b)=>median(F.map(f=>distance(f,a,b)));
const output={source:'Sinker 3D analysis',trial:'pitching-sample-'+sample,sample,recordedHand:data.hand,canonicalHand:'R',representation:'Sinker displayTrack + mannequinTrack',
 changes:'Requested Sinker sample, existing analysis display smoothing and anatomical frame preparation; SI axis conversion; original event indices. Personal labels, video URLs and account identifiers omitted.',
 sampleRate:1/data.dt,releaseFrame:data.events.release,plantFrame:data.events.footContact??data.events.footPlant,contactFrame:data.events.footContact??data.events.footPlant,lockFrame:data.events.footPlant,kneeFrame:data.events.kneeUp??0,
 upperArm:segment('shoulderT','elbowT'),lowerArm:segment('elbowT','wristT'),upperArmG:segment('shoulderG','elbowG'),lowerArmG:segment('elbowG','wristG'),
 upperLegT:segment('hipT','kneeT'),lowerLegT:segment('kneeT','ankleT'),upperLegG:segment('hipG','kneeG'),lowerLegG:segment('kneeG','ankleG'),
 names,frames:F};
await writeFile(new URL('../src/data/sinker-sample-'+sample+'.json',import.meta.url),JSON.stringify(output));
console.log(JSON.stringify({sample,frames:F.length,ground,releaseFrame:output.releaseFrame,arm:[output.upperArm,output.lowerArm],gloveArm:[output.upperArmG,output.lowerArmG]}));
