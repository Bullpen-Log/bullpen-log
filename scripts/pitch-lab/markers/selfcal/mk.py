"""markers.py 를 이 촬영 색으로 덮어 쓴다(옅은 분홍 · 흙과 가까운 노랑)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import markers
markers.COLORS = {
    "pink": ((150, 30, 140), (179, 150, 255)),
    "yellow": ((23, 80, 120), (34, 255, 255)),
}
markers.MIN_DIAM_PX = 4
