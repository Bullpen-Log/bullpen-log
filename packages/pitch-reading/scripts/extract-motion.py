"""Reproducible extraction of CMU 124_01/02 marker motion. Requires c3d and numpy.
Only public CMU data are used. No OBP/noncommercial data are included.
"""
import json
import pathlib
import sys
import c3d
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
COMPACT = '--compact' in sys.argv
TRIAL = '124_02' if COMPACT else '124_01'
with (ROOT / f'assets-source/cmu/{TRIAL}.c3d').open('rb') as handle:
    reader = c3d.Reader(handle)
    names = [label.strip().split(':')[-1] for label in reader.point_labels]
    raw = np.array([points for _, points, _ in reader.read_frames()])

idx = {name: i for i, name in enumerate(names)}
def marker(name):
    value = raw[:, idx[name], :3] / 1000.0
    valid = raw[:, idx[name], 3] >= 0
    if not valid.all():
        for axis in range(3):
            value[:, axis] = np.interp(np.arange(len(value)), np.where(valid)[0], value[valid, axis])
    # Suppress marker noise while retaining the short acceleration phase (120 Hz).
    padded = np.pad(value, ((1, 1), (0, 0)), mode='edge')
    return padded[:-2] * 0.18 + padded[1:-1] * 0.64 + padded[2:] * 0.18
def avg(*labels):
    return sum(marker(n) for n in labels) / len(labels)

points = {
    'hipT': avg('RFWT', 'RBWT'), 'hipG': avg('LFWT', 'LBWT'),
    'shoulderT': marker('RSHO'), 'shoulderG': marker('LSHO'),
    'elbowT': marker('RELB'), 'elbowG': marker('LELB'),
    'wristT': avg('RWRA', 'RWRB'), 'wristG': avg('LWRA', 'LWRB'),
    'handT': marker('RFIN'), 'handG': marker('LFIN'),
    'kneeT': marker('RKNE'), 'kneeG': marker('LKNE'),
    'ankleT': marker('RANK'), 'ankleG': marker('LANK'),
    'toeT': marker('RTOE'), 'toeG': marker('LTOE'),
    'heelT': marker('RHEE'), 'heelG': marker('LHEE'),
    'head': avg('LFHD', 'RFHD', 'LBHD', 'RBHD'),
    'headFront': avg('LFHD', 'RFHD'), 'headBack': avg('LBHD', 'RBHD'),
    'neck': avg('C7', 'CLAV'), 'sternum': marker('STRN'),
}
# No ball marker exists: the release event is artist-selected, not a measured ball-release label.
START, RELEASE, END = (240,403,490) if COMPACT else (280,446,530)
PLANT = 391 if COMPACT else 423
origin = points['ankleT'][START].copy(); origin[2] = 0
forward = (points['ankleG'][PLANT] - points['ankleT'][START])[:2]
forward /= np.linalg.norm(forward)
right = np.array([-forward[1], forward[0]])
scale = 1.055
output = []
for frame in range(START, END + 1):
    row = []
    for key, trajectory in points.items():
        p = trajectory[frame] - origin
        # Three.js world: x=catcher's right, y=up, z=toward plate.
        row.extend([round(float(p[:2] @ right * scale), 5), round(float(p[2] * scale), 5), round(float(p[:2] @ forward * scale), 5)])
    output.append(row)

data = {
    'source': 'CMU Graphics Lab Motion Capture Database', 'trial': TRIAL,
    'sourceUrl': f'https://mocap.cs.cmu.edu/subjects/124/{TRIAL}.c3d',
    'termsUrl': 'https://mocap.cs.cmu.edu/',
    'attribution': 'The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.',
    'changes': 'Trimmed; marker averages; 3-tap smoothing; coordinate conversion; 1.055 body scaling; selected release event. Runtime IK retargeting adapts to fictional pitchers.',
    'sampleRate': 120, 'releaseFrame': RELEASE - START, 'plantFrame': PLANT - START,
    'names': list(points), 'frames': output,
}
dest = ROOT / ('src/data/pitching-motion-compact.json' if COMPACT else 'src/data/pitching-motion.json'); dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(data, separators=(',', ':')))
print(f'Wrote {len(output)} frames, {len(points)} points, {dest.stat().st_size} bytes')
for event in [('start', 0), ('plant', PLANT-START), ('release', RELEASE-START), ('end', END-START)]:
    print(event[0], {key: output[event[1]][list(points).index(key)*3:list(points).index(key)*3+3] for key in ['wristT','shoulderT','hipT','ankleT','ankleG']})
