/**
 * 영상이 많은 창(그날 기록)에서 어느 영상이 재생기를 가질지 정한다 — 순수(시험: scripts/native-viewport-selftest.mts). pitch/video.tsx 가 쓴다.
 *
 * 2026-10-26 2차 점검:
 * - 위치는 '내용 기준'(ScrollView 안쪽 판에 대한 자리)으로 붙을 때 · 배치가 바뀔 때만 잰다. 굴릴 때는 굴린 양으로 셈만 한다 — 예전엔 굴림 알림마다
 *   모든 카드가 화면 자리를 쟀다(영상 20개 × 굴림 10번 = 200번).
 * - 재생기는 화면 가까이(위아래 한 화면 안) 온 것부터, 가까운 순으로 한 번에 하나씩 준다(한꺼번에 여럿을 만들면 그 순간 굴림이 끊긴다).
 * - 동시에 살아 있는 재생기는 maxLive 개까지 — 멀어진(두 화면 밖) 재생기는 놓는다(자리 · 배속 · 그림은 video.tsx 가 기억해 다시 만들 때 되살린다).
 *   전체 화면 · 측정(그리기) 중인 것은 놓지 않는다(pinned).
 * - visible = 지금 화면에 걸쳐 있나 — 벗어나면 video.tsx 가 멈춘다.
 */
export type Rect = { y: number; h: number };
export type CardState = { live: boolean; visible: boolean };
export type CardHandle = {
  /** 내용 기준 자리를 잰다 — 못 재면 null(그때는 화면 안에 있는 것으로 본다) */
  measure: (done: (r: Rect | null) => void) => void;
  set: (s: CardState) => void;
  pinned: () => boolean;
};

/** 재생기를 주는 거리(화면 높이 배) · 놓는 거리 — 사이를 두어 경계에서 만들었다 놓았다 하지 않게 */
const NEAR = 1;
const KEEP = 2;

type Card = { h: CardHandle; rect: Rect | null; measured: boolean; state: CardState; dist: number };

export function createViewport({
  maxLive = 4,
  schedule = (f: () => void) => {
    setTimeout(f, 50);
  },
}: { maxLive?: number; schedule?: (f: () => void) => void } = {}) {
  const cards = new Set<Card>();
  let top = 0;
  let height = 0;
  let content: object | null = null;
  let measures = 0;
  let ticking = false;
  let remeasuring = false;

  const measureCard = (c: Card) => {
    measures++;
    c.h.measure((r) => {
      if (!cards.has(c)) return;
      c.rect = r;
      c.measured = true;
      update();
    });
  };

  function update() {
    if (!height) return;
    const bottom = top + height;
    const list = [...cards].filter((c) => c.measured);
    for (const c of list) {
      const r = c.rect;
      c.dist = !r ? 0 : r.y + r.h < top ? top - (r.y + r.h) : r.y > bottom ? r.y - bottom : 0;
    }
    const byDist = (a: Card, b: Card) => a.dist - b.dist;
    /* 지금 가진 것 — 고정된 것은 늘, 나머지는 놓는 거리 안이면 */
    const keep = list.filter((c) => c.state.live && (c.h.pinned() || c.dist <= KEEP * height)).sort(byDist);
    const live = new Set<Card>();
    for (const c of keep) if (c.h.pinned() || live.size < maxLive) live.add(c);
    /* 새로 줄 것 — 가까운 순으로 하나만(다음 것은 조금 뒤) */
    const want = list.filter((c) => !live.has(c) && c.dist <= NEAR * height).sort(byDist);
    if (want.length) {
      if (live.size >= maxLive) {
        /* 꽉 찼으면 가장 먼 것(고정 아님)이 새것보다 멀 때 바꾼다 */
        const far = [...live].filter((c) => !c.h.pinned()).sort(byDist).pop();
        if (far && far.dist > want[0].dist) live.delete(far);
      }
      if (live.size < maxLive) {
        live.add(want[0]);
        if (want.length > 1 && !ticking) {
          ticking = true;
          schedule(() => {
            ticking = false;
            update();
          });
        }
      }
    }
    for (const c of cards) {
      const next = { live: live.has(c), visible: c.measured && c.dist === 0 };
      if (next.live !== c.state.live || next.visible !== c.state.visible) {
        c.state = next;
        c.h.set(next);
      }
    }
  }

  return {
    /** ScrollView innerViewRef — 카드 자리는 이것에 대해 잰다 */
    bindContent: (el: object | null) => {
      content = el;
    },
    content: () => content,
    register(h: CardHandle): () => void {
      const c: Card = { h, rect: null, measured: false, state: { live: false, visible: false }, dist: 0 };
      cards.add(c);
      measureCard(c);
      return () => {
        cards.delete(c);
        update();
      };
    },
    /** 굴림 — 셈만 한다(자리를 다시 재지 않는다) */
    scroll(y: number) {
      top = y;
      update();
    },
    resize(h: number) {
      height = h;
      update();
    },
    /** 배치가 바뀜(내용 크기 · 카드 크기) — 한 틱에 한 번만 다시 잰다 */
    remeasure() {
      if (remeasuring) return;
      remeasuring = true;
      schedule(() => {
        remeasuring = false;
        cards.forEach(measureCard);
      });
    },
    /** 고정(전체 화면 · 측정)이 바뀜 */
    update,
    /** 시험용 — 자리를 잰 횟수 */
    measureCount: () => measures,
  };
}

export type Viewport = ReturnType<typeof createViewport>;
