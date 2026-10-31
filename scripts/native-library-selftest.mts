/**
 * 운동 영상 · 투구 드릴 라이브러리(2026-10-31 시안 01 · 02)의 순수 규칙 시험 — 찾기 · 거르기 · 정렬 · 워밍업 칸(native/src/library/browse.ts),
 * 투구 드릴의 찾기 · 주/보조 요소 정렬 · 들어온 곳(drill-browse.ts)과
 * 별 · 메모를 화면끼리 맞추는 저장소(native/src/library/sync.ts: 요청 차례 · 늦은 답 · 실패 원복 · 응답 유실 · 계정 바뀜).
 * 실행: npm run native-library:test. 화면 · 실제 서버 · 폰 재생기는 이 시험이 보지 못한다.
 */
import assert from 'node:assert/strict';

const { browse, categoriesOf, matchesQuery, nearestIndex, searchTerms, shortCategory, warmupIds, EMPTY_VIEW, WARMUP } = await import('~/library/browse');
const sync = await import('~/library/sync');

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};

type Ex = { id: string; title: string; category: string; bodyParts: string[]; intensity: string; equipment: string[]; favorite: boolean };
const ex = (id: string, title: string, category: string, bodyParts: string[], equipment: string[], intensity = '중간', favorite = false): Ex => ({ id, title, category, bodyParts, intensity, equipment, favorite });
const LIST: Ex[] = [
  ex('a', '덤벨 프레스', '상체 스트렝스', ['가슴', '어깨'], ['덤벨', '벤치']),
  ex('b', '바벨 백 스쿼트', '하체 스트렝스', ['하체'], ['바벨'], '높음', true),
  ex('c', 'TRX 로우', '상체 스트렝스', ['등'], ['TRX']),
  ex('d', '밴드 외회전', '암케어', ['어깨'], ['밴드'], '낮음', true),
  ex('e', '고관절 90/90', '모빌리티', ['고관절'], ['맨몸'], '낮음'),
  ex('f', '바벨 데드리프트', '하체 스트렝스', ['하체', '등'], ['바벨'], '높음'),
  ex('g', '암 서클', '워밍업', ['어깨'], ['맨몸'], '낮음'),
  ex('h', '가나다', '코어', [], ['맨몸']),
  ex('i', '가나다', '코어', [], ['맨몸']),
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const view = (patch: Partial<typeof EMPTY_VIEW>) => ({ ...EMPTY_VIEW, ...patch });
const byFav = (x: Ex) => x.favorite;
const find = (query: string) => ids(browse(LIST, [], view({ query }), byFav));

/* 찾기 — 띄어쓰기 · 대소문자 · 여러 말 AND · 분류 줄인 이름 · 부위 · 장비 */
eq(find('덤벨프레스'), ['a'], "'덤벨프레스' → 덤벨 프레스");
eq(find('덤벨 프레스'), ['a'], "'덤벨 프레스' → 덤벨 프레스");
eq(find('trx'), ['c'], "'trx' → TRX 로우");
eq(find('TRX'), ['c'], "'TRX' → TRX 로우");
eq(find('바벨 스쿼트'), ['b'], "'바벨 스쿼트' → 바벨 백 스쿼트(말마다 AND)");
eq(find('밴드 어깨'), ['d'], "'밴드 어깨' → 장비 밴드 + 부위 어깨");
eq(find('   '), ids(LIST), '공백뿐인 찾기는 거르지 않음');
eq(find('하체'), ['b', 'f'], "'하체' → 분류 하체 스트렝스 · 부위 하체");
eq(find('바벨 없는말'), [], '한 말이라도 안 맞으면 빠짐');
eq(searchTerms('  덤벨   프레스 '), ['덤벨', '프레스'], '찾는 말 나누기');
eq(matchesQuery(LIST[0], []), true, '찾는 말 없음 = 맞음');
eq(shortCategory('회복 및 보강'), '회복·보강', '분류 줄인 이름');
eq(shortCategory('나중에 촬영'), '영상 준비 중', '나중에 촬영은 화면에서 영상 준비 중');
eq(shortCategory('파워'), '파워', '모르는 분류는 그대로');

/* 거르기 — 묶음 안 OR, 묶음끼리 AND */
const filt = (f: Partial<typeof EMPTY_VIEW.filters>) => ids(browse(LIST, [], view({ filters: { ...EMPTY_VIEW.filters, ...f } }), byFav));
eq(filt({ bodyParts: ['어깨', '등'] }), ['a', 'c', 'd', 'f', 'g'], '부위 어깨 또는 등');
eq(filt({ bodyParts: ['어깨'], equipment: ['밴드'] }), ['d'], '부위 어깨 그리고 장비 밴드');
eq(filt({ intensity: ['높음'] }), ['b', 'f'], '강도 높음');
eq(ids(browse(LIST, [], view({ query: '바벨', filters: { ...EMPTY_VIEW.filters, bodyParts: ['등'] } }), byFav)), ['f'], '찾기와 거르기 함께');

/* 범위 · 분류 */
eq(ids(browse(LIST, [], view({ scope: 'fav' }), byFav)), ['b', 'd'], '즐겨찾기만');
eq(ids(browse(LIST, [], view({ scope: 'fav', query: '프레스' }), byFav)), [], '즐겨찾기 중 맞는 것 없음(즐겨찾기 자체는 있음)');
eq(ids(browse(LIST, [], view({ category: '하체 스트렝스' }), byFav)), ['b', 'f'], '분류 하나');

/* 워밍업 칸 — 분류가 워밍업 + 루틴 폴더, 같은 운동 한 번 · 폴더는 담은 차례 */
const groups = [
  { kind: 'COMMON', name: '공통', exerciseIds: ['g', 'e'] },
  { kind: 'LOWER', name: '하체', exerciseIds: ['g', 'e', 'b', 'e'] },
];
eq([...warmupIds(LIST, groups)].sort(), ['b', 'e', 'g'], '워밍업 운동 id 중복 없이');
eq(ids(browse(LIST, groups, view({ category: WARMUP }), byFav)), ['b', 'e', 'g'], '워밍업 전체 — 등록순(서버 차례)');
eq(ids(browse(LIST, groups, view({ category: WARMUP, folder: 'LOWER' }), byFav)), ['g', 'e', 'b'], '루틴 폴더 — 담은 차례, 두 번 담긴 운동은 한 번');
eq(categoriesOf(LIST.filter((x) => x.category !== '워밍업'), groups).includes(WARMUP), true, '폴더에만 있어도 워밍업 칩');
eq(categoriesOf([], []), [], '빈 목록은 분류 없음');

/* 정렬 — 이름순은 한국어, 같으면 원래 차례 */
const named = ids(browse(LIST, [], view({ sort: 'name' }), byFav));
eq(named.indexOf('h') < named.indexOf('i'), true, '같은 이름은 원래 차례(안정)');
eq(named[0], 'h', "이름순 맨 앞은 '가나다'");
eq(ids(browse(LIST, [], view({}), byFav)), ids(LIST), '등록순은 서버 차례 그대로');

/* 돌아온 자리 — 보던 카드가 사라지면 가까운 남은 카드 */
eq(nearestIndex(['a', 'b', 'c'], 'b', ['a', 'b', 'c']), 1, '보던 카드 그대로');
eq(nearestIndex(['a', 'c', 'd'], 'b', ['a', 'b', 'c', 'd']), 1, '사라지면 바로 다음 카드');
eq(nearestIndex(['a'], 'c', ['a', 'b', 'c']), 0, '뒤가 다 사라지면 앞 카드');
eq(nearestIndex([], 'c', ['c']), 0, '빈 목록');

/* ----------------------------- 투구 드릴 목록 ----------------------------- */
{
  const { browseDrills, entryOf, entryParams, optionsOf, secondaryMatch, shortDrillCategory, stageRank, EMPTY_DRILL_VIEW, EMPTY_DRILL_FILTERS } = await import('~/library/drill-browse');
  type Dr = { id: string; title: string; category: string; focusPoints: string[]; equipment: string[]; stage: string | null; sortOrder: number; favorite: boolean };
  const dr = (id: string, title: string, focusPoints: string[], stage: string | null, equipment: string[], sortOrder: number, category = '무브먼트 패턴 드릴', favorite = false): Dr => ({ id, title, category, focusPoints, equipment, stage, sortOrder, favorite });
  const D: Dr[] = [
    dr('t1', '지지 홀드 TKE', ['브레이크'], '기초', ['밴드'], 3, '근력 · 안정 드릴', true),
    dr('t2', '메디신볼 로테이션 스로우', ['몸통 회전', '브레이크'], '연결', ['메디신볼'], 1, '메디신볼 드릴'),
    dr('t3', '프런트 풋 홀드', ['브레이크'], null, ['맨몸'], 2),
    dr('t4', '레그 리프트 드리프트', ['드리프트', '드롭'], '기초', ['맨몸'], 5),
    dr('t5', '롤인 스로우', ['스로잉', '드리프트'], '통합', ['야구공'], 4, '스로잉 드릴'),
    dr('t6', '리듬 스텝', [], null, [], 6, '나중에 촬영'),
    dr('t7', '밴드 앞다리 지지 드릴', ['브레이크'], '기초', ['밴드'], 7),
    dr('t8', '가나다', ['드롭'], '새단계', ['맨몸'], 8),
    dr('t9', '가나다', ['드롭'], '기초', ['맨몸'], 9),
  ];
  const dv = (patch: Partial<typeof EMPTY_DRILL_VIEW> & { f?: Partial<typeof EMPTY_DRILL_FILTERS> }) => ({ ...EMPTY_DRILL_VIEW, ...patch, filters: { ...EMPTY_DRILL_FILTERS, ...patch.f } });
  const run = (patch: Parameters<typeof dv>[0]) => ids(browseDrills(D, dv(patch), (g) => g.favorite));

  /* 찾기 — 이름(띄어쓰기 무관) · 종류(줄인 이름) · 보조 요소 · 장비 · 단계, 말마다 AND */
  eq(run({ query: '레그리프트' }), ['t4'], "'레그리프트' → 레그 리프트 드리프트(예전 찾기와 같게)");
  eq(run({ query: '밴드 브레이크' }), ['t1', 't7'], "'밴드 브레이크' → 장비 밴드 + 요소 브레이크(AND)");
  eq(run({ query: '메디신볼 브레이크' }), ['t2'], '보조 요소도 찾음');
  eq(run({ query: '통합' }), ['t5'], '단계로 찾기');
  eq(run({ query: '근력' }), ['t1'], '종류로 찾기');
  eq(run({ query: '  ' }).length, D.length, '공백만이면 전체');
  /* 거르기 — 묶음 안 OR, 묶음끼리 AND, 범위 AND */
  eq(run({ f: { focusPoints: ['브레이크'] } }), ['t1', 't7', 't3', 't2'], '브레이크: 주 요소 먼저(기초 → 미등록), 보조는 뒤');
  eq(run({ f: { focusPoints: ['브레이크', '드리프트'] } }), ['t1', 't4', 't7', 't3', 't2', 't5'], '두 요소 OR · 주 요소 먼저(같으면 단계 · sortOrder)');
  eq(run({ f: { focusPoints: ['브레이크'], equipment: ['밴드'] } }), ['t1', 't7'], '요소 AND 장비');
  eq(run({ f: { stage: ['기초'] } }), ['t1', 't7', 't4', 't9'].sort((a, b) => D.find((x) => x.id === a)!.sortOrder - D.find((x) => x.id === b)!.sortOrder), '단계 기초만(미등록 빠짐)');
  eq(run({ scope: 'fav', f: { focusPoints: ['브레이크'] } }), ['t1'], '즐겨찾기 AND 요소');
  /* 정렬 — 기본: 기초 · 연결 · 통합 · 모르는 값 · 미등록, 같으면 sortOrder. 이름순은 안정(같은 이름은 기본 꼬리) */
  eq(run({}), ['t1', 't4', 't7', 't9', 't2', 't5', 't8', 't3', 't6'], '기본순');
  eq(run({ sort: 'name' }).slice(0, 2), ['t8', 't9'], '이름순 · 같은 이름은 sortOrder');
  eq([stageRank('기초'), stageRank('통합'), stageRank('새단계'), stageRank(null)], [0, 2, 3, 4], '단계 차례 · null 은 기초로 바꾸지 않음');
  eq(D.find((x) => x.id === 't6')!.stage, null, '미등록 단계 그대로');
  /* 보조로 걸림 · 줄인 이름 · 칸 */
  eq(secondaryMatch(D[1], ['브레이크']), '브레이크', '보조 일치 표시');
  eq(secondaryMatch(D[0], ['브레이크']), null, '주 요소면 표시 안 함');
  eq(D[1].focusPoints[0], '몸통 회전', '주 요소는 바꾸지 않음');
  eq([shortDrillCategory('무브먼트 패턴 드릴'), shortDrillCategory('근력 · 안정 드릴'), shortDrillCategory('나중에 촬영')], ['무브먼트 패턴', '근력 · 안정', '나중에 촬영'], '종류 줄인 이름');
  eq(optionsOf(['맨몸', '밴드', '야구공'], ['밴드', '새 장비', '맨몸']), ['맨몸', '밴드', '새 장비'], '정해 둔 차례 + 새 값 숨기지 않음');
  /* 들어온 곳 — 정해 둔 모양만(바깥 주소 · 아무 경로 거부) */
  const EL = ['드리프트', '브레이크'];
  eq(entryOf({ from: 'analysis', result: 'abc-123', el: '브레이크' }, EL), { from: 'analysis', result: 'abc-123', el: '브레이크', pos: null, phase: null }, '분석 진입');
  eq(entryOf({ from: 'analysis', result: 'https://evil.example/x', el: '<b>' }, EL), { from: 'analysis', result: null, el: null, pos: null, phase: null }, '이상한 결과 번호 · 요소 거부');
  eq(entryOf({ from: 'mechanics', pos: '2/3', phase: 'input', result: 'x' }, EL), { from: 'mechanics', result: null, el: null, pos: '2/3', phase: 'input' }, '훈련 진입 · 결과 번호 무시');
  eq(entryOf({ from: 'elsewhere' }, EL).from, 'library', '모르는 출처는 일반 목록');
  eq(entryParams(entryOf({ from: 'analysis', result: 'r1', el: '브레이크' }, EL)), { from: 'analysis', result: 'r1', el: '브레이크' }, '상세로 넘길 값');
  eq(entryParams(entryOf({}, EL)), {}, '일반 목록은 넘길 값 없음');
  /* 수백 개 — 전체를 거르고 정렬(앞 일부만 아님) */
  const many = Array.from({ length: 600 }, (_, i) => dr(`m${i}`, `드릴 ${i}`, [EL[i % 2]], ['기초', '연결', '통합', null][i % 4], i % 3 ? ['밴드'] : ['맨몸'], 600 - i));
  const t0 = performance.now();
  const hit = browseDrills(many, dv({ query: '드릴', f: { focusPoints: ['브레이크'], equipment: ['밴드'] } }), () => false);
  eq(hit.length, many.filter((g) => g.focusPoints[0] === '브레이크' && g.equipment[0] === '밴드').length, '600개 전체에서 결과 수');
  eq(hit.every((g, i) => i === 0 || stageRank(hit[i - 1].stage) <= stageRank(g.stage)), true, '600개 정렬 차례');
  eq(performance.now() - t0 < 50, true, '600개 한 번 거르기 50ms 안');
}

/* ----------------------------- 별 저장소 ----------------------------- */
type Reply = { favorite: boolean } | { error: string; lost?: boolean };
const sent: { kind: string; id: string; want: boolean }[] = [];
const pending: { resolve: (r: Reply) => void }[] = [];
sync.setFavSender((kind, id, want) => {
  sent.push({ kind, id, want });
  return new Promise<Reply>((resolve) => pending.push({ resolve }));
});
const settle = async (r: Reply) => {
  const p = pending.shift();
  assert.ok(p, '보낸 요청이 있어야 함');
  p.resolve(r);
  await new Promise((r) => setTimeout(r, 0));
};

/* 빠른 두 번 누름 — 하나만 보내고, 끝나면 마지막 바람만 한 번 더 */
sync.wantFav('exercise', 'x', true, false);
sync.wantFav('exercise', 'x', false, false);
sync.wantFav('exercise', 'x', true, false);
eq(sent.length, 1, '보내는 동안 더 누르면 기다림');
eq(sync.favOf('exercise', 'x', false), true, '누른 즉시 보임');
await settle({ favorite: true });
eq(sent.length, 1, '마지막 바람(켬)이 이미 확인된 값이라 더 안 보냄');
eq(sync.favOf('exercise', 'x', false), true, '확인된 켬');
eq(sync.favOf('exercise', 'x', false), true, '늦게 온 옛 목록(꺼짐)이 바꾼 별을 덮지 않음');
eq(sync.favOf('exercise', 'x', true), true, '서버가 따라오면 저장소는 내려놓음');
eq(sync.favOf('exercise', 'x', false), false, '내려놓은 뒤에는 받은 값 그대로');

/* 보내는 동안 반대로 — 첫 답 뒤 마지막 바람을 한 번 더 보냄 */
sent.length = 0;
sync.wantFav('exercise', 'y', true, false);
sync.wantFav('exercise', 'y', false, false);
await settle({ favorite: true });
eq(sent.map((s) => s.want), [true, false], '마지막 바람(끔)을 이어서 보냄');
await settle({ favorite: false });
eq(sync.favOf('exercise', 'y', false), false, '끝은 마지막 바람');
eq(sync.favStatus('exercise', 'y').sending, false, '다 보냄');

/* 서버가 확인한 실패 — 확인된 값으로 되돌리고, 다시 시도는 같은 바람 */
sent.length = 0;
sync.wantFav('exercise', 'z', true, false);
await settle({ error: '없는 운동이에요.' });
eq(sync.favOf('exercise', 'z', false), false, '실패하면 원래 값');
eq(sync.favStatus('exercise', 'z'), { sending: false, error: '없는 운동이에요.', lost: false, canRetry: true }, '실패 알림 · 다시 시도');
sync.retryFav('exercise', 'z', false);
eq(sent.map((s) => s.want), [true, true], '다시 시도는 같은 바람(뒤집기 아님)');
eq(sync.favOf('exercise', 'z', false), true, '다시 시도 중에는 바람이 보임');
await settle({ favorite: true });
eq(sync.favStatus('exercise', 'z').error, null, '성공하면 알림 걷힘');

/* 응답 유실 — 따로 표시 */
sync.wantFav('exercise', 'w', true, false);
await settle({ error: '신호가 없어 저장됐는지 확인하지 못했어요.', lost: true });
eq(sync.favStatus('exercise', 'w').lost, true, '응답 유실 표시');
eq(sync.favOf('exercise', 'w', false), false, '모르면 확인된 값');

/* 드릴 — 2026-10-31 부터 운동처럼 바라는 값(setDrillFavorite). 보내는 동안 바꾸면 마지막 바람을 한 번 더 */
sent.length = 0;
sync.wantFav('drill', 'd1', true, false);
sync.wantFav('drill', 'd1', false, false);
await settle({ favorite: true });
eq(sent.map((s) => [s.kind, s.want]), [['drill', true], ['drill', false]], '드릴도 바라는 값으로 보냄');
await settle({ favorite: false });
eq(sync.favOf('drill', 'd1', false), false, '드릴 끝 값');

/*
 * 드릴 P0 — 서버는 저장했는데 응답만 잃음. 예전 toggle 이면 [다시 시도]가 꺼짐으로 뒤집혔다. 서버를 흉내(바라는 값을 그대로 저장)해
 * 저장 뒤 응답을 잃고, 다시 시도해도 끝이 켬인지 본다.
 */
{
  const server = new Map<string, boolean>();
  const replies: { want: boolean; lose: boolean }[] = [];
  sync.setFavSender(async (_kind, id, want) => {
    server.set(id, want);
    const lose = replies.shift()?.lose ?? false;
    return lose ? { error: '신호가 없어 저장됐는지 확인하지 못했어요.', lost: true } : { favorite: want };
  });
  replies.push({ want: true, lose: true });
  sync.wantFav('drill', 'p0', true, false);
  await new Promise((r) => setTimeout(r, 0));
  eq(server.get('p0'), true, '서버에는 켬이 저장됨');
  eq(sync.favStatus('drill', 'p0'), { sending: false, error: '신호가 없어 저장됐는지 확인하지 못했어요.', lost: true, canRetry: true }, '응답 유실 — 미확인 표시');
  eq(sync.favOf('drill', 'p0', false), false, '모르면 마지막 확정 값');
  sync.retryFav('drill', 'p0', false);
  await new Promise((r) => setTimeout(r, 0));
  eq(server.get('p0'), true, '다시 시도해도 서버는 켬(뒤집히지 않음)');
  eq(sync.favOf('drill', 'p0', false), true, '다시 시도 끝 — 켬');
  eq(sync.favStatus('drill', 'p0').error, null, '알림 걷힘');

  /* 두 드릴은 따로 — 하나가 실패해도 다른 하나는 저장 */
  replies.push({ want: true, lose: true }, { want: true, lose: false });
  sync.wantFav('drill', 'p1', true, false);
  sync.wantFav('drill', 'p2', true, false);
  await new Promise((r) => setTimeout(r, 0));
  eq([sync.favOf('drill', 'p1', false), sync.favOf('drill', 'p2', false)], [false, true], '다른 드릴은 영향 없음');
  eq(sync.favStatus('drill', 'p1').lost && !sync.favStatus('drill', 'p2').error, true, '실패 알림은 그 드릴에만');

  /* 마지막 별 해제 — 늦게 온 옛 목록(켬)이 해제를 덮지 않음 */
  sync.wantFav('drill', 'p2', false, true);
  await new Promise((r) => setTimeout(r, 0));
  eq(sync.favOf('drill', 'p2', true), false, '옛 목록(켬)이 와도 해제 그대로');
  eq(sync.favOf('drill', 'p2', false), false, '서버가 따라오면 내려놓음');
}
/* 다시 차례 보기용 보내기 */
sync.setFavSender((kind, id, want) => {
  sent.push({ kind, id, want });
  return new Promise<Reply>((resolve) => pending.push({ resolve }));
});

/* 계정 바뀜 — 보내던 답을 버리고 별 · 메모 · 목록 조건을 지움 */
sent.length = 0;
sync.saveLibraryView({ ...EMPTY_VIEW, query: '덤벨' });
sync.wantFav('exercise', 'r', true, false);
sync.resetLibrarySync();
await settle({ favorite: true });
eq(sync.favOf('exercise', 'r', false), false, '앞사람 답은 버림');
eq(sync.libraryView().query, '', '목록 조건도 지움');

/* 다른 운동의 상태는 따로 */
sync.wantFav('exercise', 'p', true, false);
eq(sync.favStatus('exercise', 'q').sending, false, '다른 운동은 영향 없음');
await settle({ favorite: true });

/* ----------------------------- 메모 ----------------------------- */
sync.rememberNote('m', '그립 넓게', null);
eq(sync.noteOf('m', null), '그립 넓게', '저장한 메모가 다른 화면에도');
eq(sync.noteOf('m', null), '그립 넓게', '늦게 온 옛 목록(메모 없음)이 덮지 않음');
eq(sync.noteOf('m', '그립 넓게'), '그립 넓게', '서버가 따라옴');
eq(sync.noteOf('m', null), null, '내려놓은 뒤에는 받은 값');
sync.rememberNote('k', null, '옛 메모');
eq(sync.noteOf('k', '옛 메모'), null, '비우고 저장 = 지움');
eq(sync.noteOf('k', '다른 기기 메모'), '다른 기기 메모', '다른 기기에서 바뀐 새 값은 따름');

console.log(`native-library: ${n}개 통과`);
