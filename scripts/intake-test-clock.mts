/**
 * 시험 시계 — 이 파일을 맨 앞에 부르는 시험은 실제 날짜와 상관없이 같은 날에 돈다.
 * Date.now() 와 인자 없는 new Date() 만 TEST_EPOCH 부터 흐르게 옮긴다. 인자를 준 new Date(x) · Date.parse 는 그대로다.
 *
 * 시험은 초대 · 올리기 기간을 시험 시계(NOW · nowMs)로 만든다. 그런데 제품의 기본 시각(now = new Date()),
 * 크론이 부르는 정리 · 검증 처리기, Prisma 가 찍는 updatedAt 은 이 프로세스의 시계를 쓴다. 실제 시계면 날짜가 지나며 둘이 어긋나
 * 기간이 끝난 것처럼 된다(2026-11-18 부터 깨질 참이었다). 제품 코드의 기본값은 그대로 두고 시험 쪽 시계를 맞춘다.
 * TEST_EPOCH 는 시험의 NOW 와 같은 때다. nowMs 를 앞당기는 시험은 프로세스 시계가 그보다 뒤처진다는 것을 알고 쓴다.
 */
export const TEST_EPOCH = Date.parse('2026-11-06T03:00:00Z');

const RealDate = Date;
const realNow = RealDate.now.bind(RealDate);
const offset = TEST_EPOCH - realNow();
const testNow = () => realNow() + offset;

/* 프록시라 instanceof · 정적 함수 · 상속은 원래 Date 그대로다 */
const TestClockDate = new Proxy(RealDate, {
  construct: (target, args, newTarget) => Reflect.construct(target, args.length === 0 ? [testNow()] : args, newTarget),
  apply: () => new RealDate(testNow()).toString(),
  get: (target, prop, receiver) => (prop === 'now' ? testNow : Reflect.get(target, prop, receiver)),
});
(globalThis as { Date: DateConstructor }).Date = TestClockDate;
