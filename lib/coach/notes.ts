/**
 * 코치 지식 노트(2026-11-23 김민: "일반적인 모든 야구와 운동에 관한 대답을 해 줄 수 있어야 한다. 틀린 말을 하면 안 되고 여러 개의 믿을 수 있는
 * 자료를 바탕으로") — 투구 · 근력 · 컨디셔닝 · 회복 · 잠 · 영양의 일반 지식을 주제별 짧은 글로. AI 가 일반 질문에 답하기 전에 read_knowledge 로 읽는다.
 *
 * 약속(자체 시험 coach:ai-test 가 지킨다)
 *   - 노트의 주장마다 출처가 둘 넘게(NOTE_SOURCES). 근력 · 회복 · 잠 · 영양 노트(S · R)는 동료 평가 논문 · 학회 · 기관 공식 문서를 쓴다.
 *     다만 시즌 중 웨이트(S03) · 러닝과 유산소(S04) · 코어(S12) · 암케어 시점(R08)은 두 코칭 기관 글을 먼저, 논문은 보조로 쓴다
 *     (2026-11-24 김민: "드라이브라인, 트레드 우선으로 심도 있게"). 그 밖의 S · R 노트는 훈련 회사 · 블로그 · 영상을 안 쓴다.
 *     출처가 하나뿐이거나 근거가 약하면 글에 그렇게 적는다('연구가 적어요' · '결과가 갈려요').
 *   - 투구 노트(P01~P11)는 투구 코칭 기관 두 곳(Driveline · Tread)의 공개 글만 쓴다(2026-11-23 김민: "투구에 관한 건 전부 두 곳에서 · 두 곳만으로").
 *     유료 강좌 · 제품 쪽 · 영상 · 댓글은 안 쓴다. 자체 측정인지(표본 수) · 인용한 연구인지 · 지도 경험인지 · 한 명 사례인지를 글에 그대로 적는다.
 *     자료끼리 엇갈리면 둘 다 적지 않고 더 큰 측정 자료 하나로 통일한다(2026-11-23 김민: "하나로 통일하는 게 일관성이 있다", D8).
 *     두 곳의 현장 방식이 공식 안전 기준과 부딪히면 안전 기준이 이긴다(D8) — 투구 수 · 쉬는 날은 공식 지침과 앱의 투구 계획을 가리킨다.
 *   - 출처 원문을 열어 주장과 맞는지 대조한 것만 쓴다(조사 → 다른 눈으로 원문 대조 → 글). 자료 글을 옮기지 않고 우리 말로 다시 쓴다.
 *   - 사람이 검토한 노트만 AI 에 실린다(review.by — 지식 카드 D3 와 같은 문). 검토 전 노트는 저장소에만 있다.
 *   - 이 사람에게 맞춘 숫자(오늘 공 수 · 세트 · 무게 · 쉬는 날)는 노트에 없다 — 그것은 앱 엔진만 말한다(D1). 노트의 숫자는 자료의 일반 기준이다.
 *   - 화면 · AI 답에 기관 · 회사 이름을 쓰지 않는다(2026-10-09 규칙). 출처 표는 내부 추적용이라 AI 에 안 보낸다.
 * 순수 파일.
 */

export type NoteSourceId = keyof typeof NOTE_SOURCES;

export type KnowNote = {
  id: string;
  /** 주제 이름 — 지시문의 주제 목록 · 찾기에 쓴다 */
  topic: string;
  /** 찾는 낱말(사용자가 쓸 법한 말) */
  keys: readonly string[];
  /** 글 — 해요체, 주장마다 근거 세기를 그대로(강함은 단정, 약함 · 갈림은 그렇게) */
  body: string;
  sources: readonly NoteSourceId[];
  /** 검토자가 적혀야 AI 에 실린다 */
  review: { by: string | null; at: string | null };
};

/** 근거 자료 — 내부 추적용(화면 · AI 에 안 보낸다). 조사 때 원문을 열어 대조한 것만 */
export const NOTE_SOURCES = {
  PM12130397:
    '유소년 구종 · 투구 수와 통증(Lyman 2002, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/12130397/',
  PM21098816:
    '유소년 투수 10년 추적(Fleisig 2011, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/21098816/',
  PM16452269:
    '청소년 투수 부상 위험 요인(Olsen 2006, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/16452269/',
  PM38125451:
    '야구 던지기 속도 훈련 체계적 문헌고찰(Zhang 2023, Heliyon) — https://pubmed.ncbi.nlm.nih.gov/38125451/',
  PM11708700:
    '던지기 속도와 훈련 리뷰(DeRenne 2001, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/11708700/',
  PM22549085:
    '고교 선수 세 가지 훈련 무작위 연구(Escamilla 2012, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/22549085/',
  PM39446825:
    '대학 투수 하체 파워와 구속(King 2025, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/39446825/',
  PM20508476:
    '근력 운동과 어깨 부상 리뷰(Kolber 2010, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/20508476/',
  PM22836608:
    '근력 운동 동작과 어깨 불안정 징후(Kolber 2013, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/22836608/',
  PM21873897:
    '시즌 중 주 1회 근력 유지(Ronnestad 2011, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/21873897/',
  PM16937969:
    '시즌 중 근력 운동 중단과 던지기 속도(Marques 2006, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/16937969/',
  PM34757594:
    '유산소 · 근력 병행 메타분석(Schumann 2022, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/34757594/',
  PM17685676:
    '고교 선수 메디신볼 회전 훈련(Szymanski 2007, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/17685676/',
  PM26102258:
    '핸드볼 메디신볼 훈련과 던지기 속도(Raeder 2015, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/26102258/',
  PM34570055:
    '회전 메디신볼 던지기와 구속(Taniyama 2021, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/34570055/',
  PM26642915:
    '운동 전 스트레칭 체계적 문헌고찰(Behm 2016, Appl Physiol Nutr Metab) — https://pubmed.ncbi.nlm.nih.gov/26642915/',
  PM21659901:
    '정적 스트레칭과 근력 · 파워(Kay 2012, Med Sci Sports Exerc) — https://pubmed.ncbi.nlm.nih.gov/21659901/',
  PM22316148:
    '정적 스트레칭 메타분석(Simic 2013, Scand J Med Sci Sports) — https://pubmed.ncbi.nlm.nih.gov/22316148/',
  PM21694556:
    '성인 운동 권고 입장문(Garber 2011, Med Sci Sports Exerc) — https://pubmed.ncbi.nlm.nih.gov/21694556/',
  PM29381423:
    '어깨 가동 범위와 부상 메타분석(Keller 2018, Sports Health) — https://pubmed.ncbi.nlm.nih.gov/29381423/',
  PM26272516:
    '프로 투수 어깨 가동 범위와 어깨 부상(Wilk 2015, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/26272516/',
  PM24944295:
    '프로 투수 어깨 가동 범위와 팔꿈치 부상(Wilk 2014, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/24944295/',
  PM21685316:
    '고교 선수 어깨 가동 범위와 팔 부상(Shanley 2011, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/21685316/',
  PM41843416:
    '성인 저항운동 입장문(Currier 2026, Med Sci Sports Exerc) — https://pubmed.ncbi.nlm.nih.gov/41843416/',
  PM28834797:
    '무게 범위와 근력 · 근비대 메타분석(Schoenfeld 2017, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/28834797/',
  PM33497853:
    '실패 지점까지 하기 메타분석(Grgic 2022, J Sport Health Sci) — https://pubmed.ncbi.nlm.nih.gov/33497853/',
  PM19204579:
    '저항운동 진행 입장문(2009, Med Sci Sports Exerc) — https://pubmed.ncbi.nlm.nih.gov/19204579/',
  PM19945973:
    '청소년 저항운동 안전 리뷰(Faigenbaum 2010, Br J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/19945973/',
  PM17119361:
    '청소년 근력 운동과 성장 리뷰(Malina 2006, Clin J Sport Med) — https://pubmed.ncbi.nlm.nih.gov/17119361/',
  PM19620931:
    '청소년 저항운동 입장문(Faigenbaum 2009, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/19620931/',
  PM26851290:
    '청소년 선수 저항운동 메타분석(Lesinski 2016, Br J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/26851290/',
  PM23529287:
    '훈련 중단과 근력 체계적 문헌고찰(McMaster 2013, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/23529287/',
  PM10966148:
    '짧은 훈련 중단 리뷰(Mujika 2000, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/10966148/',
  PM12617692:
    '지연성 근육통 리뷰(Cheung 2003, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/12617692/',
  PM14715039:
    '근육 손상과 기능 리뷰(Byrne 2004, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/14715039/',
  PM16503669:
    '근육통 중 다시 운동(Chen 2006, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/16503669/',
  PM27409551:
    '젖산과 지연성 근육통(Schwane 1983, Phys Sportsmed) — https://pubmed.ncbi.nlm.nih.gov/27409551/',
  PM35061213:
    '몸통 근육 훈련 메타분석(Saeterbakken 2022, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/35061213/',
  AM02: '청소년 투수 입장문(ASMI) — https://asmi.org/position-statement-for-adolescent-baseball-pitchers/',
  NS03: '쉬다가 운동 재개 합의 지침(CSCCa · NSCA 2019) — https://www.nsca.com/contentassets/202023e9d6c440dab582d9d87c0f3729/cscca_and_nsca_joint_consensus_guidelines_for.1.pdf',
  PM22336838:
    '찬물 담그기와 근육통 코크란 리뷰(Bleakley 2012, Cochrane Database Syst Rev) — https://pubmed.ncbi.nlm.nih.gov/22336838/',
  PM29755363:
    '운동 뒤 회복 방법 메타분석(Dupuy 2018, Front Physiol) — https://pubmed.ncbi.nlm.nih.gov/29755363/',
  PM26174323:
    '찬물 담그기와 근력 운동 적응(Roberts 2015, J Physiol) — https://pubmed.ncbi.nlm.nih.gov/26174323/',
  PM33146851:
    '찬물 담그기와 훈련 적응 메타분석(Malta 2021, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/33146851/',
  PM31788800:
    '찬물 담그기와 근단백질 합성(Fuchs 2020, J Physiol) — https://pubmed.ncbi.nlm.nih.gov/31788800/',
  PM12853900:
    '투구 뒤 어깨 처치 비교(Yanagisawa 2003, J Sports Med Phys Fitness) — https://pubmed.ncbi.nlm.nih.gov/12853900/',
  PM32694373:
    '대학 투수 투구 뒤 냉각 무작위 연구(Mullaney 2021, Med Sci Sports Exerc) — https://pubmed.ncbi.nlm.nih.gov/32694373/',
  PM32426160:
    '마사지 메타분석(Davis 2020, BMJ Open Sport Exerc Med) — https://pubmed.ncbi.nlm.nih.gov/32426160/',
  PM31024339:
    '폼롤링 메타분석(Wiewelhove 2019, Front Physiol) — https://pubmed.ncbi.nlm.nih.gov/31024339/',
  PM23757486:
    '압박 의류와 회복 메타분석(Hill 2014, Br J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/23757486/',
  PM21735398:
    '스트레칭과 근육통 코크란 리뷰(Herbert 2011, Cochrane Database Syst Rev) — https://pubmed.ncbi.nlm.nih.gov/21735398/',
  PM34025459:
    '운동 뒤 스트레칭 메타분석(Afonso 2021, Front Physiol) — https://pubmed.ncbi.nlm.nih.gov/34025459/',
  PM29663142:
    '정리 운동 리뷰(Van Hooren 2018, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/29663142/',
  PM25051002:
    '모의 경기 투수 젖산(Warren 2015, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/25051002/',
  PMC4434546:
    '성인 수면 시간 합의 권고(Watson 2015, Sleep) — https://pmc.ncbi.nlm.nih.gov/articles/PMC4434546/',
  PM29073412:
    '나이별 수면 시간 권고(Hirshkowitz 2015, Sleep Health) — https://pubmed.ncbi.nlm.nih.gov/29073412/',
  PMC4877308:
    '소아 · 청소년 수면 시간 합의 권고(Paruthi 2016, J Clin Sleep Med) — https://pmc.ncbi.nlm.nih.gov/articles/PMC4877308/',
  PM21731144:
    '수면 늘리기와 농구 수행(Mah 2011, Sleep) — https://pubmed.ncbi.nlm.nih.gov/21731144/',
  PM26325012:
    '수면 늘리기와 테니스 서브(Schwartz 2015, Physiol Behav) — https://pubmed.ncbi.nlm.nih.gov/26325012/',
  PM25028798:
    '청소년 선수 수면과 부상(Milewski 2014, J Pediatr Orthop) — https://pubmed.ncbi.nlm.nih.gov/25028798/',
  PM30888337:
    '청소년 수면과 부상 메타분석(Gao 2019, J Pediatr Orthop) — https://pubmed.ncbi.nlm.nih.gov/30888337/',
  PM33144349:
    '선수 수면 전문가 합의문(Walsh 2021, Br J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/33144349/',
  PM23916998:
    '수면 제한과 테니스 서브 정확도(Reyner 2013, Physiol Behav) — https://pubmed.ncbi.nlm.nih.gov/23916998/',
  PM25315456:
    '수면과 운동 수행 리뷰(Fullagar 2015, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/25315456/',
  DC16: '스포츠 영양 공동 입장문(Thomas 2016, 영양 · 스포츠의학 세 단체 공동) — https://www.dietitians.ca/DietitiansOfCanada/media/Documents/Resources/noap-position-paper.pdf',
  PM28919842:
    '영양 섭취 시점 입장문(Kerksick 2017, J Int Soc Sports Nutr) — https://pubmed.ncbi.nlm.nih.gov/28919842/',
  PM17277604:
    '운동과 수분 보충 입장문(Sawka 2007, Med Sci Sports Exerc) — https://pubmed.ncbi.nlm.nih.gov/17277604/',
  PM28642676:
    '단백질과 운동 입장문(Jäger 2017, J Int Soc Sports Nutr) — https://pubmed.ncbi.nlm.nih.gov/28642676/',
  PM28698222:
    '단백질 보충과 근력 운동 메타분석(Morton 2018, Br J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/28698222/',
  PM24299050:
    '단백질 섭취 시점 메타분석(Schoenfeld 2013, J Int Soc Sports Nutr) — https://pubmed.ncbi.nlm.nih.gov/24299050/',
  PM28070459:
    '운동 전후 단백질 무작위 연구(Schoenfeld 2017, PeerJ) — https://pubmed.ncbi.nlm.nih.gov/28070459/',
  BJ15: '청소년 선수 발달 국제 합의문(Bergeron 2015, Br J Sports Med) — https://bjsm.bmj.com/content/49/13/843',
  AP16: '청소년 수행 향상 물질 부모용 공식 안내(소아과 학회) — https://www.healthychildren.org/English/healthy-living/sports/Pages/Performance-Enhancing-Substances.aspx',
  PM24668620:
    '청소년 선수 영양 입장문(Desbrow 2014, Int J Sport Nutr Exerc Metab) — https://pubmed.ncbi.nlm.nih.gov/24668620/',
  PM27789774:
    '운동 뒤 글리코겐 회복 리뷰(Burke 2017, J Appl Physiol) — https://pubmed.ncbi.nlm.nih.gov/27789774/',
  PMC5634236:
    '선수 수분 보충 입장문(McDermott 2017, J Athl Train) — https://pmc.ncbi.nlm.nih.gov/articles/PMC5634236/',
  PMC4639891:
    '운동성 열 질환 입장문(Casa 2015, J Athl Train) — https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/',
  PM17473783:
    '더위 속 운동 입장문(Armstrong 2007, Med Sci Sports Exerc) — https://pubmed.ncbi.nlm.nih.gov/17473783/',
  PM37036463:
    '운동성 열 질환 전문가 합의(Roberts 2023, Curr Sports Med Rep) — https://pubmed.ncbi.nlm.nih.gov/37036463/',
  PM20489215:
    '프로 투수 시즌 전 어깨 근력과 부상(Byram 2010, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/20489215/',
  PM22293772:
    '투수용 어깨 운동 프로그램 소개(Wilk 2011, Phys Sportsmed) — https://pubmed.ncbi.nlm.nih.gov/22293772/',
  PM31336051:
    '유소년 부상 예방 프로그램 무작위 연구(Sakata 2019, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/31336051/',
  PM29095655:
    '유소년 팔꿈치 부상 예방 프로그램(Sakata 2018, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/29095655/',
  PM28345616:
    '고교 투수 어깨 스트레칭과 부상(Shitara 2017, Sci Rep) — https://pubmed.ncbi.nlm.nih.gov/28345616/',
  PM15611006:
    '투구 뒤 근력 피로(Mullaney 2005, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/15611006/',
  PM35286185:
    '투구 뒤 어깨 회복 시간(Mirabito 2022, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/35286185/',
  PM18668167:
    '회전근개 피로와 어깨 관절 움직임(Teyhen 2008, J Athl Train) — https://pubmed.ncbi.nlm.nih.gov/18668167/',
  PMC3070508:
    '소아 과사용 부상 예방 입장문(Valovich McLeod 2011, J Athl Train) — https://pmc.ncbi.nlm.nih.gov/articles/PMC3070508/',
  PM29630388:
    '청소년 야구 팔 부상 위험 요인 체계적 문헌고찰(Norton 2019, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/29630388/',
  PM26535252:
    '유소년 팔꿈치 통증과 영상 이상(Matsuura 2013, Orthop J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/26535252/',
  PM20189835:
    '유소년 팔꿈치 부상 위험 요인(Harada 2010, J Shoulder Elbow Surg) — https://pubmed.ncbi.nlm.nih.gov/20189835/',
  PM22344048:
    'MLB 선발 쉬는 날과 성적(Bradbury 2012, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/22344048/',
  PM28567429:
    '지침 지킨 유소년 팔꿈치 MRI(Pytiak 2017, Orthop J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/28567429/',
  PM16558126:
    '투수 회복 일수와 근육 손상 지표(Potteiger 1992, J Athl Train) — https://pubmed.ncbi.nlm.nih.gov/16558126/',
  PM21624882:
    '스포츠 음료 · 에너지 드링크 임상 보고(소아과 학회 2011, Pediatrics) — https://pubmed.ncbi.nlm.nih.gov/21624882/',
  PM15805399:
    '수행 향상 물질 정책 성명(Gomez 2005, Pediatrics) — https://pubmed.ncbi.nlm.nih.gov/15805399/',
  PMC5469049:
    '크레아틴 입장문(Kreider 2017, J Int Soc Sports Nutr) — https://pmc.ncbi.nlm.nih.gov/articles/PMC5469049/',
  PM30547033:
    '청소년 크레아틴 리뷰(Jagim 2018, Front Nutr) — https://pubmed.ncbi.nlm.nih.gov/30547033/',
  PM27354458:
    '수행 향상 물질 임상 보고(LaBotz 2016, Pediatrics) — https://pubmed.ncbi.nlm.nih.gov/27354458/',
  PM29540367:
    '보충제 국제 합의문(Maughan 2018, Br J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/29540367/',
  PM33388079:
    '카페인 입장문(Guest 2021, J Int Soc Sports Nutr) — https://pubmed.ncbi.nlm.nih.gov/33388079/',
  DL01: '동작 평가와 동작 바꾸기(Driveline 2018) — https://drivelinebaseball.com/2018/10/pitching-assessments-changing-mechanics',
  DL02: '웨이트룸에서 동작 바꾸기(Driveline 2019) — https://drivelinebaseball.com/blogs/blog/making-movement-changes-weight-room',
  DL03: '동작 분석 보고서 읽는 법(Driveline 2019) — https://drivelinebaseball.com/2019/03/interpret-biomechanics-reports',
  DL04: '동작 분석으로 선수 키우기 사례 1(Driveline 2022) — https://drivelinebaseball.com/blogs/blog/dillon-tate-using-biomechanics-for-player-development',
  DL05: '동작 분석으로 선수 키우기 사례 2(Driveline 2021) — https://drivelinebaseball.com/blogs/blog/thomas-ruwe-from-not-pitching-in-high-school-to-throwing-98-mph',
  DL06: '8~14세 나이별 투구 동작(Driveline 2022) — https://drivelinebaseball.com/blogs/blog/youth-baseball-pitching-mechanics-analysis-across-age-groups',
  DL07: '동작 분석 6개월 숫자 정리(Driveline 2019) — https://drivelinebaseball.com/2019/02/biomechanics-rewind-look-numbers-last-six-months',
  DL08: '몸통 회전을 늦게 시작하기(Driveline 2013) — https://drivelinebaseball.com/blogs/blog/a-biomechanical-understanding-of-the-late-launch-wolforth-tenet',
  DL10: '앞다리 버티기와 구속의 정량 분석(Driveline 2022) — https://www.drivelinebaseball.com/2022/10/a-quantitative-analysis-of-the-lead-leg-block-and-its-contributions-to-velocity/',
  DL11: '구속을 만드는 앞다리 동작(Driveline 2015) — https://www.drivelinebaseball.com/2015/12/efficient-front-leg-mechanics-that-lead-to-high-velocity/',
  DL12: '인버티드 W 와 투구 동작(Driveline 2010, 2022 고침) — https://drivelinebaseball.com/2010/09/strasburg-the-inverted-w-and-pitching-mechanics',
  DL13: '팔꿈치 수술과 동작 탓(Driveline 2012) — https://drivelinebaseball.com/2012/02/joel-zumayas-injuries-whats-really-to-blame',
  DL14: '팔 벌림 각도 바꾸기(Driveline 2018) — https://drivelinebaseball.com/2018/12/changing-shoulder-abduction',
  DL15: '롱토스의 뜻(Driveline 2017) — https://www.drivelinebaseball.com/2017/04/defining-long-toss/',
  DL16: '롱토스와 롱토스 프로그램(Driveline 2023) — https://drivelinebaseball.com/blogs/blog/everything-long-toss-and-long-toss-programs',
  DL17: '롱토스 훈련의 사실(Driveline 2013) — https://www.drivelinebaseball.com/2013/01/the-facts-behind-long-toss/',
  DL18: '풀다운과 마운드 투구의 팔꿈치 부담 비교(Driveline 2017) — https://www.drivelinebaseball.com/2017/03/comparison-elbow-torques-pulldowns-pitching/',
  DL19: '무게 3~7온스 공 연구 다시 해 보기(Driveline 2021) — https://www.drivelinebaseball.com/2021/03/weighted-ball-training-recreating-and-validating-3-7oz-ball-research/',
  DL20: '무게 공이 동작에 주는 영향 전 구간 분석(Driveline 2021) — https://www.drivelinebaseball.com/2021/03/effects-of-weighted-balls-on-pitching-mechanics-a-full-signal-analysis/',
  DL21: '무게 공 장기 연구 살펴보기(Driveline 2018) — https://www.drivelinebaseball.com/2018/07/look-long-term-weighted-ball-research/',
  DL22: '자체 6주 연구 요약(Driveline 2018) — https://drivelinebaseball.com/blogs/blog/6-week-research-paper-recap',
  DL23: '성장기 선수의 무게 공(Driveline 도움말) — https://help.drivelinebaseball.com/portal/en/kb/articles/can-a-youth-athlete-benefit-from-throwing-weighted-balls-27-1-2022',
  DL24: '점프 · 근력 측정으로 구속 예측(Driveline 2021) — https://www.drivelinebaseball.com/2021/05/predicted-pitch-velocity/',
  DL25: '2019~2020 투구 훈련 구속 결과(Driveline 2021) — https://www.drivelinebaseball.com/2021/06/pitching-training-velocity-results-2019-2020/',
  DL26: '수직 점프 힘과 구속(Driveline 2016) — https://drivelinebaseball.com/blogs/blog/examining-the-relationship-between-vertical-jump-force-and-velocity',
  DL27: '구속과 던지려는 마음(Driveline 2013) — https://www.drivelinebaseball.com/2013/10/role-intent-pitching/',
  DL28: '부상 위험 · 성적 · 구속(Driveline 2019) — https://drivelinebaseball.com/2019/03/injury-risk-performance-velocity',
  DL29: '평지와 마운드의 팔꿈치 부담 비교(Driveline 2017) — https://www.drivelinebaseball.com/2017/08/comparing-flat-ground-mound-elbow-torques/',
  DL30: '센서로 던지기 부담 정의하기(Driveline 2020) — https://www.drivelinebaseball.com/2020/04/what-is-throwing-workload/',
  DL31: '선발 투수를 되살릴 수 있을까(Driveline 2025) — https://drivelinebaseball.com/blogs/blog/return-of-the-starting-pitcher',
  DL32: '직구와 변화구의 팔꿈치 부담(Driveline 2017) — https://www.drivelinebaseball.com/2017/02/fastballs-offspeed-pitches-comparative-relative-elbow-stress/',
  DL33: '변화구와 팔꿈치 부담 다시 보기(Driveline 2017) — https://www.drivelinebaseball.com/2017/11/reviewing-offspeed-pitches-elbow-torque/',
  DL34: '어린 투수가 커브를 던져도 되나(Driveline 2014) — https://drivelinebaseball.com/blogs/blog/youth-pitchers-throw-curveballs-probably',
  DL35: '측정 장비로 구종 만들기 기초(Driveline 2017) — https://drivelinebaseball.com/2017/04/basics-pitch-design-using-rapsodo',
  DL36: '체인지업 던지는 법(Driveline 2020) — https://www.drivelinebaseball.com/2020/06/how-to-throw-a-changeup/',
  DL37: '슬라이더 던지는 법(Driveline 2020) — https://www.drivelinebaseball.com/2020/06/how-to-throw-a-slider/',
  DL38: '커브 던지는 법(Driveline 2020) — https://drivelinebaseball.com/2020/06/how-to-throw-a-curveball',
  DL39: '구종 그립 안내(Driveline 2022) — https://www.drivelinebaseball.com/2022/01/ultimate-guide-baseball-pitch-grips/',
  DL40: '동작과 제구의 관계(Driveline 2026) — https://drivelinebaseball.com/blogs/blog/the-interaction-of-biomechanics-and-command',
  DL41: '제구가 가장 좋았던 투수의 숫자(Driveline 2025) — https://drivelinebaseball.com/blogs/blog/greg-maddux-was-a-unicorn',
  DL42: '겨눈 곳 측정으로 제구를 올린 두 사례(Driveline 2025) — https://drivelinebaseball.com/blogs/blog/how-intended-zones-helped-janson-junk-and-stefan-raeth-to-breakout-seasons',
  DL43: '제구 훈련과 속도 · 정확도 맞바꿈(Driveline 2018) — https://www.drivelinebaseball.com/2018/09/command-training-closer-look-speed-accuracy-trade-off/',
  DL44: '무게 · 크기를 바꾼 제구 공(Driveline 2018) — https://www.drivelinebaseball.com/2018/09/differential-command-balls/',
  DL45: '팀 연습에 제구 훈련 넣기(Driveline 2018) — https://www.drivelinebaseball.com/2018/09/implementing-command-training-team-practice/',
  DL46: '부담 · 가동 범위 · 시즌 초 부상(Driveline 2019) — https://drivelinebaseball.com/2019/03/workload-range-motion-early-season-injuries',
  DL47: '오프시즌 던지기 프로그램(Driveline 2020) — https://www.drivelinebaseball.com/2020/09/off-season-throwing-program/',
  DL48: '성장기 선수가 쉬어야 하는 기간(Driveline 도움말) — https://help.drivelinebaseball.com/portal/en/kb/articles/what-is-the-amount-of-time-off-from-baseball-that-you-recommend-for-a-youth-athlete-27-1-2022',
  DL49: '성장기 야구의 건강과 발달 1부(Driveline 2025) — https://drivelinebaseball.com/blogs/blog/optimizing-for-health-development-in-youth-baseball-part-1',
  TA01: '무게 공 훈련 4주 입문(Tread, 공개 PDF) — https://treadathletics.com/wp-content/uploads/2021/05/A-4-Week-Intro-to-Weighted-Ball-Training.pdf',
  TA02: '고관절 뼈 모양과 맞는 동작(Tread 2019) — https://treadathletics.com/how-does-hip-anatomy-affect-your-ideal-mechanics/',
  TA03: '힘을 주는 세 가지 방식과 구속(Tread 2019) — https://treadathletics.com/muscling-up/',
  TA04: '팔을 밀어 던지는 동작의 원인 일곱(Tread 2019) — https://treadathletics.com/7-causes-of-pushing/',
  TA05: '밴드 운동 세 가지(Tread 2019) — https://treadathletics.com/j-band-exercises/',
  TA06: '빠른 투수 동작 살펴보기 2부(Tread 2020) — https://treadathletics.com/nate-pearson-2/',
  TA07: '다리 쓰기 · 지면 반력과 에너지 흐름(Tread 2021) — https://treadathletics.com/energy-flow/',
  TA08: '팔을 어깨 회전면에 맞추기(Tread 2019) — https://treadathletics.com/plane-of-rotation/',
  TA09: '늦는 팔 고치는 드릴 순서(Tread 2020, 공개 PDF) — https://treadathletics.com/wp-content/uploads/2020/12/Late-Arm-Drill-Progression-PDF.pdf',
  TA10: '팔이 뒤로 젖혀지는 범위 늘리기(Tread 2016) — https://treadathletics.com/external-rotation-throw-harder/',
  TA11: '그날 팔 상태로 세기 정하기(Tread 2015) — https://treadathletics.com/throw-harder-and-recover-quicker-with-auto-regulation/',
  TA12: '근육량과 구속(Tread 2015) — https://treadathletics.com/mass-equals-gas-why-muscle-matters-for-pitching-velocity/',
  TA13: '메디신볼 회전 던지기와 구속(Tread 2022) — https://treadathletics.com/rmbt/',
  TA14: '구속이 오르내리는 까닭 1부(Tread 2018) — https://treadathletics.com/velocity-fluctuation-pt1/',
  TA15: '구종 설계로 경기 성적 올리기(Tread 2026) — https://treadathletics.com/using-pitch-design-to-improve-in-game-performance/',
  TA16: '입스의 이론(Tread 2019) — https://treadathletics.com/yips/',
  TA17: '회복에서 할 것과 말 것 열 가지(Tread 2019) — https://treadathletics.com/recovery-top-10/',
  DL50: '시즌 중 선발 투수 일과 만들기 1부(Driveline 2016) — https://www.drivelinebaseball.com/2016/09/building-season-training-routine-starting-pitchers-part/',
  DL51: '시즌 중 선발 투수 일과 만들기 2부(Driveline 2016) — https://drivelinebaseball.com/blogs/blog/building-season-training-routine-starting-pitchers-part-ii',
  DL52: '시즌 중 웨이트의 양 · 강도 · 피로 관리(Driveline 2017) — https://www.drivelinebaseball.com/2017/03/season-lifting-managing-volume-intensity-fatigue/',
  DL53: '시즌 중 훈련이 중요한 까닭 사례(Driveline 2021) — https://drivelinebaseball.com/blogs/blog/case-study-the-importance-of-in-season-training',
  DL54: '팀 시즌 중 훈련 계획 1부(Driveline 2017) — https://www.drivelinebaseball.com/2017/01/building-teams-season-training-plan-part/',
  DL55: '팀 시즌 중 훈련 계획 2부(Driveline 2017) — https://drivelinebaseball.com/blogs/blog/building-teams-season-training-plan-part-ii',
  DL56: '팀 시즌 중 훈련 계획 3부(Driveline 2017) — https://www.drivelinebaseball.com/2017/01/developing-season-training-routine-part-iii/',
  DL57: '코어 훈련과 올리는 법 1부(Driveline 2016) — https://drivelinebaseball.com/2016/11/core-training-progress-part',
  DL58: '코어 훈련과 올리는 법 2부(Driveline 2016) — https://drivelinebaseball.com/2016/11/core-training-progress-part-ii',
  DL59: '코어 훈련과 올리는 법 3부(Driveline 2016) — https://drivelinebaseball.com/2016/11/core-training-progress-part-iii',
  DL60: '안정성과 투구 동작(Driveline 2017) — https://www.drivelinebaseball.com/2017/05/stability-pitching-mechanics/',
  DL61: '머리 위 메디신볼 던지기(Driveline 2014) — https://www.drivelinebaseball.com/2014/12/velocity-training-perfecting-overhead-medball-throw/',
  DL63: '투수 장거리 달리기의 사실과 대안 둘(Driveline 2016) — https://www.drivelinebaseball.com/2016/09/facts-behind-long-distance-running-pitchers-two-alternatives/',
  DL64: '알맞은 에너지 시스템 훈련(Driveline 2010) — https://www.drivelinebaseball.com/2010/03/appropriate-energy-system-development/',
  DL65: '준비 운동으로 동작 · 체력 · 회복 챙기기(Driveline 2016) — https://drivelinebaseball.com/2016/10/using-warm-movement-quality-conditioning-recovery',
  DL66: '야구 선수 스피드 훈련(Driveline 2021) — https://drivelinebaseball.com/blogs/blog/speed-training-for-baseball-players',
  DL67: '운동 회복의 기초(Driveline 2021) — https://drivelinebaseball.com/blogs/blog/the-basics-of-recovery-for-athletic-performance',
  DL68: '회복 방법을 바꾸는 까닭(Driveline 2020) — https://www.drivelinebaseball.com/2020/10/why-we-are-changing-our-recovery-protocols/',
  DL69: '야구 동적 준비 운동(Driveline 2022) — https://drivelinebaseball.com/blogs/blog/baseball-dynamic-warm-up',
  DL70: '선발 투수의 경기 전 일과(Driveline 2016) — https://www.drivelinebaseball.com/2016/08/starting-pitchers-developing-pre-game-routine/',
  TA18: '시즌 중 훈련 청사진(Tread, 공개 PDF) — https://treadathletics.com/wp-content/uploads/2016/04/In-Season-Training-BluePrint-5.pdf',
} as const satisfies Record<string, string>;

/** 검토 전 — 검토자가 이름 · 날짜를 적으면 AI 에 실린다 */
const DRAFT = { by: null, at: null } as const;

export const KNOW_NOTES: readonly KnowNote[] = [
  {
    id: 'P01',
    topic: '상하체 분리',
    keys: ['상하체분리', '힙숄더', '골반과 어깨', '분리', '꼬임'],
    body: '상하체 분리는 골반이 먼저 돌고 윗몸통이 잠깐 닫힌 채 남는 차이예요. 투구 훈련 기관 한 곳은 각도의 크기보다 골반과 몸통이 도는 시간 차가 더 중요할 수 있다고 봐요. 다른 곳도 분리가 전부는 아니고 도는 순서가 매우 중요하다고 해요. 앞의 기관은 골반 회전이 가장 빠른 순간과 몸통 회전이 가장 빠른 순간 사이가 0.05초 넘게 벌어지는 것을 목표로 삼아요(자체 기준이고 각도는 몇 도라고 정해 두지 않았어요). 동작 분석 사례에서 39도는 충분하다고, 48도는 높은 편이라고 봤어요. 분리가 구속을 정하지는 않아요. 한 투수는 착지 때 분리가 20도에서 31도로 늘며 구속이 시속 2km쯤 올랐지만, 다른 투수는 분리가 줄었는데도 최고 구속이 시속 6km쯤 올랐어요(각각 한 명 사례). 분리는 등뼈와 고관절이 잘 돌아야 나온다고 봐요. 골반을 억지로 빨리 돌리면 허리와 배에 힘이 들어가 오히려 힘 전달이 막힌다고 해요. 골반을 안으로 닫았다 여는 연습이 흔히 쓰이지만 고관절 뼈 모양에 따라 안 맞는 사람도 있어요. 8~14세 99명 측정에서는 나이가 많을수록 분리가 컸어요. 모두 자체 측정과 지도 경험이고, 분리 각도와 구속의 관계를 큰 표본의 숫자로 보인 글은 찾지 못했어요.',
    sources: ['DL01', 'DL02', 'DL03', 'DL04', 'DL05', 'DL06', 'TA01', 'TA02', 'TA03'],
    review: DRAFT,
  },
  {
    id: 'P02',
    topic: '몸이 일찍 열림',
    keys: ['일찍 열림', '일찍 열려', '몸이 열려', '몸통 회전', '열린다'],
    body: '앞발이 닿기 전에 윗몸통이 먼저 돌기 시작하는 것을 흔히 몸이 일찍 열린다고 해요. 투구 훈련 기관 두 곳 모두 골반이 먼저 열리고 윗몸통과 앞어깨는 앞발이 닿을 때까지 닫혀 있는 쪽을 가르쳐요. 한 곳의 동작 분석 182건에서 앞발이 닿는 순간 몸통은 평균 10도 닫혀 있었어요. 다만 같은 자료에서 그 순간의 몸통 각도는 구속과 관련이 없었어요. 그래서 더 닫으면 구속이 오른다고 말할 수는 없어요. 착지 때 골반이 얼마나 열려 있는지도 큰 자료에서 구속과 거의 관련이 없었어요. 일찍 열릴 때 생기는 일로는 팔이 지나갈 길이 없어져 팔을 밀어 던지게 되는 것을 들어요(지도 경험). 한 투수는 착지 때 몸통이 17도 열려 있던 것이 11도로 줄면서 팔이 뒤로 젖혀지는 범위가 늘었어요(한 명 사례). 몸통이 일찍 돌면 팔꿈치가 받는 힘이 커진다는 연구도 인용해요. 고치는 법으로는 느린 동작 반복과 제약을 둔 드릴을 써요. 한 곳은 수건 드릴과 앞으로 뻗으라는 지시가 앞쪽을 일찍 열게 한다고 봐요. 다른 곳도 투수가 홈 쪽으로 곧게 뻗어 나간다는 설명은 틀렸다고 해요.',
    sources: ['DL07', 'DL10', 'DL04', 'DL08', 'TA04', 'TA01', 'TA05', 'TA06'],
    review: DRAFT,
  },
  {
    id: 'P03',
    topic: '앞다리 버티기',
    keys: ['앞다리', '앞무릎', '디딤발', '착지 다리', '무너져', '버티기', '리드 레그'],
    body: '앞발이 닿은 뒤 공을 놓을 때까지 앞무릎이 펴지는 쪽일수록 구속이 높았어요. 투구 훈련 기관의 자체 자료(고교부터 프로, 수천 개 투구)에서 상관은 0.27~0.29로 크지 않아요. 착지 뒤에도 무릎이 계속 굽는 투수가 고쳐서 얻을 것이 가장 많았어요. 무릎이 펴지는 속도(상관 0.20~0.25), 착지 뒤 앞으로 가던 몸을 멈추는 정도(0.20), 앞다리가 땅을 미는 힘(몸무게 영향을 빼고 0.19~0.25)도 약하게 관련됐어요. 힘의 방향은 구속과 뚜렷한 관련이 없었어요. 착지하는 순간의 무릎 · 발목 · 골반 자세는 버티기와 거의 관련이 없었어요. 착지하는 순간 무릎이 움직이는 속도와 착지 뒤 골반 회전도 구속과 거의 관련이 없었어요. 그래서 버티기는 착지 자세가 아니라 착지 뒤에 무릎을 펴는 기술로 봐요. 두 곳 모두 뒷다리로 세게 미는 것은 흔히 생각하는 것만큼 중요하지 않다고 봐요. 모두 관찰 자료라 앞다리를 고치면 구속이 오른다고 단정할 수는 없어요.',
    sources: ['DL10', 'DL11', 'TA07', 'TA01'],
    review: DRAFT,
  },
  {
    id: 'P04',
    topic: '팔 타이밍',
    keys: ['팔이 늦게', '팔이 늦', '인버티드', '팔 스윙', '팔 타이밍', '암 액션'],
    body: '투구 훈련 기관 두 곳이 공통으로 가르치는 것은 앞발이 닿을 때 팔이 이미 올라와 있고, 팔꿈치가 어깨 선 가까이 있고, 날개뼈가 뒤로 모여 있는 것이에요. 한 곳은 여기에 팔에 힘을 빼고 뒤로 젖혀지게 두라는 것을 더해요. 한 곳의 측정에서 잘 던지는 투수는 앞발 착지부터 공을 놓을 때까지 팔 벌림 각도가 평균 90도쯤이었어요(평균이지 규칙은 아니에요). 앞발이 닿을 때 던지는 팔의 팔꿈치가 어깨 선보다 높이 올라가 있고 팔은 아직 젖혀지지 않은 자세(흔히 인버티드 W)는 그것 하나로 부상을 예측하지 못한다고 봐요. 자체 측정에서 이 자세의 투수는 평균 시속 1.8km쯤 느렸고 어깨에서 새는 에너지가 조금 더 컸어요(표본 수는 밝히지 않았어요). 팔이 늦게 올라오면 착지 뒤 팔뚝이 급하게 젖혀져 팔꿈치 안쪽에 부담이 간다고 설명해요(지도 견해이고 부상 자료는 없어요). 팔꿈치를 어깨 선 앞으로 내밀어 밀어 던지는 것은 너무 무거운 공, 몸이 일찍 열리는 것, 팔에 힘이 들어가는 것에서 온다고 봐요. 팔이 젖혀지는 범위는 프로도 160~185도로 다양하고, 더 크다고 누구에게나 좋은 것은 아니에요. 고치는 법으로는 제약을 둔 드릴과 느린 반복을 주로 써요. 두 곳 모두 팔 동작과 부상을 잇는 자체 자료는 내놓지 않았어요. 팔 모양은 영상이나 3D 분석으로 확인하는 쪽이 좋아요.',
    sources: ['DL12', 'DL13', 'DL14', 'DL03', 'TA04', 'TA08', 'TA09', 'TA10', 'TA01'],
    review: DRAFT,
  },
  {
    id: 'P05',
    topic: '롱토스',
    keys: ['롱토스', '롱 토스', '멀리 던지기', '원투', '캐치볼 거리', '풀다운'],
    body: '롱토스는 거리와 세기를 조금씩 늘려 가는 캐치볼이에요. 투구 훈련 기관 두 곳 모두 쓸모 있는 도구로 보지만, 그것만으로 완성되는 훈련은 아니라고 해요. 매번 가장 멀리 던질 필요도 없어요. 한 곳은 높게 띄워 멀리 보내는 던지기는 롱토스 날마다 하고 가벼운 날에는 그것만 해요. 가까이 들어와 직선으로 세게 던지는 것(풀다운)은 세게 던지는 날에만 8~12개로 제한해요. 다른 곳은 그날 가장 먼 거리에서 5~10개, 풀다운도 5~10개면 충분하다고 해요. 풀다운은 마운드 투구보다 시속 9km쯤 빨랐고 팔꿈치 부담은 평균적으로 마운드 투구와 비슷했어요(25명 측정이고 사람마다 달랐어요). 그래서 풀다운도 마운드 투구만큼 부담되는 던지기로 세라고 해요. 높게 띄우는 던지기와 직선 던지기의 부담 차이는 아직 연구되지 않았다고 스스로 밝혀요. 가장 멀리 던지는 롱토스는 조심해서 쓰라는 연구도 인용해요. 롱토스 거리가 늘어난 만큼 마운드 구속이 오르지는 않아요. 옆으로 던지는 투수, 가라앉는 공이 무기인 투수, 팔꿈치가 낮게 끌리는 투수에게는 높게 띄우는 롱토스가 안 맞을 수 있어요(지도 경험). 거리와 개수는 지도 경험에서 나온 숫자예요. 오늘 던질 양은 앱의 투구 계획을 따르면 돼요.',
    sources: ['DL15', 'DL16', 'DL17', 'DL18', 'TA01', 'TA11', 'TA08'],
    review: DRAFT,
  },
  {
    id: 'P06',
    topic: '웨이티드볼',
    keys: [
      '웨이티드볼',
      '웨이티드 볼',
      '무거운 공',
      '가벼운 공',
      '플라이오볼',
      '무게 공',
    ],
    body: '무게가 다른 공 훈련에 대해 투구 훈련 기관 두 곳이 말하는 것이에요. 경기 공에 가까운 무게(85~200g쯤)에서는 한 곳의 동작 분석(26명)에서 무게에 따라 팔꿈치 · 어깨에 걸리는 힘이 뚜렷하게 달라지지 않았고 동작 차이도 작았어요. 다만 한 번 던질 때의 측정이에요. 훈련을 오래 했을 때의 영향은 훈련 연구가 더 필요하다고 스스로 밝혀요. 청소년 연구(13~18세, 6주)에서 훈련한 17명 중 4명이 다치고 안 한 쪽은 다친 사람이 없었던 결과도 다뤄요. 이 기관은 그 집단의 전체 던지기 양이 더 많았다고 반론하면서도, 무게 공으로 세게 던지는 날이 일주일에 두 번을 넘으면 많다는 데는 동의해요. 자체 6주 연구(17명)에서는 집단 전체의 구속 변화가 없었고 9명은 오르고 8명은 내렸어요. 두 곳 모두 서서히 늘리는 준비 기간(4주쯤)을 먼저 두라고 하고, 한 곳은 근력 바탕도 먼저 요구해요. 아주 무거운 공은 세게 던지는 용도가 아니라 힘을 낮춰 동작을 익히는 용도로 써요. 이곳은 2kg 공을 쓰다가 팔을 미는 동작과 불편함이 자주 보여서 뺐어요. 다른 곳은 만 14세 미만에게 가죽으로 된 무게 공을 쓰지 않아요. 뻐근함은 괜찮지만 찌릿하거나 날카롭거나 오래가는 통증은 멈추라는 신호예요. 세게 던지는 훈련은 어떤 공으로 하든 부상 위험이 따른다고 해요. 성장기에는 특히 조심하고 지도자와 상의해서 해요.',
    sources: ['DL19', 'DL20', 'DL21', 'DL22', 'DL23', 'DL47', 'TA01', 'TA04'],
    review: DRAFT,
  },
  {
    id: 'P07',
    topic: '구속과 관련된 것',
    keys: [
      '구속 올리',
      '구속을 올',
      '구속 향상',
      '구속 늘',
      '빠르게 던지',
      '볼 스피드',
    ],
    body: '투구 훈련 기관 두 곳이 구속의 바탕으로 꼽는 것은 몸의 힘이에요. 한 곳은 점프와 근력 측정만으로 구속을 예측하는 식을 만들었는데, 구속 차이의 절반쯤을 설명했고 평균 오차는 시속 4km쯤이었어요. 크게 반영된 것은 점프의 파워와 탄력, 당기는 최대 힘이었어요. 예측보다 빠르게 던지는 선수는 근력과 파워를, 예측보다 느리게 던지는 선수는 던지는 기술을 먼저 보라고 해요. 다른 곳은 아마추어가 느린 가장 큰 까닭을 근육량과 힘 부족으로 봐요(지도 견해). 수직 점프의 힘은 구속과 거의 관련이 없었어요(29명 측정). 메디신볼 회전 던지기가 구속과 관련됐다는 연구를 인용하고, 옆으로 뛰는 점프는 연구마다 결과가 갈려요. 자세 하나가 구속을 정하지는 않아요. 동작 분석 182건에서 구속과 강하게 관련된 자세 지표는 없었고, 관련된 것은 움직임의 속도였어요. 오르는 폭도 크지 않아요. 훈련한 선수 자료에서 평균 시속 3km쯤 올랐고, 절반쯤이 시속 1.6km 넘게 올랐고, 다섯에 하나는 오히려 내렸어요. 200일 넘게 훈련한 35명은 평균 시속 5km쯤 올랐어요. 훈련받은 선수만의 자료이고 견줄 집단은 없어요. 세게 던지려는 마음만으로 구속이 생기지는 않고, 전력으로 던지는 개수를 늘린다고 더 오르지도 않는다고 해요. 같은 투수 안에서는 구속이 오를수록 팔꿈치 부담도 같이 커진다는 연구를 인용해요.',
    sources: ['DL24', 'DL25', 'DL07', 'DL26', 'DL27', 'DL28', 'TA12', 'TA13', 'TA01'],
    review: DRAFT,
  },
  {
    id: 'P08',
    topic: '구종과 팔 부담',
    keys: ['커브', '슬라이더', '체인지업', '변화구', '구종', '직구', '그립'],
    body: '투구 훈련 기관의 센서 측정에서 팔꿈치에 걸리는 힘은 직구가 가장 컸고 커브 · 슬라이더 · 체인지업은 그보다 낮았어요. 다만 구속으로 나누어 보면 변화구 쪽이 더 높게 나왔고, 어느 숫자를 기준으로 삼아야 할지는 아직 모른다고 스스로 밝혀요. 대학 투수 연구에서는 체인지업이 가장 낮았고, 프로 투수 연구에서도 직구와 슬라이더가 체인지업보다 높았다고 인용해요. 커브가 어린 선수의 부상을 늘리는지는 연구가 엇갈린다고 봐요. 그래도 만 14세 미만에게는 커브와 슬라이더를 권하지 않아요. 부상이 증명돼서가 아니라 복잡한 동작을 매번 같게 되풀이할 조절 능력이 아직 덜 자랐기 때문이에요. 그 나이에는 좋은 몸 움직임과 직구 제구를 먼저 익히라고 해요. 구종을 만드는 일은 정해진 한 가지 그립을 배우는 것이 아니에요. 그립과 손 느낌을 바꿔 가며 측정으로 확인하는 과정이에요. 그립은 공의 움직임을 만드는 수단일 뿐이에요. 일반적인 기준으로 체인지업은 직구보다 시속 13~19km, 슬라이더는 10~16km, 커브는 16~24km 느려요. 같은 지시도 사람마다 다르게 받아들여요. 새 구종은 구속과 제구가 먼저 갖춰진 뒤에, 동작을 크게 고치는 중이 아닐 때 더하라고 해요. 팔 각도에 따라 맞는 구종이 달라서 지도자와 직접 맞추는 것이 좋아요.',
    sources: ['DL32', 'DL33', 'DL34', 'DL35', 'DL36', 'DL37', 'DL38', 'DL39', 'TA15'],
    review: DRAFT,
  },
  {
    id: 'P09',
    topic: '제구',
    keys: ['제구', '컨트롤', '커맨드', '스트라이크', '로케이션', '볼넷'],
    body: '투구 훈련 기관은 제구를 스트라이크 비율이 아니라 겨눈 곳에서 얼마나 빗나갔는지로 재요. MLB 투수도 직구가 겨눈 곳에서 평균 28~30cm 빗나가요. 제구가 가장 좋았던 투수도 겨눈 곳에 맞힌 공은 셋에 하나쯤이었어요. 힘을 빼고 던지면 스트라이크가 는다는 생각은 근거가 약하다고 봐요. 힘을 빼면 몸의 순서가 흐트러져 오히려 제구가 나빠질 수 있어서, 제구 연습도 체감 70%가 넘는 세기로 하라고 권해요. 연습 방법으로 두 곳 모두 공의 무게 · 크기 · 거리를 바꿔 가며 던지는 것을 권해요. 한 곳은 몸의 느낌을 살피기보다 공의 회전처럼 바깥에서 보이는 것에 주의를 두라고 해요. 두 곳 모두 동작을 계속 의식해서 고치게 하는 것은 도움이 안 된다고 봐요. 한 곳은 빗나간 방향을 적어 두라고 하고, 다른 곳은 그물만 보고 던지기보다 사람에게 던지라고 해요. 동작 분석(27명, 270구)에서는 앞발 착지 순간의 자세가 매번 비슷한 투수가 덜 빗나갔어요. 반대로 공을 놓기 직전의 미세한 조정은 더 다양한 투수가 덜 빗나갔어요. 똑같이 되풀이하는 것만이 답은 아니라는 뜻이에요. 다만 이 기관 스스로 검증된 제구 훈련법은 아직 없고 무게를 바꾼 공의 효과도 증명되지 않았다고 밝혀요. 나아진 숫자는 선수 두 명의 사례뿐이에요. 제구는 주마다 오르내리는 것에 매달리지 말고 긴 기간의 흐름으로 보라고 해요. 못 던진 날 화가 나서 더 던지는 것은 해롭다고 해요.',
    sources: ['DL40', 'DL41', 'DL42', 'DL43', 'DL44', 'DL45', 'TA16', 'TA01', 'TA15'],
    review: DRAFT,
  },
  {
    id: 'P10',
    topic: '피로와 많이 던지기',
    keys: [
      '피로',
      '지쳐',
      '연투',
      '많이 던',
      '오프시즌',
      '쉬는 기간',
      '혹사',
      '쇼케이스',
    ],
    body: '투구 훈련 기관 두 곳 모두 던지는 부담을 경기 공 수만이 아니라 모든 던지기의 개수와 세기로 세라고 해요. 몸풀기, 캐치볼, 연습 투구도 들어가요. 부상은 시즌 초에 많고, 쉬다가 갑자기 많이 세게 던지는 것이 한 원인일 수 있다고 봐요(가설). 그래서 쉰 뒤에는 4주쯤 서서히 늘리고, 오래 쉬었을수록 그 기간도 길게 잡으라고 해요. 한 곳은 최근 9일의 부담을 지난 4주 평균과 견줘 0.7~1.3배 안에 두는 것을 기준으로 써요. 다만 이 범위는 주로 다른 종목 연구에서 왔고 야구 연구는 적다고 스스로 밝혀요. 다른 곳은 매일 팔 상태를 1~10으로 매겨 그날 세기를 정해요. 세게 던지는 날은 일주일에 두 번쯤, 한 번에 15~20개로 적게 잡아요. 성장기 선수에게는 한 해에 두 달은 이어서 머리 위로 던지는 것을 쉬고 공식 투구 수 지침을 따르라고 해요. 지친 채 던지는 것이 어린 선수의 어깨 · 팔꿈치 부상과 강하게 관련됐다는 연구도 인용해요. 하루에 두 번 던지기, 전날 마무리로 던지고 다음 날 선발로 나가기, 투수를 한 날 포수까지 보는 것은 피하라고 해요. 팔이 축 처지는 느낌과 들쭉날쭉한 구속이 보이면 던진 양 전체를 다시 살피라고 해요. 진통제나 얼음으로 뻐근함을 덮고 계속 던지지 말라고 해요. 쉬는 날과 공 수는 앱의 투구 계획을 따르면 돼요.',
    sources: ['DL30', 'DL46', 'DL47', 'DL48', 'DL49', 'TA11', 'TA01', 'TA14', 'TA17'],
    review: DRAFT,
  },
  {
    id: 'P11',
    topic: '평지와 마운드 · 힘 조절',
    keys: [
      '평지',
      '마운드',
      '플랫 그라운드',
      '살살',
      '힘 빼고',
      '강도 조절',
      '가볍게 던',
    ],
    body: '평지에서 가볍게 던지는 공도 팔에 공짜는 아니에요. 투구 훈련 기관의 센서 측정(대학 투수 25명)에서 평지 투구는 실전 투구보다 시속 16km쯤 느렸지만 팔꿈치에 걸리는 힘은 조금만 낮았어요. 25명 중 10명은 평지에서 오히려 더 높았어요. 힘을 빼는 것도 느낌만큼 되지 않아요. 70~80%로 던지라고 했을 때 선수들은 평균 최고 구속의 89%로 던졌고, 시킨 범위에 든 선수는 한 명뿐이었어요. 인용한 연구에서는 마운드에서 체감 60%로 던져도 팔에 걸리는 힘은 최대의 75%쯤이었어요. 그래서 체감 80%가 부담 80%는 아니라고 정리해요. 이 기관은 던지기 하나하나를 팔꿈치에 걸린 힘으로 무게를 매겨 하루 부담을 더하고, 센 공일수록 더 크게 쳐요. 다른 기관도 같은 쪽이에요. 몸풀기와 연습 투구까지 다 세고, 평지 투구는 한 번에 10~25개면 충분하다고 해요. 가벼운 날에 세기가 올라가는 것을 흔한 실수로 꼽아요. 그래서 가볍게 던지는 날도 공 수로 세어야 하고, 앱이 체감 강도와 공 수를 같이 적게 하는 까닭이에요.',
    sources: ['DL29', 'DL30', 'DL31', 'TA14', 'TA11', 'TA01', 'TA17'],
    review: DRAFT,
  },
  {
    id: 'S01',
    topic: '근력 운동과 구속',
    keys: [
      '스쿼트',
      '데드리프트',
      '하체 운동',
      '웨이트 하면',
      '근력 운동',
      '하체 근력',
    ],
    body: '저항 운동을 한 프로그램은 대체로 던지는 속도를 올렸어요(체계적 문헌고찰과 리뷰, 주로 청소년 · 대학 선수). 스쿼트와 데드리프트 중 어느 쪽이 구속에 더 좋은지 직접 비교한 연구는 찾지 못했어요. 서로 다른 프로그램을 비교한 고교 선수 연구에서도 어느 하나가 더 낫다고 나오지 않았고, 오른 폭은 1~2%로 작았어요. 대학 투수에서 하체가 내는 힘의 절대 크기와 몸무게가 구속과 관련됐어요. 점프 높이 자체는 관련이 약했어요. 그래서 한 가지 운동을 정답으로 꼽기보다 하체와 온몸의 힘을 꾸준히 기르는 쪽이 근거에 맞아요. 어떤 운동을 얼마나 할지는 앱이 오늘 몸 상태와 일정에 맞춰 짜요.',
    sources: ['PM38125451', 'PM11708700', 'PM22549085', 'PM39446825'],
    review: DRAFT,
  },
  {
    id: 'S02',
    topic: '벤치프레스와 머리 위 프레스',
    keys: [
      '벤치프레스',
      '벤치 프레스',
      '오버헤드 프레스',
      '밀리터리 프레스',
      '숄더 프레스',
      '프레스',
    ],
    body: '투수가 벤치프레스나 머리 위로 미는 운동을 하면 해롭다거나 이롭다는 것을 직접 본 연구는 찾지 못했어요. 일반 웨이트 인구에서는 근력 운동 부상의 많게는 3분의 1쯤이 어깨에서 생겨요(리뷰, 대부분 뒤돌아본 조사). 팔을 벌리고 뒤로 젖힌 자세가 되는 운동(목 뒤로 당기기 · 밀리터리 프레스)은 어깨 앞쪽 불안정 징후와 관련이 있었어요(일반 웨이트 인구 연구 하나, 원인이라는 증거는 아니에요). 같은 연구에서 어깨 바깥 돌림 근육 운동은 그 징후가 적은 것과 관련됐어요. 그래서 금지할 근거도 꼭 해야 할 근거도 약해요. 어깨가 불편한 자세는 피하고, 불편함이 이어지면 트레이너나 의사와 상의하는 것이 좋아요.',
    sources: ['PM20508476', 'PM22836608'],
    review: DRAFT,
  },
  {
    id: 'S03',
    topic: '시즌 중 웨이트',
    keys: ['시즌 중', '시즌중', '인시즌', '경기 기간', '유지'],
    body: '투구 훈련 기관 두 곳 모두 시즌 중에도 웨이트를 이어 가라고 해요. 시즌 중에는 오프시즌에 만든 힘을 잃지 않는 것이 먼저이고, 어린 선수일수록 시즌 중에도 조금씩 늘 수 있다고 봐요. 한 기관 사례에서 시즌 중 일주일에 하체 운동 하나만 한 대학 투수는 근력 · 파워가 떨어졌고, 12월 측정 때 시속 145km이던 구속이 시즌 뒤 137km쯤으로 내려갔어요(한 명 사례). 횟수는 일주일에 1~4번이고, 한 곳은 경기가 많은 주에 횟수를 줄여요. 두 곳 모두 무게는 크게 낮추지 않고 세트와 횟수를 줄여요. 평소 무게의 85~100%를 쓰고 양은 절반쯤으로 줄이는 식이에요. 실패할 때까지 하지 않고 2~4회쯤 남기고 끝내요. 다음 날 근육통을 크게 만드는 천천히 내리는 동작은 줄이고, 오프시즌에 해 보지 않은 새 운동은 시즌 중에 시작하지 않아요. 한 곳은 시즌 중 위험에 비해 보탬이 작은 운동으로 클린 · 바벨 스내치 · 높은 박스 점프 · 딥스를 들고 비슷한 다른 운동으로 바꾸라고 해요. 선발은 등판 직후나 다음 날 운동을 시작하고 등판 전날에는 무거운 운동을 하지 않아요(쉬거나 양을 적게). 많이 던진 주나 몸이 무거운 날은 세트를 한두 개 빼요. 연구로는 다른 종목에서 근력 운동을 주 1번만 해도 12주 동안 근력이 유지됐고, 시즌 중 근력 운동을 끊은 핸드볼 선수는 던지는 속도가 떨어졌어요. 여기 든 자료 가운데 투수를 직접 본 통제된 연구는 없어요. 언제 얼마나 할지는 앱이 등판 일정에 맞춰 정해요.',
    sources: [
      'DL50',
      'DL51',
      'DL52',
      'DL53',
      'DL54',
      'DL55',
      'DL56',
      'TA18',
      'TA14',
      'PM21873897',
      'PM16937969',
    ],
    review: DRAFT,
  },
  {
    id: 'S04',
    topic: '러닝과 유산소',
    keys: [
      '러닝',
      '달리기',
      '장거리',
      '스프린트',
      '유산소',
      '폴 러닝',
      '조깅',
      '인터벌',
    ],
    body: '투구 훈련 기관 두 곳 모두 투수에게 장거리 달리기나 폴 러닝을 권하지 않아요. 투구는 짧게 힘을 쓰고 쉬는 일이라 오래 달리는 힘과는 다르다고 봐요. 달려서 젖산을 빼야 근육통이 풀린다는 말은 두 곳 모두 틀렸다고 해요. 다만 등판 다음 날 달리면 덜 뻐근한 느낌은 실제로 있다는 말과, 낮은 강도의 유산소가 몸을 쉬는 상태로 돌려 회복을 돕는다는 설명은 있어요. 그래서 오래 달리기 대신 짧은 인터벌과 템포 달리기를 써요. 한 곳은 40~60야드를 최고 속도의 70~80%로 달리고 걸어 돌아오기를 15~30분 해요. 다른 곳은 20초 운동하고 20초 쉬기 12~16번(70%쯤)과 8초 전력, 52초 쉬기 8~12번을 나눠 써요. 이곳은 평지 스프린트, 특히 내리막 달리기가 근육통을 크게 만든다며 썰매 밀기 · 자전거 · 계단을 권해요. 회복을 위해 가볍게 움직이는 것은 두 곳 모두 좋다고 봐요. 자전거 · 걷기 · 가벼운 순환 운동을 8~25분쯤, 다음 날 다리가 무겁지 않을 만큼 해요. 30분씩 세게 타는 자전거처럼 회복이라고 부르지만 피로를 더하는 운동은 피하라고 해요. 한 곳은 유산소를 어중간한 강도로 하면 힘과 파워가 덜 는다는 연구를 인용해요. 메타분석으로는 같이 해도 최대 근력은 평균적으로 줄지 않았지만 순발력은 덜 늘었고, 같은 날 붙여 할 때 더 그랬어요. 팀에서 이미 많이 뛰면 따로 더하지 말라고 해요. 여기 든 두 곳의 글에는 달리기가 투수의 구속이나 회복에 주는 효과를 잰 자체 자료가 없어요.',
    sources: [
      'DL63',
      'DL64',
      'DL65',
      'DL66',
      'DL67',
      'TA17',
      'TA18',
      'TA01',
      'PM34757594',
    ],
    review: DRAFT,
  },
  {
    id: 'S05',
    topic: '메디신볼',
    keys: ['메디신볼', '메디신 볼', '메디슨볼', '회전 파워', '회전 운동'],
    body: '고교 야구 선수 연구에서 웨이트와 스윙 연습에 메디신볼 회전 운동을 더한 쪽이 몸통 회전 근력과 배트 속도가 더 많이 늘었어요(같은 연구진의 논문 둘). 던지는 속도는 다른 종목 자료예요. 핸드볼 선수가 6주 메디신볼 훈련 뒤 던지는 속도가 늘었어요. 대학 야구 선수 연구 하나에서 회전 메디신볼 던지기 속도와 구속이 중간 정도 관련됐어요(투수 수가 적고 관련만 본 연구예요). 야구 투수가 메디신볼 훈련만으로 구속이 오르는지 확인한 연구는 찾지 못했어요. 몸통을 돌려 힘을 내는 연습이라 투구와 닮은 움직임이지만, 구속 효과는 아직 추정이에요.',
    sources: ['PM17685676', 'PM26102258', 'PM34570055'],
    review: DRAFT,
  },
  {
    id: 'S06',
    topic: '워밍업과 스트레칭',
    keys: ['워밍업', '스트레칭', '몸풀기', '가동성', '유연성', '준비 운동'],
    body: '한 근육을 60초 넘게 가만히 늘리는 스트레칭은 직후 근력 · 파워를 몇 퍼센트 떨어뜨려요. 60초 안이면 영향이 아주 작아요(체계적 문헌고찰 둘). 가만히 늘리는 스트레칭만으로 워밍업을 끝내는 것은 피하는 쪽이 좋아요. 뒤에 움직이면서 하는 준비 운동을 이으면 뚜렷한 손해가 없었어요. 움직이면서 하는 스트레칭 · 워밍업은 직후 수행을 조금 올려요. 그래서 운동 · 투구 전에는 움직이면서 몸을 풀고, 길게 늘리는 스트레칭은 가동 범위를 넓히려는 목적으로 따로(운동 뒤나 다른 시간에) 하는 쪽이 근거에 맞아요. 스트레칭이 전체 부상을 줄인다는 뚜렷한 근거는 없어요.',
    sources: ['PM26642915', 'PM21659901', 'PM22316148', 'PM21694556'],
    review: DRAFT,
  },
  {
    id: 'S07',
    topic: '어깨 가동 범위',
    keys: ['어깨 가동', '내회전', '외회전', '가동 범위', '어깨 유연', '거드', 'gird'],
    body: '던지는 어깨는 안쪽 돌림이 줄고 바깥 돌림이 느는 쪽으로 바뀌는 일이 흔해요. 안쪽 돌림이 줄어든 것만으로 부상을 예측한다는 근거는 일관되지 않아요. 메타분석에서 통계적으로 뚜렷하지 않았어요. 프로 투수 추적 연구에서는 양쪽 어깨의 전체 돌림 범위 차이가 5도 넘게 모자란 투수의 부상(주로 팔꿈치)이 더 많았고, 던지는 쪽 바깥 돌림이 충분히 늘지 않은 투수의 어깨 부상이 더 많았어요(한 구단 · 같은 연구진). 고교 선수 연구 하나에서는 안쪽 돌림이 25도 넘게 줄어든 경우 팔 부상이 더 많았어요. 각도는 전문가가 재야 하고 숫자 하나로 판단할 수 없어요. 어깨가 걸리거나 아프면 체크인에 적고 전문가와 상의해 주세요.',
    sources: ['PM29381423', 'PM26272516', 'PM24944295', 'PM21685316'],
    review: DRAFT,
  },
  {
    id: 'S08',
    topic: '세트와 횟수의 원리',
    keys: [
      '세트',
      '횟수',
      '몇 세트',
      '몇 회',
      '반복',
      '실패 지점',
      '근비대',
      '점진적 과부하',
    ],
    body: '성인 일반 기준이에요. 이 사람의 오늘 세트 · 무게는 앱이 정해요. 최대 근력은 무거운 무게(한 번 들 수 있는 무게의 80%쯤부터)를 끝까지 움직여 2~3세트, 주 2번 넘게 할 때 잘 늘어요. 근육 크기는 무게보다 양(한 근육에 주 10세트쯤부터)이 더 중요하고, 가벼운 무게로도 비슷하게 늘 수 있어요. 파워는 가볍거나 중간 무게(30~70%쯤)를 빠르게, 적은 양으로 할 때 늘어요. 더 못 들 때까지 하는 것은 근력과 근육 크기를 늘리는 데 꼭 필요하지 않아요. 무게는 정한 횟수보다 한두 번 더 할 수 있게 되면 조금(2~10%) 올리는 것이 오래된 표준 권고예요.',
    sources: ['PM41843416', 'PM28834797', 'PM33497853', 'PM19204579'],
    review: DRAFT,
  },
  {
    id: 'S09',
    topic: '성장기 웨이트',
    keys: [
      '성장기',
      '성장판',
      '키 안 커',
      '어린 선수 웨이트',
      '중학생 웨이트',
      '청소년 웨이트',
    ],
    body: '자격 있는 사람이 지도한 청소년 근력 운동 연구에서 성장판 손상은 보고되지 않았고, 성장과 성숙에 나쁜 영향도 없었어요(리뷰 둘). 어린 선수의 웨이트 부상은 주로 지도 없이 하거나, 자세가 나쁘거나, 무게가 지나칠 때 생겼어요. 근력 운동은 청소년 선수의 근력과 점프를 늘려요(메타분석). 그래서 웨이트가 키를 막는다는 말은 근거가 없어요. 다만 지도를 받으면서 자세를 먼저 익히고 무게는 천천히 올려야 해요.',
    sources: ['PM19945973', 'PM17119361', 'PM19620931', 'PM26851290'],
    review: DRAFT,
  },
  {
    id: 'S10',
    topic: '쉬다가 다시 시작',
    keys: ['쉬다가', '오래 쉬', '다시 시작', '복귀', '휴식기', '디트레이닝', '공백'],
    body: '훈련된 선수의 근력은 3주쯤 쉬어도 대체로 유지되고, 그보다 길어지면 점점 빨리 줄어요(체계적 문헌고찰과 리뷰). 유산소 체력은 근력보다 빨리 떨어져요. 2주 넘게 쉬었다가 돌아올 때 대학 선수용 합의 지침은 첫 주 운동량을 평소의 절반 아래로, 둘째 주는 30% 줄인 수준으로 시작하고 쉬는 시간을 길게 두라고 해요. 열사병과 근육 손상을 막으려는 지침이에요. 새 운동이나 버티며 내리는 동작은 1~2주에 걸쳐 조금씩 늘리는 것이 좋아요. 던지기 복귀를 다룬 자료는 아니에요. 무게와 던질 양은 앱이 쉰 기간을 보고 낮춰서 다시 잡아요.',
    sources: ['PM23529287', 'PM10966148', 'NS03', 'PM12617692'],
    review: DRAFT,
  },
  {
    id: 'S11',
    topic: '근육통',
    keys: ['근육통', '알이 배', '알 배', '뻐근', '도ms', 'doms', '젖산'],
    body: '운동 뒤 하루 이틀 지나 오는 근육통은 힘, 파워, 가동 범위를 잠깐 떨어뜨려요(리뷰 둘). 근육통이 남은 채 다시 운동해도 근육 손상이 더 심해지거나 회복이 늦어지지 않았어요(운동선수 대상 실험). 한 번 겪으면 같은 운동에서 덜 아프게 돼요. 다만 그동안 수행이 떨어지니 심한 근육통 뒤 하루 이틀은 강도와 시간을 줄이는 것을 리뷰는 권해요. 근육통은 젖산 때문이 아니에요. 근육통과 찌르는 통증 · 관절 통증은 달라요. 통증은 체크인에 적고 이어지면 전문가와 상의해 주세요.',
    sources: ['PM12617692', 'PM14715039', 'PM16503669', 'PM27409551'],
    review: DRAFT,
  },
  {
    id: 'S12',
    topic: '코어 운동',
    keys: ['코어', '복근', '몸통 근력', '플랭크', '허리 힘'],
    body: '투구 훈련 기관 두 곳 모두 몸통을 다리에서 만든 힘을 팔로 넘기는 연결 고리로 봐요. 골반이 먼저 돌 때 윗몸통이 버티며 닫혀 있어야 한다고 해요. 한 곳은 회전이 허리가 아니라 등에서 나와야 한다고 봐요. 한 곳의 동작 분석 182건에서 빠른 투수일수록 몸통 회전 속도가 빨랐어요. 몸통이 옆으로 많이 기울수록 팔꿈치 · 어깨 부담이 컸고 구속과는 관련이 없었어요. 다른 곳은 허리와 배에 미리 힘을 주면 오히려 힘 전달이 막힌다고 보고, 힘을 줄 때와 뺄 때의 타이밍을 강조해요(지도 경험). 운동의 바탕은 버티기예요. 플랭크 · 데드버그 · 롤아웃처럼 허리가 젖혀지지 않게 버티는 것, 팔로프 프레스 · 촙처럼 몸이 돌아가지 않게 버티는 것, 사이드 플랭크, 무거운 것을 들고 걷기를 써요. 한 곳은 오프시즌 동안 안정(9~12주), 움직이며 안정(8~12주), 파워(4~8주) 순으로 올리라고 해요(지도 경험). 다른 곳의 시즌 중 처방은 앞 · 옆 코어 8~12회 또는 30초, 회전 코어 양쪽 8~12회씩, 각 2세트예요. 파워 쪽은 메디신볼 던지기예요. 회전 메디신볼 던지기 속도가 구속과 관련됐다는 연구(대학 한 팀, 상관 0.62)를 인용하고, 다음 날 덜 뻐근해 시즌 중에도 쓰기 좋다고 해요. 머리 위로 던지는 공은 2kg쯤이고 3kg를 넘기지 않으며 어린 선수는 1~2kg예요(한 곳). 메디신볼은 던지기를 대신하지 않고, 공을 더 던질 수 없을 때 동작 반복을 보태는 운동으로 봐요. 두 곳 모두 코어 운동만으로 구속이 오른다는 자료는 내놓지 않았어요. 몸통 근육 훈련 메타분석(대조 연구 31개)에서는 종목 기술 수행에 중간 정도의 효과가 있었지만, 투수의 구속을 본 연구는 아니에요. 그래서 코어는 다른 훈련과 같이 꾸준히 하는 기본으로 보는 쪽이 맞아요.',
    sources: [
      'DL57',
      'DL58',
      'DL59',
      'DL60',
      'DL07',
      'DL01',
      'DL61',
      'TA01',
      'TA03',
      'TA13',
      'TA18',
      'PM35061213',
    ],
    review: DRAFT,
  },
  {
    id: 'R01',
    topic: '아이싱',
    keys: ['아이싱', '얼음', '냉찜질', '아이스', '찬물', '냉탕', '냉수욕'],
    body: '던진 뒤 팔에 얼음을 대면 부상이 줄어든다는 연구는 찾지 못했어요. 투수를 본 연구는 7~16명 규모로 작아요. 대학 투수 16명 무작위 연구에서는 던진 뒤 어깨와 팔뚝을 3시간 식히자 다음 날 어깨 안쪽 돌림 힘이 평소의 95%였고 안 식힌 쪽은 83%였어요. 근육통은 차이가 없었어요. 다른 작은 연구는 근육통이 줄었다고 해서 결과가 갈려요. 청소년 투수 조사에서는 다친 선수가 오히려 얼음을 더 자주 썼어요. 아픈 팔에 얼음을 대는 것이라 얼음이 원인이라고 볼 수는 없어요. 온몸이나 다리를 찬물에 담그면 쉬기만 하는 것보다 근육통이 줄어요(연구 질은 낮아요). 하지만 근력 운동 뒤마다 찬물에 담그면 근력과 근육이 덜 늘었어요(실험과 메타분석, 주로 하체를 담근 젊은 남성 연구). 그래서 얼음은 뻐근함을 달래는 용도로 써도 되지만 꼭 해야 하는 것은 아니에요. 통증이 있으면 얼음으로 버티지 말고 체크인에 적고 전문가와 상의해 주세요.',
    sources: [
      'PM12853900',
      'PM32694373',
      'PM16452269',
      'PM22336838',
      'PM26174323',
      'PM33146851',
      'PM31788800',
    ],
    review: DRAFT,
  },
  {
    id: 'R02',
    topic: '회복 방법',
    keys: [
      '회복 방법',
      '회복',
      '마사지',
      '폼롤러',
      '폼롤링',
      '압박',
      '쿨다운',
      '정리 운동',
      '정리운동',
      '운동 후 스트레칭',
      '러닝으로 풀',
    ],
    body: '운동 뒤 스트레칭은 근육통을 의미 있게 줄이지 못해요(체계적 문헌고찰 둘). 가동 범위를 지키려는 스트레칭과는 다른 이야기예요. 마사지는 근육통과 유연성에 작은 도움이 있지만 근력, 점프, 스프린트 같은 수행을 올린다는 근거는 없어요. 폼롤러 효과는 작고, 회복보다 준비 운동 쪽 근거가 더 나아요. 압박 의류는 근육 손상 뒤 회복에 중간 정도 도움이 있었어요(주로 하체 연구). 가벼운 정리 운동은 자료가 갈려요. 다음 수행이나 근육통에는 대체로 효과가 없다는 리뷰가 있고, 근육통을 줄인다는 메타분석도 있어요. 던진 뒤 젖산을 빼려고 달릴 이유는 약해요. 모의 경기에서 투수의 젖산은 피로나 구속 저하를 일으킬 만큼 오르지 않았어요(작은 연구). 이 방법들은 대부분 투수의 팔로 확인한 자료가 아니에요.',
    sources: [
      'PM21735398',
      'PM34025459',
      'PM32426160',
      'PM29755363',
      'PM31024339',
      'PM23757486',
      'PM29663142',
      'PM25051002',
    ],
    review: DRAFT,
  },
  {
    id: 'R03',
    topic: '잠',
    keys: ['잠', '수면', '몇 시간 자', '낮잠', '밤샘', '늦게 자', '못 잤'],
    body: '수면 권고는 성인 하루 7시간 이상(7~9시간), 13~18세는 8~10시간이에요(수면 학회 합의 권고). 건강 기준이고 운동 수행 기준은 아니에요. 잠을 평소보다 늘린 작은 연구들에서 농구 슛과 테니스 서브 정확도가 좋아졌어요. 다만 대조군이 없었고 야구 연구는 아니에요. 청소년 선수는 잠이 늘 모자라면 부상이 더 많았어요. 평균 8시간 미만으로 잔 선수의 부상이 1.7배였어요(관련만 본 연구라 원인이라고 할 수는 없어요). 하루에서 사흘쯤 덜 잔 것이 수행에 주는 영향은 아직 분명하지 않아요. 정확도는 떨어질 수 있고(5시간 잔 뒤 테니스 서브 연구) 최대 힘은 대체로 유지돼요. 경기 전날 잠을 설치는 일은 선수에게 흔해요. 전문가 합의문은 필요한 잠이 사람마다 다르다고 보고, 모자란 잠은 20~30분 낮잠으로 보태는 것을 권해요.',
    sources: [
      'PMC4434546',
      'PMC4877308',
      'PM29073412',
      'PM21731144',
      'PM26325012',
      'PM25028798',
      'PM30888337',
      'PM33144349',
      'PM23916998',
      'PM25315456',
    ],
    review: DRAFT,
  },
  {
    id: 'R04',
    topic: '경기 날 식사',
    keys: [
      '경기 전',
      '등판 전',
      '시합 전',
      '경기 날',
      '뭐 먹',
      '언제 먹',
      '식사',
      '탄수화물',
    ],
    body: '스포츠 영양 공동 입장문은 60분 넘는 운동 전 1~4시간 사이에 체중 1kg당 탄수화물 1~4g을 권해요. 오래 달리는 종목 연구에서 나온 기준이고, 효과가 없었던 연구도 있어요. 야구 투수로 확인한 기준은 아니에요. 경기 전 식사는 지방과 식이섬유가 적고 단백질은 적당한 음식이 속이 편해요(입장문, 사람마다 달라요). 물은 운동 2~4시간 전에 체중 1kg당 5~10mL를 마시고 소변 색이 옅은 노란색이면 돼요. 다음 힘든 운동이 8시간 안에 있을 때만 운동 뒤 탄수화물을 서둘러 채울 필요가 있어요. 그때는 첫 4시간 동안 시간당 체중 1kg당 1~1.2g을 권해요. 그렇지 않으면 먹는 시간보다 하루 총량이 중요해요(리뷰). 내 하루 목표는 영양 탭에서 봐요.',
    sources: ['DC16', 'PM28919842', 'PM17277604', 'PM27789774'],
    review: DRAFT,
  },
  {
    id: 'R05',
    topic: '단백질',
    keys: ['단백질', '프로틴', '쉐이크', '닭가슴살', '몇 그램'],
    body: '운동하는 성인의 하루 단백질 권고는 체중 1kg당 1.2~2.0g이에요(공동 입장문, 다른 입장문은 1.4~2.0g). 근력 운동으로 느는 근육량은 1.6g쯤을 넘으면 더 늘지 않았어요(무작위 연구 49개 메타분석). 한 번에 체중 1kg당 0.25~0.3g(대략 20~40g)을 3~5시간마다 나눠 먹는 것이 권고예요. 운동 직후에 꼭 먹어야 한다는 말은 근거가 약해요. 하루 총량을 맞추면 먹는 시간의 효과는 사라졌어요(메타분석). 운동 뒤 몇 시간 안에 먹으면 충분해요. 청소년은 음식으로 채우면 되고 단백질 보충제가 필요하지 않다는 것이 합의예요(국제 합의문, 영양 입장문, 소아과 학회 안내). 청소년용 체중당 기준을 확인한 자료는 찾지 못해서 성인 숫자를 청소년에게 그대로 쓰면 안 돼요. 내 하루 목표는 영양 탭에서 봐요.',
    sources: [
      'DC16',
      'PM28642676',
      'PM28698222',
      'PM24299050',
      'PM28070459',
      'BJ15',
      'AP16',
      'PM24668620',
    ],
    review: DRAFT,
  },
  {
    id: 'R06',
    topic: '수분과 더위',
    keys: [
      '수분',
      '물 얼마나',
      '탈수',
      '더위',
      '더운 날',
      '여름',
      '땀',
      '열사병',
      '이온음료',
      '쥐가',
    ],
    body: '운동 중 목표는 땀으로 체중이 2% 넘게 빠지지 않게 마시는 것이에요(학회 입장문 둘). 기술과 순간 힘은 3~5% 빠졌을 때 떨어지는 일이 더 흔해요. 투구로 확인한 연구는 찾지 못했어요. 땀 양은 사람마다 달라서 운동 전후 체중을 재면 알 수 있어요. 많이 마실수록 좋은 것은 아니에요. 필요보다 많이 마시는 것은 이득이 없고 권하지 않아요. 다음 운동까지 시간이 짧으면 빠진 양의 1.25~1.5배를 마셔요. 반나절 넘게 쉴 수 있으면 평소처럼 먹고 마시면 돌아와요. 평소에는 목마름, 소변 횟수, 소변 색으로 살펴요(전문가 의견 수준). 쥐가 나는 원인은 아직 확실하지 않아요. 더운 날 운동하다 쓰러지거나, 멍하거나, 말과 행동이 이상해지면 열사병일 수 있어요. 열사병은 응급이에요. 바로 운동을 멈추고 응급 신고를 하고 몸을 빨리 식혀야 해요.',
    sources: [
      'PM17277604',
      'PMC5634236',
      'DC16',
      'PMC4639891',
      'PM17473783',
      'PM37036463',
    ],
    review: DRAFT,
  },
  {
    id: 'R07',
    topic: '암케어 운동',
    keys: [
      '암케어',
      '튜빙',
      '밴드 운동',
      '회전근개',
      '어깨 보강',
      '어깨 운동',
      '쓰로워스',
      '부상 예방',
    ],
    body: '프로 투수 추적 연구에서 시즌 전 어깨 바깥 돌림 힘이 약한 투수가 시즌 중 수술까지 간 부상이 더 많았어요(관련만 본 연구). 하지만 보강 운동만 따로 떼어 부상이 줄어드는지 확인한 연구는 찾지 못했어요. 널리 쓰는 투수용 밴드 운동 묶음도 임상 경험에서 나온 것이고, 투수의 부상 결과를 본 대조 연구는 찾지 못했어요. 유소년에서는 스트레칭, 가동성, 균형 운동을 준비 운동에 넣은 프로그램이 어깨와 팔꿈치 부상을 절반쯤으로 줄였어요(9~11세 무작위 연구에서 1,000번 참가당 1.7건 대 3.1건, 같은 연구진의 대조 연구도 같은 방향). 고교 투수가 매일 어깨 뒤쪽 스트레칭을 한 연구에서도 부상이 적었어요. 다만 선수가 스스로 고른 집단이라 근거는 약해요. 그래서 암케어는 해 둘 만한 기본이지만 하면 안 다친다고 말할 근거는 없어요.',
    sources: ['PM20489215', 'PM22293772', 'PM31336051', 'PM29095655', 'PM28345616'],
    review: DRAFT,
  },
  {
    id: 'R08',
    topic: '암케어 시점',
    keys: [
      '암케어 언제',
      '던지기 전에',
      '던진 뒤에',
      '던지고 나서',
      '전에 해',
      '후에 해',
      '어깨 피로',
    ],
    body: '투구 훈련 기관 두 곳 모두 던지기 전 암케어는 짧고 가볍게, 몸을 깨우는 정도로만 하라고 해요. 던지기 전에 회전근개를 지치게 하면 안 된다고 봐요. 한 곳은 지친 회전근개가 팔뼈 머리를 위로 밀려 올라가게 해 어깨가 끼일 위험을 키운다고 설명해요. 이곳의 순서는 동적 준비 운동, 밴드, 플라이오볼 드릴이고, 던지면서 몸을 푸는 것이 아니라 몸을 푼 뒤에 던지라고 해요. 다른 곳은 그 앞에 몸 풀기와 교정 운동을 두고 밴드를 운동마다 10회씩 해요. 이곳은 아주 낮은 힘(20%)으로 6초씩 버티기를 더하지만 효과는 경험담이라고 밝혀요. 두 곳 모두 암케어를 많이 하는 것은 필요 없다고 봐요. 한 곳은 밴드 운동을 지나치게 하면 오히려 해로울 수 있다고 하고, 다른 곳은 던지기 전후에 운동 10개를 10회 3세트씩 하는 것은 양이 너무 많고, 회복이라고 부른다고 회복이 되는 것은 아니라고 해요. 두 곳 모두 힘을 키우는 회전근개 · 날개뼈 운동은 웨이트 시간에 넣어요. 한 곳은 2020년에 던진 직후 가벼운 운동(밴드 · 리바운더 · 웨이터 워크)을 많이 하던 방식을 바꿔, 중간 이상으로 던진 날에는 전신 가동성 정리 운동만 하고 어깨 강화는 웨이트로 옮겨 강도는 높게, 양은 적게 했어요. 가벼운 회복 운동은 가볍게 던진 날에만 남겼어요. 두 곳 모두 던진 다음에 웨이트를 해요. 다른 곳의 시즌 중 처방은 상체 날 두 번(A · B)에 회전근개 8~12회 2~3세트, 날개뼈 15회 2~3세트예요. 시즌 중에는 천천히 내리는 동작이 많은 운동과 팔뚝 운동을 많이 하는 것을 줄여요. 이곳은 팔이 축 처지거나 아프면 그날은 던지지 않고 준비 운동과 암케어만 하라고 해요. 연구로는 경기 뒤 어깨 힘이 바로 떨어졌어요(투수 13명, 안쪽 돌림 힘 18%). 다른 연구(대학 투수 10명)에서는 바깥 돌림 힘이 사흘째, 안쪽 돌림 범위는 나흘째에 돌아왔어요. 두 곳 모두 암케어 시점을 직접 견준 자료는 내놓지 않았어요.',
    sources: [
      'DL60',
      'DL68',
      'DL69',
      'DL70',
      'TA05',
      'TA01',
      'TA18',
      'TA11',
      'PM15611006',
      'PM35286185',
      'PM18668167',
    ],
    review: DRAFT,
  },
  {
    id: 'R09',
    topic: '통증과 근육통',
    keys: ['아파', '아픈데', '통증', '팔꿈치 아', '어깨 아', '참고 던', '아파도'],
    body: '청소년 투수 입장문은 팔꿈치나 어깨가 아프다고 하면 스포츠의학 의사에게 보일 때까지 투구를 멈추라고 해요. 팔 통증, 피로, 구위 저하는 과사용 부상의 이른 신호예요(학회 입장문). 통증은 과사용 문제의 첫 신호인 일이 많아서 넘기면 안 돼요. 지친 채 던지는 것이 청소년 투수 부상과 가장 강하게 이어진 요인이었어요(환자 대조 연구와 체계적 문헌고찰). 팔이 지친 채 뛴 선수는 팔꿈치 통증이 6배 가까이 많았어요. 어린 선수의 팔꿈치 통증은 흔하고 영상 검사에서 이상이 같이 보이는 일이 많아요. 7~11세 연구에서 팔꿈치가 아픈 선수의 60% 가까이에서 이상이 보였어요. 근육통과 부상 통증을 가르는 검증된 기준은 찾지 못했어요. 그래서 관절이 아프면 멈추는 쪽이 기준이에요. 통증은 체크인에 적고, 이어지면 전문가에게 보여 주세요.',
    sources: [
      'AM02',
      'PMC3070508',
      'PM16452269',
      'PM29630388',
      'PM26535252',
      'PM20189835',
    ],
    review: DRAFT,
  },
  {
    id: 'R10',
    topic: '쉬는 날과 투구 수 제한',
    keys: ['쉬는 날', '휴식일', '투구 수 제한', '며칠 쉬', '등판 간격', '투구수 제한'],
    body: '청소년 투구 수 제한과 쉬는 날 지침은 지친 채 던지는 일을 줄이려고 만든 것이에요. 바탕은 많이 던질수록 통증과 부상이 많았다는 관찰 연구예요. 한 경기와 한 시즌 공 수가 많을수록 팔꿈치와 어깨 통증이 많았고, 10년 추적에서는 한 해 100이닝 넘게 던진 선수의 부상이 3.5배였어요. 다만 며칠을 쉬어야 하는지 그 숫자 자체를 실험으로 확인한 연구는 찾지 못했어요. 성인 프로 선발 기록에서는 쉬는 날 수가 성적에 큰 영향을 주지 않았어요. 작은 실험에서도 쉬는 날 수에 따라 근육통과 구속이 달라지지 않았어요. 지침을 지킨 유소년 선수에게서도 팔 통증과 영상 이상이 흔했어요(작은 연구). 그래서 지침은 지키면 안전하다는 보증이 아니라 넘지 말아야 할 선이에요. 내 쉬는 날과 오늘 던질 양은 앱이 기록을 보고 정해요.',
    sources: [
      'PM12130397',
      'PM21098816',
      'PM22344048',
      'PM16558126',
      'PM28567429',
      'PM16452269',
    ],
    review: DRAFT,
  },
  {
    id: 'R11',
    topic: '카페인과 보충제',
    keys: [
      '카페인',
      '커피',
      '에너지 드링크',
      '에너지드링크',
      '크레아틴',
      '보충제',
      '영양제',
      '부스터',
    ],
    body: '소아과 학회는 에너지 드링크의 카페인과 자극 성분이 어린이와 청소년 식단에 있을 자리가 없다고 해요. 성인에서는 카페인이 운동 수행을 올린다는 근거가 꾸준하지만 청소년 자료는 아니에요. 크레아틴은 기관마다 말이 달라요. 소아과 학회는 청소년의 수행 향상 물질 사용에 반대하고, 이 나이대에는 추가 이득이 없어 보인다고 안내해요. 스포츠 영양 학회는 감독 아래 진지하게 훈련하는 어린 선수에게는 받아들일 만하다고 해요. 청소년을 본 연구는 매우 적어요. 국제 합의문은 청소년 선수에게 수행을 올리려는 보충제를 권하는 것이 맞지 않다고 봐요. 청소년은 성장, 훈련, 식사만으로 크게 늘 수 있어서예요. 성인 엘리트 선수에서도 효과 근거가 좋은 것은 카페인, 크레아틴 등 몇 가지뿐이고, 금지 성분이 섞여 있을 위험이 알려져 있어요. 앱은 보충제를 권하지 않아요.',
    sources: [
      'PM21624882',
      'AP16',
      'PM15805399',
      'PMC5469049',
      'PM30547033',
      'BJ15',
      'PM27354458',
      'PM29540367',
      'PM33388079',
      'DC16',
    ],
    review: DRAFT,
  },
];

/** AI 에 실을 노트 — 검토자가 적힌 것만 */
export function shippedNotes(notes: readonly KnowNote[] = KNOW_NOTES): KnowNote[] {
  return notes.filter((n) => n.review.by != null);
}

/** 지시문에 싣는 주제 목록 한 줄(없으면 빈 글) */
export function noteTopicsLine(notes: readonly KnowNote[] = shippedNotes()): string {
  return notes.map((n) => n.topic).join(' · ');
}

const norm = (s: string) => s.toLowerCase().replace(/[\s·,.?!'"()]/g, '');

/** 한 번에 돌려주는 노트 수 */
export const NOTES_PER_READ = 2;

/**
 * 주제 찾기 — 주제 이름 · 찾는 낱말이 물음에 들어 있는 만큼 점수(긴 낱말이 더 세다). 같은 입력이면 같은 결과.
 * ponytail: 낱말 맞춤뿐이다 — 노트가 100개를 넘거나 못 찾는 물음이 많으면 뜻으로 찾기(임베딩)로
 */
export function findNotes(
  query: string,
  notes: readonly KnowNote[] = shippedNotes()
): KnowNote[] {
  const q = norm(query);
  if (!q) return [];
  return notes
    .map((n) => ({
      n,
      score: [n.topic, ...n.keys].reduce(
        (s, k) => (norm(k) && q.includes(norm(k)) ? s + norm(k).length : s),
        0
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.n.id < b.n.id ? -1 : 1))
    .slice(0, NOTES_PER_READ)
    .map((x) => x.n);
}

/** read_knowledge 가 돌려주는 글 — 출처 번호는 안 싣는다 */
export function notesText(
  query: string,
  notes: readonly KnowNote[] = shippedNotes()
): string {
  const found = findNotes(query, notes);
  if (!found.length) {
    const topics = noteTopicsLine(notes);
    return topics
      ? `그 주제의 지식 노트가 없어요. 있는 주제: ${topics}`
      : '지식 노트가 아직 없어요.';
  }
  return [
    '지식 노트(검증된 자료로 쓴 글 — 이 안에서 답하고, 약함 · 갈림 표시는 그대로 전한다):',
    ...found.map((n) => `[${n.topic}]\n${n.body}`),
  ].join('\n\n');
}
