"""AI 보정 나눠 맡기 — 분석 GPU 하나 + 도우미 GPU 여럿이 한 줄(Queue)에서 장면 묶음을 집어 간다(먼저 끝난 쪽이 더 집는다).

L4 한 장 0.8~0.95초 × 장면 170~300 이면 GPU 하나로 3~5분 — 사용자 상한 3분(2026-10-09 김민 "맥시멈 3분 · 정확도와 버그 없는 게 가장 중요").
같은 그림 · 같은 모델이라 누가 맡아도 답이 같다(도우미는 같은 영상을 같은 방법으로 풀고 장면 시각으로 확인 — sam3d.infer_items).

  분석 쪽(Coordinator): 작업 시작에 도우미를 부른다(켜지고 모델을 올리는 20~30초가 관절 찾기와 겹친다) → 구간을 알면 영상 정보를 보낸다
  → 맞추기가 끝나면 장면 묶음을 줄에 넣고 자기도 집는다 → 줄이 비면 도우미가 들고 있는 묶음을 잠깐 기다린다 → 그래도 빈 장면은 자기가 한다.
  도우미가 안 켜지거나(GPU 자리 없음) 중간에 죽어도 빠지는 장면이 없다 — 그때는 느려질 뿐.

Modal 을 모른다 — 줄은 get(block, timeout, partition) · put(v, partition) 만 쓴다(selfcheck 가 가짜 줄로 시험).
"""

from __future__ import annotations

import queue as _queue
import time
from typing import Any, Callable

CHUNK = 6  # 한 번에 집는 장면 수 — L4 에서 5초쯤. 작을수록 고르게 나뉘고 늦은 도우미가 들고 있는 몫이 작다
STOP = "stop"
HELPER_WAIT_SEC = 20.0  # 줄이 빈 뒤 도우미가 들고 있는 묶음을 기다리는 시간(묶음 하나 5초의 네 배)
CFG_WAIT_SEC = 180.0  # 도우미가 영상 정보를 기다리는 시간(관절 찾기 · 구간이 늦어도)
WORK_WAIT_SEC = 150.0  # 도우미가 첫 묶음을 기다리는 시간(맞추기가 늦어도)

Infer = Callable[[list], dict]


class Coordinator:
    """분석 GPU 쪽. spawn(i) 는 도우미 i 를 부르고 cancel() 이 있는 손잡이를 돌려준다."""

    def __init__(self, q: Any, spawn: Callable[[int], Any], helpers: int, clock: Callable[[], float] = time.time):
        self.q = q
        self.spawn = spawn
        self.helpers = helpers
        self.clock = clock
        self.calls: list = []
        self.by: dict[str, int] = {}

    def start(self) -> None:
        for i in range(self.helpers):
            try:
                self.calls.append(self.spawn(i))
            except Exception as e:  # noqa: BLE001 — 도우미 없이도 끝난다
                print(f"[pitch3d ai] 도우미 {i} 못 부름 — {type(e).__name__}: {str(e)[:120]}")

    def video(self, cfg: dict) -> None:
        for _ in self.calls:
            self.q.put(cfg, partition="cfg")

    def _take(self, m: dict, out: dict, seen: set) -> None:
        out.update(m["r"])
        seen.update(m["ks"])
        self.by[m["by"]] = self.by.get(m["by"], 0) + len(m["ks"])

    def _drain(self, out: dict, seen: set) -> None:
        while True:
            m = self.q.get(block=False, partition="done")
            if m is None:
                return
            self._take(m, out, seen)

    def run(self, items: list[dict], local: Infer) -> dict:
        """모든 장면의 결과 {k: 70×3} — 한 장면도 빠뜨리지 않는다(실패한 장면만 빠진다)."""
        chunks = [items[i : i + CHUNK] for i in range(0, len(items), CHUNK)]
        for c in chunks:
            self.q.put(c, partition="work")
        for _ in self.calls:
            self.q.put(STOP, partition="work")
        out: dict = {}
        seen: set = set()  # 맡아 끝낸 장면(사람을 못 찾은 장면도) — 결과가 없어도 기다리지 않게
        mine = 0
        while True:
            self._drain(out, seen)
            c = self.q.get(block=False, partition="work")
            if c is None:
                break
            if c == STOP:
                self.q.put(STOP, partition="work")  # 도우미 몫 — 돌려놓는다
                break
            out.update(local(c))
            seen.update(it["k"] for it in c)
            mine += len(c)
        want = {it["k"] for it in items}
        deadline = self.clock() + HELPER_WAIT_SEC
        while not want <= seen and self.clock() < deadline:
            try:
                m = self.q.get(timeout=1.0, partition="done")
            except _queue.Empty:
                continue
            self._take(m, out, seen)
        self._drain(out, seen)
        left = [it for it in items if it["k"] not in seen]
        if left:
            out.update(local(left))  # 늦거나 죽은 도우미가 들고 간 묶음
            mine += len(left)
        print(f"[pitch3d ai] 나눠 맡음 — 분석 GPU {mine}장 · 도우미 {dict(sorted(self.by.items()))} · 다시 한 장면 {len(left)} · 결과 {len(out)}/{len(items)}")
        return out

    def close(self) -> None:
        for c in self.calls:
            try:
                c.cancel()
            except Exception:  # noqa: BLE001 — 이미 끝난 것
                pass


def helper_loop(q: Any, name: str, fetch_frames: Callable[[dict], list], infer: Callable[[list, list], dict]) -> int:
    """도우미 GPU 쪽 — 영상 정보를 받아 장면을 풀고, 묶음을 집어 결과를 'done' 에 넣는다. 맡은 장면 수를 돌려준다."""
    try:
        cfg = q.get(timeout=CFG_WAIT_SEC, partition="cfg")
    except _queue.Empty:
        return 0
    try:
        frames = fetch_frames(cfg)
    except Exception as e:  # noqa: BLE001 — 못 풀면 아무 묶음도 안 집는다(분석 GPU 가 한다)
        print(f"[pitch3d ai] 도우미 {name} 영상 못 풂 — {type(e).__name__}: {str(e)[:160]}")
        return 0
    n = 0
    timeout = WORK_WAIT_SEC
    while True:
        try:
            c = q.get(timeout=timeout, partition="work")
        except _queue.Empty:
            break
        if c == STOP:
            break
        r = infer(frames, c)
        q.put({"by": name, "r": r, "ks": [it["k"] for it in c]}, partition="done")
        n += len(c)
        timeout = 5.0  # 묶음을 넣는 것은 한 번에 — 그 뒤 빈 줄은 끝
    return n
