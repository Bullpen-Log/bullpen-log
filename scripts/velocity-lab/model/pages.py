"""확인 띠(refine.py --sheet) → 한 장에 12개씩 모은 쪽(page-NN.jpg)"""
import glob, os, sys
from PIL import Image
d = sys.argv[1]
fs = sorted(glob.glob(os.path.join(d, "[0-9][0-9][0-9][0-9].png")))
for p in range(0, len(fs), 12):
    ims = [Image.open(f) for f in fs[p : p + 12]]
    W = max(i.width for i in ims)
    page = Image.new("RGB", (W, sum(i.height + 4 for i in ims)), (0, 0, 0))
    y = 0
    for i in ims:
        page.paste(i, (0, y)); y += i.height + 4
    page.save(os.path.join(d, f"page-{p // 12:02d}.jpg"), quality=85)
print(len(fs), "띠 →", (len(fs) + 11) // 12, "쪽")
