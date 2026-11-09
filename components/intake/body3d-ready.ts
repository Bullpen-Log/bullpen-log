/**
 * 3D 보기가 실제로 그릴 준비가 됐나 — 모듈을 불러온 것만으로는 아니다(05 확인: import 완료 ≠ 준비).
 * 공용 부품(Body3D)은 바깥으로 상태를 알리지 않아, 그 부품이 이미 그리는 것을 읽는다: 그림판(canvas)이 붙었고 재생 단추가 켜졌다.
 * 그 단추는 Body3D 의 status 가 'ready' 일 때만 켜진다(불러오는 중 · 그릴 수 없음 · 실패면 꺼져 있다).
 * 이것은 임시 연결이다 — 공용 부품에 상태 알림을 더하는 계약은 그 파일 담당과 05 가 정한다(INTAKE-MAIN outbox Q-R01-b). 그 전까지 이 조건이 달라지면 검토 완료 단추가 켜지지 않는 쪽으로 틀린다.
 */
export function body3dReady(root: ParentNode | null): boolean {
  if (!root) return false;
  if (!root.querySelector('canvas')) return false;
  const play = root.querySelector<HTMLButtonElement>('button[aria-label="재생"], button[aria-label="멈춤"]');
  return play != null && !play.disabled;
}
