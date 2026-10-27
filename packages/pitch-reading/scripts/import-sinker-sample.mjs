/** Read only: download just the requested Sinker sample, reuse its display preparation.
 * node --env-file=/path/to/.env --import /path/to/scripts/alias-register.mjs scripts/import-sinker-sample.mjs /path/to/project
 * No database/storage mutations. Raw results stay in ignored local assets-source/sinker/.
 */
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
const project=process.argv[2];if(!project)throw new Error('Project directory required');
const moduleUrl=p=>pathToFileURL(path.join(project,p)).href;
const {createClient}=createRequire(path.join(project,'package.json'))('@supabase/supabase-js');
const {displayTrack,displayFrameDt}=await import(moduleUrl('lib/pitch-3d/v2/display.ts'));
const {mannequinTrack}=await import(moduleUrl('lib/pitch-3d/v2/mannequin-prep.ts'));
const {canonicalFrames,mannequinFrames}=await import(moduleUrl('lib/pitch-3d/v2/mannequin-frames.ts'));
const bucket=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}).storage.from('pitch-videos');
// Requested sample number in the existing analysis-project sample mapping.
const sample=Number(process.argv[4]??4);if(![3,4].includes(sample))throw new Error('Only the requested samples 3 and 4 are supported');
const root=process.argv[3];if(!root)throw new Error('Requested sample storage path required');
const get=async suffix=>{const {data,error}=await bucket.download(root+'/'+suffix);if(error||!data)throw new Error('Requested sample asset unavailable: '+suffix);return JSON.parse(await data.text());};
const meta=await get('meta.json'),job=await get('job.json');
if(!job.shownJobId)throw new Error('Requested sample has no displayed result');
const result=await get('analysis-v2-'+job.shownJobId+'.json');
if(sample===3&&result.hand!=='L')throw new Error('Requested sample 3 is not left-handed');
const heightM=(meta.heightCm??183)/100;
const display=displayTrack(result,{heightM,ground:meta.ground??'mound'});
const track=mannequinTrack(display,result,heightM);
const joints=canonicalFrames(track),frames=mannequinFrames(joints,heightM);
const rubber=display.rubber;
const output={source:'Sinker 3D analysis · pitching sample '+sample,sample,heightM,hand:result.hand,dt:displayFrameDt(result),events:result.events,
  rubber:rubber?{x:rubber.x0*heightM,z:-rubber.z0*heightM}:null,
  joints,frames};
await writeFile(new URL('../assets-source/sinker/sample-'+sample+'-prepared.json',import.meta.url),JSON.stringify(output));
console.log(JSON.stringify({sample,frames:joints.length,hand:result.hand,heightM,dt:output.dt,events:result.events,rubber:output.rubber}));
