"""영상 풀기 — PyAV 로 장면을 원본 트랙 시각(편집 목록 없이)으로 읽는다(설계 0-3절 6번).

아이폰 슬로모를 내보내면 mov 의 편집 목록(elst)에 속도가 바뀐 조각이 여럿 생긴다. 재생기는 그 목록대로 시각을 늘이고 줄이지만, 두 영상의
시간을 맞추는 데는 '장면이 실제로 찍힌 간격'이 필요하다 — 원본 트랙 시각(pts × time_base)을 쓰고 편집 목록은 무시한다(ignore_editlist).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


class DecodeError(Exception):
    pass


@dataclass
class Frame:
    t: float
    image: np.ndarray  # BGR, HxWx3


def probe(path: str) -> tuple[int, int, float]:
    """(폭, 높이, 트랙 fps)."""
    import av

    with av.open(path, options={"ignore_editlist": "1"}) as c:
        s = c.streams.video[0]
        fps = float(s.average_rate or s.guessed_rate or 30)
        return int(s.codec_context.width), int(s.codec_context.height), fps


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
                img = f.to_ndarray(format="bgr24")
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
