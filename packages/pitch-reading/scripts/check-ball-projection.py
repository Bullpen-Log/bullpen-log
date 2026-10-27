"""Check rendered ball widths against the browser reality audit (requires Pillow).
Run after tests/browser/batter-reality.spec.ts; never modifies images.
"""
import json
import math
from pathlib import Path
from PIL import Image

rows = []
for width in (1440, 844):
    for entry in json.loads(Path(f"test-results/ball-projection-{width}.json").read_text()):
        im = Image.open(entry["file"]).convert("RGB")
        x, y, diameter = entry["x"], entry["y"], entry["diameter"]
        pad = math.ceil(diameter / 2) + 4
        points = set()
        for py in range(max(0, int(y) - pad), min(im.height, int(y) + pad + 1)):
            for px in range(max(0, int(x) - pad), min(im.width, int(x) + pad + 1)):
                rgb = im.getpixel((px, py))
                if min(rgb) >= 190 and max(rgb) - min(rgb) < 40:
                    points.add((px, py))
        assert points, f"No visible white ball: {entry['file']}"
        seed = min(points, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)
        component, queue = {seed}, [seed]
        while queue:
            px, py = queue.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    near = (px + dx, py + dy)
                    if near in points and near not in component:
                        component.add(near)
                        queue.append(near)
        actual = max(p[0] for p in component) - min(p[0] for p in component) + 1
        error = actual - diameter
        red_arcs = sum(1 for py in range(max(0, int(y)-pad), min(im.height, int(y)+pad+1))
                       for px in range(max(0, int(x)-pad), min(im.width, int(x)+pad+1))
                       if (px+.5-x)**2+(py+.5-y)**2 <= max(0,diameter/2-1)**2
                       if (lambda rgb: rgb[0]-rgb[1]>20 and rgb[0]-rgb[2]>15)(im.getpixel((px,py))))
        print(f"{width} {entry['pitcher']} {entry['time']:.3f}s: "
              f"expected {diameter:.2f}px, visible {actual}px, error {error:+.2f}px")
        assert abs(error) <= 2, (entry["file"], diameter, actual)
        assert red_arcs == 0, f"Decorative red arcs visible in batter flight: {entry['file']}"
        rows.append(dict(entry, measuredWidthPixels=actual, errorPixels=error, redArcPixels=red_arcs))
Path("test-results/ball-projection-pixels.json").write_text(json.dumps(rows, indent=2))
