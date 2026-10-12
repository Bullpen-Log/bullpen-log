import os
import glob, numpy as np
pairs = [("R_ASIS", "R_PSIS"), ("L_PSIS", "R_PSIS"), ("R_ASIS", "L_PSIS"), ("L_ASIS", "R_PSIS"), ("R13", "R14"), ("L13", "L14"), ("L11", "L13"), ("R12", "R13"), ("L9", "L11"), ("R9", "R11"), ("R2", "R3"), ("L2", "L3")]
for a, b in pairs:
    row = []
    for f in sorted(glob.glob(os.path.join(os.environ.get("MARKER_WORK", "work"), "rec", "p[0-9][0-9].npz"))):
        z = np.load(f)
        if "M_" + a in z.files and "M_" + b in z.files:
            d = np.linalg.norm(z["M_" + a] - z["M_" + b], axis=1) * 7.38
            d = d[~np.isnan(d)]
            if len(d) >= 5:
                row.append(f"{f[-6:-4]}:{np.median(d) * 100:.0f}±{np.subtract(*np.percentile(d, [75, 25])) * 50:.0f}({len(d)})")
    print(f"{a}-{b}: " + " ".join(row))
