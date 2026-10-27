"""Build anonymous, joint four-pitch repertoires from a public Statcast CSV.
Usage: python3 scripts/build-pitch-reference.py /path/to/statcast.csv
No player names are copied. Samples are tracking-fit references, not video capture.
"""
import csv,json,math,statistics,sys
from collections import defaultdict
from pathlib import Path
records=defaultdict(list)
with open(sys.argv[1],encoding='utf-8-sig') as f:
 for row in csv.DictReader(f):
  try:
   if row['pitch_type'] not in ['FF','CU','SL','CH']:continue
   n={k:float(row[k]) for k in ['vx0','vy0','vz0','ax','ay','az','release_speed']}
   v=[n['vx0']*.3048,n['vz0']*.3048,-n['vy0']*.3048];a=[n['ax']*.3048,n['az']*.3048+9.80665,-n['ay']*.3048];speed=math.sqrt(sum(x*x for x in v))
   drag=-sum(x*y for x,y in zip(v,a))/speed**3
   if not .003<drag<.009:continue
   lx=(a[0]+drag*speed*v[0])/speed**2;ly=(a[1]+drag*speed*v[1])/speed**2
   records[(row['p_throws'],row['pitcher'],row['pitch_type'])].append({'drag':drag,'liftX':lx,'liftY':ly,'speed':n['release_speed']*1.609344})
  except (ValueError,KeyError,ZeroDivisionError):continue
profiles=[]
selected={'R':['605135','607067','594798','677952'],'L':['676282','579328','669022','702070']}
for hand,ids in selected.items():
 for i,player in enumerate(ids):
  pitches={}
  for kind in ['FF','CU','SL','CH']:
   rs=records[(hand,player,kind)]
   if len(rs)<5:raise ValueError('Not enough observations')
   pitches[kind]={'n':len(rs),**{k:round(statistics.median(r[k] for r in rs),7) for k in ['drag','liftX','liftY']},'speedSdKmh':round(statistics.stdev(r['speed'] for r in rs),3)}
  profiles.append({'id':f'{hand.lower()}-{i+1}','hand':hand,'pitches':pitches})
out={'version':'statcast-fit-20250815-v1','date':'2025-08-15','source':'https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_date_gt=2025-08-15&game_date_lt=2025-08-15&hfPT=FF%7CCU%7CSL%7CCH%7C','method':'Medians of drag and transverse lift per speed squared inferred from fitted 50ft velocity and acceleration. Four pitches stay grouped by the same anonymous pitcher. Preset source-3/4 release and lower-level speeds are modeled, not a replay of the measured player.','profiles':profiles}
Path('src/data/pitch-reference.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('built',len(profiles),'profiles',sum(x['n'] for p in profiles for x in p['pitches'].values()),'reference pitches')
