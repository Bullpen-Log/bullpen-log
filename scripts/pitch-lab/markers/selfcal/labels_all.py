"""모든 투구: 2D 궤적 → 스티커 이름 표(work/labels.json) + 3D 이름 궤적(work/rec/pNN.npz)."""
import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recon
cal = json.load(open(sys.argv[1])); out = {}
for p in [int(x) for x in sys.argv[2].split(",")]:
    tq, M, V, K, labels, votes = recon.run(p, cal)
    out[str(p)] = {f"{c}:{tid}": nm for (c, tid), nm in recon.run.track_labels.items()}
    np.savez_compressed(os.path.join(os.environ.get("MARKER_WORK", "work"), "rec", f"p{p:02d}.npz"), tq=tq, **{"M_" + k: v for k, v in M.items()}, **{"V_" + k: v for k, v in V.items()}, **{f"K_{a}_{b}": v for (a, b), v in K.items()})
    print(p, "이름", len(M), "· 2D 궤적", len(out[str(p)]), flush=True)
json.dump(out, open(sys.argv[3], "w"))
