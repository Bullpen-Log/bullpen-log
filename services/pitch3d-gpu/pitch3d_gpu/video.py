"""영상 풀기 — PyAV 로 장면을 원본 트랙 시각(편집 목록 없이)으로 읽는다(설계 0-3절 6번).

아이폰 슬로모를 내보내면 mov 의 편집 목록(elst)에 속도가 바뀐 조각이 여럿 생긴다. 재생기는 그 목록대로 시각을 늘이고 줄이지만, 두 영상의
시간을 맞추는 데는 '장면이 실제로 찍힌 간격'이 필요하다 — 원본 트랙 시각(pts × time_base)을 쓰고 편집 목록은 무시한다(ignore_editlist).

회전: 아이폰은 폰을 돌려 든 영상을 그림은 그대로 두고 '돌려서 보여라'(display matrix)만 붙여 저장한다. PyAV 는 그림을 돌리지 않으므로
여기서 바로 세운다(ffmpeg 의 autorotate 와 같은 규칙) — 2026-10-10 샘플 5(폰을 거꾸로 든 180°)가 사람을 거꾸로 읽어 '위'가 뒤집히고
키가 음수로 나와 '카메라 위치를 못 찾았어요'로 실패했다. 화면 녹화(지금까지의 샘플)는 회전이 없어 드러나지 않았다.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # numpy 는 이미지 안에만 — selfcheck 는 표준 라이브러리만으로 돈다
    import numpy as np


class DecodeError(Exception):
    pass


def upright_turn(rotation: float | None) -> int:
    """display matrix 의 회전(반시계 각도, PyAV frame.rotation) → 그림을 바로 세우려면 시계 방향으로 몇 도 돌리나(0 · 90 · 180 · 270).

    ffmpeg 의 get_rotation 과 같다: theta = -rotation 을 0~360 으로, 90° 단위로 반올림.
    """
    if not rotation:
        return 0
    return int(round(-float(rotation) / 90.0)) % 4 * 90


def _frame_rotation(f) -> float:
    """프레임의 display matrix 회전 — PyAV 13.1+ 는 frame.rotation, 옛 판은 0(돌리지 않음)."""
    try:
        return float(getattr(f, "rotation", 0) or 0)
    except Exception:  # noqa: BLE001
        return 0.0


def _upright(img: "np.ndarray", turn: int) -> "np.ndarray":
    if turn == 0:
        return img
    import cv2  # rtmlib 이 끌어온다

    code = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}[turn]
    return cv2.rotate(img, code)


@dataclass
class Frame:
    t: float
    image: "np.ndarray"  # BGR, HxWx3


def probe(path: str) -> tuple[int, int, float]:
    """(폭, 높이, 트랙 fps) — 바로 세운 그림 기준(90 · 270° 면 폭과 높이가 바뀐다)."""
    import av

    with av.open(path, options={"ignore_editlist": "1"}) as c:
        s = c.streams.video[0]
        fps = float(s.average_rate or s.guessed_rate or 30)
        w, h = int(s.codec_context.width), int(s.codec_context.height)
        turn = 0
        for f in c.decode(s):
            turn = upright_turn(_frame_rotation(f))
            break
        return (h, w, fps) if turn in (90, 270) else (w, h, fps)


def decode(
    path: str,
    fps: float,
    start: float | None = None,
    end: float | None = None,
    max_frames: int = 100_000,
) -> list[Frame]:
    """start~end(원본 트랙 초) 안의 장면을 초당 fps 개로 고르게 뽑는다(트랙 fps 보다 크면 트랙 그대로).

    너비가 1920 을 넘는 4K 는 긴 변 1920 으로 줄인다(관절 모델 입력이 384 라 더 큰 해상도는 시간만 든다).
    """
    import av

    try:
        container = av.open(path, options={"ignore_editlist": "1"})
    except Exception as e:  # noqa: BLE001
        raise DecodeError(str(e)) from e
    frames: list[Frame] = []
    try:
        stream = container.streams.video[0]
        stream.thread_type = "AUTO"
        tb = float(stream.time_base) if stream.time_base else None
        step = 1.0 / fps if fps > 0 else 0.0
        next_t = start if start is not None else -1.0
        for packet in container.demux(stream):
            for f in packet.decode():
                if f.pts is None or tb is None:
                    continue
                t = f.pts * tb
                if start is not None and t < start:
                    continue
                if end is not None and t > end:
                    return frames
                if t + 1e-6 < next_t:
                    continue
                img = _upright(f.to_ndarray(format="bgr24"), upright_turn(_frame_rotation(f)))
                h, w = img.shape[:2]
                if max(h, w) > 1920:
                    import cv2  # rtmlib 이 끌어온다

                    k = 1920 / max(h, w)
                    img = cv2.resize(img, (int(w * k), int(h * k)), interpolation=cv2.INTER_AREA)
                frames.append(Frame(t=float(t), image=img))
                if len(frames) >= max_frames:
                    return frames
                next_t = (t if next_t < 0 else next_t) + step
    except Exception as e:  # noqa: BLE001
        raise DecodeError(str(e)) from e
    finally:
        container.close()
    return frames
