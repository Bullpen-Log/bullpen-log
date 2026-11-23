/**
 * 코치 지식 노트(2026-11-23 김민: "일반적인 모든 야구와 운동에 관한 대답을 해 줄 수 있어야 한다. 틀린 말을 하면 안 되고 여러 개의 믿을 수 있는
 * 자료를 바탕으로") — 투구 · 근력 · 컨디셔닝 · 회복 · 잠 · 영양의 일반 지식을 주제별 짧은 글로. AI 가 일반 질문에 답하기 전에 read_knowledge 로 읽는다.
 *
 * 약속(자체 시험 coach:ai-test 가 지킨다)
 *   - 노트의 주장마다 출처가 둘 넘게(NOTE_SOURCES — 동료 평가 논문 · 학회 · 기관 공식 문서만. 훈련 회사 · 블로그 · 영상은 안 쓴다).
 *     출처가 하나뿐이거나 근거가 약하면 글에 그렇게 적는다('연구가 적어요' · '결과가 갈려요').
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
  PM25842029:
    '청소년 투수 구속 예측 요인(Sgroi 2015, J Shoulder Elbow Surg) — https://pubmed.ncbi.nlm.nih.gov/25842029/',
  PM41389727:
    '대학 투수 경기 중 상하체 분리와 구속(Jump 2026, J Biomech) — https://pubmed.ncbi.nlm.nih.gov/41389727/',
  PM40414041:
    '상하체 분리와 팔꿈치 토크(Peters 2025, Braz J Phys Ther) — https://pubmed.ncbi.nlm.nih.gov/40414041/',
  PM26952088:
    '청소년 모의 경기 피로와 동작(Erickson 2016, Arthroscopy) — https://pubmed.ncbi.nlm.nih.gov/26952088/',
  PM19633230:
    '몸통 회전 시작 시점과 팔꿈치 토크(Aguinaldo 2009, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/19633230/',
  PM17585177:
    '수준별 몸통 회전 시점(Aguinaldo 2007, J Appl Biomech) — https://pubmed.ncbi.nlm.nih.gov/17585177/',
  PM26665056:
    'MLB 투수 동작과 수술 위험(Douoguih 2015, Orthop J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/26665056/',
  PM32636133:
    '투구 동작 부상 위험 요인 체계적 문헌고찰(Bullock 2021, J Sci Med Sport) — https://pubmed.ncbi.nlm.nih.gov/32636133/',
  PM36479467:
    '착지 때 골반 방향과 구속 · 토크(Dowling 2022, Orthop J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/36479467/',
  PM29910355:
    '앞무릎 폄과 구속(van Trigt 2018, Sports) — https://pubmed.ncbi.nlm.nih.gov/29910355/',
  PM39157018:
    '앞무릎 폄과 구속 · 토크(Dowling 2024, Orthop J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/39157018/',
  PM26402471:
    '디딤발 지면 반력과 구속(McNally 2015, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/26402471/',
  PM25435765:
    '구속 높은 · 낮은 대학 투수 하체(Kageyama 2014, J Sports Sci Med) — https://pubmed.ncbi.nlm.nih.gov/25435765/',
  PM39906602:
    '팔꿈치 토크 높은 · 낮은 투수 동작(McCutcheon 2025, Orthop J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/39906602/',
  PM23015888:
    '투구 생체역학 리뷰(Fortenbaugh 2009, Sports Health) — https://pubmed.ncbi.nlm.nih.gov/23015888/',
  PM21212502:
    '롱토스와 마운드 투구 비교(Fleisig 2011, J Orthop Sports Phys Ther) — https://pubmed.ncbi.nlm.nih.gov/21212502/',
  PM24664135:
    '평지 거리별 · 마운드 힘 조절 투구 부하(Slenker 2014, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/24664135/',
  PM30215544:
    '거리별 팔꿈치 토크(Dowling 2018, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/30215544/',
  PM31150269:
    '체감 강도와 팔꿈치 토크(Melugin 2019, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/31150269/',
  PM29882722:
    '웨이티드볼 6주 무작위 연구(Reinold 2018, Sports Health) — https://pubmed.ncbi.nlm.nih.gov/29882722/',
  PM30800693:
    '웨이티드 도구 훈련 체계적 문헌고찰(Caldwell 2019, Orthop J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/30800693/',
  PM10783901:
    '무게 다른 공 훈련 리뷰(Escamilla 2000, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/10783901/',
  PM32598234:
    '무거운 공 던진 직후 어깨 가동 범위(Reinold 2020, Sports Health) — https://pubmed.ncbi.nlm.nih.gov/32598234/',
  PM27872403:
    '무게 다른 공 · 크로우홉 투구 부하(Fleisig 2017, Sports Health) — https://pubmed.ncbi.nlm.nih.gov/27872403/',
  PM18707902:
    '대학 투수 구속 관련 요인(Werner 2008, J Shoulder Elbow Surg) — https://pubmed.ncbi.nlm.nih.gov/18707902/',
  PM32153984:
    '신체 특성과 구속 범위 문헌고찰(Mercier 2020, BMJ Open Sport Exerc Med) — https://pubmed.ncbi.nlm.nih.gov/32153984/',
  PM26983459:
    'MLB 투수 인대 재건술 예측 요인(Chalmers 2016, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/26983459/',
  PM20093420:
    '프로 투수 구속과 팔꿈치 부상(Bushnell 2010, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/20093420/',
  PM18055920:
    '유소년 구종별 부하(Dun 2008, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/18055920/',
  PM19448049:
    '청소년 커브 · 직구 부하(Nissen 2009, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/19448049/',
  PM16260466:
    '대학 투수 구종별 부하(Fleisig 2006, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/16260466/',
  PM28968139:
    '프로 투수 구종별 · 볼 스트라이크 동작(Escamilla 2017, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/28968139/',
  PM12130397:
    '유소년 구종 · 투구 수와 통증(Lyman 2002, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/12130397/',
  PM21098816:
    '유소년 투수 10년 추적(Fleisig 2011, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/21098816/',
  PM25553209:
    '커브와 부상 체계적 문헌고찰(Grantham 2015, Sports Health) — https://pubmed.ncbi.nlm.nih.gov/25553209/',
  PM24627578:
    '유소년 투수 전국 설문(Yang 2014, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/24627578/',
  PM34843301:
    '주의 초점 메타분석(Chua 2021, Psychol Bull) — https://pubmed.ncbi.nlm.nih.gov/34843301/',
  PM20078758:
    '운동 기술 학습 리뷰(Wulf 2010, Med Educ) — https://pubmed.ncbi.nlm.nih.gov/20078758/',
  PM38987617:
    '섞어 연습하기 메타분석(Czyz 2024, Sci Rep) — https://pubmed.ncbi.nlm.nih.gov/38987617/',
  PM31449438:
    '동작 변동과 제구 일관성(Glanzer 2021, Sports Biomech) — https://pubmed.ncbi.nlm.nih.gov/31449438/',
  PM19391491:
    '수준별 동작 변동(Fleisig 2009, Sports Biomech) — https://pubmed.ncbi.nlm.nih.gov/19391491/',
  PM33345028:
    '릴리스 각도와 투구 위치(Kusafuka 2020, Front Sports Act Living) — https://pubmed.ncbi.nlm.nih.gov/33345028/',
  PM12776824:
    '정확도 지시와 던지기 속도(van den Tillaar 2003, Percept Mot Skills) — https://pubmed.ncbi.nlm.nih.gov/12776824/',
  PM16452269:
    '청소년 투수 부상 위험 요인(Olsen 2006, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/16452269/',
  PM16973902:
    '모의 경기 피로와 동작(Escamilla 2007, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/16973902/',
  PM24427428:
    '청소년 마운드 · 평지 부하(Nissen 2013, Sports Health) — https://pubmed.ncbi.nlm.nih.gov/24427428/',
  PM30207787:
    '유소년 마운드 높이와 부하(Fleisig 2018, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/30207787/',
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
  PM33629972:
    '체력 유지에 필요한 최소 운동량 리뷰(Spiering 2021, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/33629972/',
  PM16937969:
    '시즌 중 근력 운동 중단과 던지기 속도(Marques 2006, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/16937969/',
  PM18296980:
    '야구 선수 지구력 · 스피드 훈련과 파워(Rhea 2008, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/18296980/',
  PM29910262:
    'MLB 투수 유산소 능력과 성적(Gillett 2016, Sports) — https://pubmed.ncbi.nlm.nih.gov/29910262/',
  PM34757594:
    '유산소 · 근력 병행 메타분석(Schumann 2022, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/34757594/',
  PM33751469:
    '병행 훈련 간섭 메타분석(Petre 2021, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/33751469/',
  PM22002517:
    '병행 훈련 메타분석(Wilson 2012, J Strength Cond Res) — https://pubmed.ncbi.nlm.nih.gov/22002517/',
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
  PM22784233:
    '코어 안정성 훈련 체계적 문헌고찰(Reed 2012, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/22784233/',
  PM35061213:
    '몸통 근육 훈련 메타분석(Saeterbakken 2022, Sports Med) — https://pubmed.ncbi.nlm.nih.gov/35061213/',
  PM25159541:
    '프로 투수 허리 · 골반 조절과 결장(Chaudhari 2014, Am J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/25159541/',
  PS15: '청소년 투구 지침 15~18세(MLB · USA Baseball Pitch Smart) — https://www.mlb.com/pitch-smart/pitching-guidelines/ages-15-18',
  PS13: '청소년 투구 지침 13~14세(MLB · USA Baseball Pitch Smart) — https://www.mlb.com/pitch-smart/pitching-guidelines/ages-13-14',
  PS09: '청소년 투구 지침 9~12세(MLB · USA Baseball Pitch Smart) — https://www.mlb.com/pitch-smart/pitching-guidelines/ages-9-12',
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
  PM21831667:
    '고교 투수 경기 뒤 근육 활성(Gandhi 2012, J Shoulder Elbow Surg) — https://pubmed.ncbi.nlm.nih.gov/21831667/',
  PM18668167:
    '회전근개 피로와 어깨 관절 움직임(Teyhen 2008, J Athl Train) — https://pubmed.ncbi.nlm.nih.gov/18668167/',
  PM17597949:
    '던지기 피로와 팔 위치 감각(Tripp 2007, J Athl Train) — https://pubmed.ncbi.nlm.nih.gov/17597949/',
  PM25694615:
    '상체 준비 운동 체계적 문헌고찰(McCrary 2015, Br J Sports Med) — https://pubmed.ncbi.nlm.nih.gov/25694615/',
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
} as const satisfies Record<string, string>;

/** 검토 전 — 검토자가 이름 · 날짜를 적으면 AI 에 실린다 */
const DRAFT = { by: null, at: null } as const;

export const KNOW_NOTES: readonly KnowNote[] = [
  {
    id: 'P01',
    topic: '상하체 분리',
    keys: ['상하체분리', '힙숄더', '골반과 어깨', '분리', '꼬임'],
    body: '상하체 분리는 골반이 먼저 목표 쪽으로 돌고 윗몸통이 잠깐 뒤에 남아 있는 차이를 말해요. 구속과 양의 관계가 있지만 크기는 작아요. 대학 투수 경기 측정에서 상관이 약했고, 청소년 연구에서는 나이와 키가 구속을 훨씬 크게 설명했어요. 같은 투수 안에서도 분리가 클 때 늘 더 빠르지는 않았어요. 분리가 팔꿈치 부담을 줄인다거나 늘린다고 말할 근거는 작고 수준에 따라 달라요. 청소년 모의 경기에서는 공 수가 늘수록 분리가 줄었어요(연구 하나). 그래서 분리만 키우면 구속이 오른다고 단정할 수 없어요.',
    sources: ['PM25842029', 'PM41389727', 'PM40414041', 'PM26952088'],
    review: DRAFT,
  },
  {
    id: 'P02',
    topic: '몸이 일찍 열림',
    keys: ['일찍 열림', '일찍 열려', '몸이 열려', '몸통 회전', '열린다'],
    body: '앞발이 땅에 닿기 전에 윗몸통이 먼저 돌기 시작하는 것을 흔히 몸이 일찍 열린다고 해요. 성인 투수 연구에서 앞발 착지 전에 몸통 회전을 시작한 투수는 팔꿈치가 받는 힘이 더 컸어요(같은 연구실의 연구 둘). MLB 투수 영상 연구에서는 일찍 도는 투수의 어깨 · 팔꿈치 수술 위험이 더 높게 나왔어요(연구 하나, 차이가 아슬아슬해요). 착지 때 골반이 열려 있는 것은 다른 이야기예요. 프로 투수에서 골반이 더 열린 채 착지한 쪽은 구속이 조금 높았고 팔꿈치 부담은 차이가 없었어요(연구 하나). 모두 관찰 연구라 원인과 결과로 단정할 수는 없어요.',
    sources: ['PM19633230', 'PM17585177', 'PM26665056', 'PM32636133', 'PM36479467'],
    review: DRAFT,
  },
  {
    id: 'P03',
    topic: '앞다리 버티기',
    keys: ['앞다리', '앞무릎', '디딤발', '착지 다리', '무너져', '버티기', '리드 레그'],
    body: '앞발이 닿은 뒤 공을 놓을 때까지 앞무릎이 펴지는 쪽일수록 구속이 높았어요(청소년 · 프로 연구). 착지하는 순간의 무릎 각도 자체는 구속과 관련이 없었어요. 앞다리가 땅을 미는 힘이 큰 투수가 더 빠른 공을 던졌어요(연구 둘, 표본은 작아요). 다만 차이는 작아요. 청소년 연구에서 무릎이 18도쯤 더 펴질 때 시속 1.6km쯤이었어요. 앞다리를 세게 버틴다고 팔이 편해지는 것은 아니에요. 고교 투수와 큰 표본에서는 무릎을 더 빨리 펴는 투수가 팔꿈치 부담도 더 컸어요(빠른 공 자체가 부담을 키워요). 관찰 연구라 앞다리를 고치면 구속이 오른다고 단정할 수는 없어요.',
    sources: ['PM29910355', 'PM39157018', 'PM26402471', 'PM25435765', 'PM39906602'],
    review: DRAFT,
  },
  {
    id: 'P04',
    topic: '팔 타이밍',
    keys: ['팔이 늦게', '팔이 늦', '인버티드', '팔 스윙', '팔 타이밍', '암 액션'],
    body: '팔 모양만 보고 다친다고 말할 근거는 약해요. 두 팔꿈치가 어깨보다 높이 올라가는 자세(흔히 인버티드 W)는 MLB 투수 연구에서 수술 위험과 뚜렷한 관련이 없었어요(연구 하나, 작은 위험까지 없다고는 못 해요). 앞발이 닿을 때 팔이 덜 젖혀져 있는 것(팔이 늦는 것)은 팔꿈치 부담이 큰 투수들에게서 보인 여러 특징 중 하나였어요. 그 투수들은 공도 더 빨랐고, 부상을 본 연구가 아니라 부담을 본 연구예요. 리뷰들은 골반 · 몸통 · 팔의 순서와 타이밍이 팔 부담과 구속 둘 다에 관련된다고 정리해요. 그래서 팔 모양 하나를 고치기보다 영상이나 3D 분석으로 순서를 확인하는 쪽이 근거에 맞아요.',
    sources: ['PM26665056', 'PM39906602', 'PM23015888'],
    review: DRAFT,
  },
  {
    id: 'P05',
    topic: '롱토스',
    keys: ['롱토스', '롱 토스', '멀리 던지기', '원투', '캐치볼 거리'],
    body: '평지에서 직선으로 세게 던지는 공은 55m쯤까지 어깨 · 팔꿈치 부담이 마운드 전력 투구와 비슷했어요(대학 투수 연구 둘). 거리 제한 없이 높게 띄워 가장 멀리 던지는 롱토스는 팔꿈치 · 어깨에 걸리는 힘이 가장 컸고 동작도 달라졌어요. 그 연구는 이런 던지기를 조심해서 쓰라고 해요. 고교 선수 연구에서는 거리가 늘수록 팔꿈치 부담이 커지다가 37m쯤부터 더 늘지 않았어요. 롱토스가 구속을 올린다거나 부상을 줄인다는 것을 직접 확인한 연구는 찾지 못했어요. 몇 미터를 몇 번 던지라는 검증된 기준은 없어요. 오늘 던질 양은 앱의 투구 계획을 따르면 돼요.',
    sources: ['PM21212502', 'PM24664135', 'PM30215544'],
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
    body: '무게가 다른 공으로 하는 훈련은 대부분의 연구에서 구속을 올렸어요. 다만 연구의 질이 매우 낮다고 평가돼요. 부상 위험은 아직 모르는 쪽이에요. 청소년 38명을 나눈 무작위 연구 하나에서 6주 훈련한 쪽의 24%(4명)가 팔꿈치를 다쳤고(둘은 다음 시즌) 안 한 쪽은 없었어요. 체계적 문헌고찰은 위험을 판단할 자료가 모자란다고 해요. 무거운 공을 던진 직후에는 어깨가 뒤로 젖혀지는 범위가 늘었어요(같은 연구진의 연구 둘). 안전하다고도 위험하다고도 증명되지 않았어요. 성장기에는 특히 조심하고 지도자와 상의해서 하는 쪽이 맞아요.',
    sources: ['PM29882722', 'PM30800693', 'PM10783901', 'PM32598234'],
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
    body: '연구에서 구속과 관련이 있다고 나온 것은 이래요. 관련이 있다는 것이지 그것을 하면 오른다는 보장은 아니에요. 몸무게가 많이 나가는 투수가 더 빠른 편이에요. 청소년기에는 나이와 키가 가장 크게 설명해요. 저항 운동(웨이트 · 밴드 · 점프 등)을 한 프로그램은 대체로 던지는 속도를 올렸어요(체계적 문헌고찰, 주로 청소년 · 대학). 대학 투수에서 하체가 내는 힘의 절대 크기가 구속과 관련됐는데, 몸무게를 빼고 나면 보탬이 작았어요. 골반 · 몸통 · 팔의 순서와 앞다리 버티기 같은 동작도 관련이 있지만 하나하나의 크기는 작아요. 빠른 공일수록 팔꿈치 부담과 팔꿈치 부상도 같이 늘어요. 구속만 보고 무리하면 안 되는 까닭이에요.',
    sources: [
      'PM18707902',
      'PM32153984',
      'PM25842029',
      'PM38125451',
      'PM39446825',
      'PM26983459',
      'PM20093420',
    ],
    review: DRAFT,
  },
  {
    id: 'P08',
    topic: '구종과 팔 부담',
    keys: ['커브', '슬라이더', '체인지업', '변화구', '구종', '직구', '그립'],
    body: '실험실 연구에서 어깨 · 팔꿈치 부담은 직구가 가장 크거나 커브와 비슷했고 체인지업이 가장 작았어요(유소년 · 청소년 · 대학 · 프로 모두). 슬라이더는 자료가 가장 적어요. 프로에서는 직구와 비슷했고, 유소년 연구 하나에서는 팔꿈치 통증이 더 많았어요. 어린 선수의 커브가 부상을 늘리는지는 결과가 갈려요. 통증이 더 많았다는 설문 연구가 있지만, 10년 추적 연구와 문헌고찰은 큰 부상이 더 많다는 것을 확인하지 못했어요. 공식 지침은 직구와 체인지업을 먼저 익히고, 그 둘이 일정해진 뒤(만 13~14세쯤부터) 변화구를 더하라고 해요. 구종보다 많이 던지는 것과 지친 채 던지는 것이 더 뚜렷한 위험 요인이에요. 그립과 던지는 요령은 손 크기와 팔 각도에 따라 달라서 검증된 한 가지 방법이 없어요. 지도자와 직접 맞추는 것이 좋아요.',
    sources: [
      'PM18055920',
      'PM19448049',
      'PM16260466',
      'PM28968139',
      'PM12130397',
      'PM21098816',
      'PM25553209',
      'PS13',
      'PS09',
      'AM02',
    ],
    review: DRAFT,
  },
  {
    id: 'P09',
    topic: '제구',
    keys: ['제구', '컨트롤', '커맨드', '스트라이크', '로케이션', '볼넷'],
    body: '투수의 제구 훈련법을 직접 비교한 연구는 찾지 못했어요. 아래는 관련해서 알려진 것이에요. 공이 가는 곳은 놓는 순간의 방향(위아래 · 좌우 각도)과 속도가 거의 정해요. 아주 작은 각도 차이가 위치를 바꿔요. 동작 앞부분(앞발 착지부터 팔이 가장 젖혀질 때까지)의 어깨 · 몸통 움직임이 매번 비슷한 투수가 위치도 더 일정했어요. 수준이 높은 투수일수록 동작이 덜 흔들려요. 프로 투수에서 볼과 스트라이크 사이에 동작 차이는 측정되지 않았어요(연구 하나). 빗나간 공이 곧 동작 결함은 아니에요. 운동 기술 전반에서는 몸의 부위보다 목표(미트 · 공이 갈 길)에 주의를 두는 쪽이 수행과 학습에 더 좋았어요(메타분석, 투구 연구는 아니에요). 핸드볼 연구 하나에서는 정확하게 던지라는 지시만으로 숙련 선수의 정확도가 늘지 않고 속도만 줄었어요.',
    sources: [
      'PM33345028',
      'PM31449438',
      'PM19391491',
      'PM28968139',
      'PM34843301',
      'PM20078758',
      'PM12776824',
    ],
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
    body: '청소년 투수에서 큰 팔 부상과 가장 강하게 관련된 것은 지친 채로 자주 던지는 것과 너무 많이 던지는 것이었어요(여러 연구가 같은 방향, 대부분 설문 · 관찰 연구). 한 해에 던지는 이닝과 한 경기 공 수가 많을수록 통증과 부상이 많았어요. 연속된 날 던지기, 여러 팀에서 겹쳐 뛰기, 하루 여러 경기도 팔 통증과 관련됐어요(전국 설문 하나). 청소년 공식 지침은 한 해에 적어도 넉 달은 경기 투구를 쉬고, 그중 두세 달은 머리 위로 던지는 것을 모두 쉬라고 해요. 한 경기 안에서 지치면 먼저 구속이 떨어지고 몸통이 서요. 팔 부담이 늘어나는지는 결과가 갈려요. 지쳤다고 느끼거나 그렇게 보이면 그날 던지기를 멈추는 것이 지침이에요.',
    sources: [
      'PM16452269',
      'PM24627578',
      'PM21098816',
      'PM12130397',
      'PM16973902',
      'PS15',
      'AM02',
    ],
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
    body: '평지에서 던지는 것이 마운드보다 팔에 편하다고 단정할 수 없어요. 연구마다 차이가 없거나, 마운드가 조금 더 크거나, 달려와 던지는 평지 투구가 더 크게 나왔어요. 힘을 빼고 던져도 팔 부담은 느낌만큼 줄지 않아요. 체감 강도를 25% 낮출 때 팔꿈치 부담은 7%, 구속은 11%만 줄었어요(고교 · 대학 투수 연구). 마운드에서 체감 60%로 던졌을 때도 힘은 최대의 76%쯤이었어요(대학 투수 연구). 그래서 가볍게 던지는 날도 공 수로 세어야 하고, 앱이 체감 강도와 공 수를 같이 적게 하는 까닭이에요.',
    sources: ['PM24664135', 'PM24427428', 'PM30207787', 'PM27872403', 'PM31150269'],
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
    body: '시즌 중에도 근력 운동을 이어 가면 근력을 지킬 수 있어요. 프로 축구 선수 연구에서 무거운 근력 운동을 주 1번만 해도 12주 동안 근력이 유지됐고, 2주에 1번으로는 유지되지 않았어요. 리뷰는 유지에 가장 중요한 것이 강도(무게)이고, 횟수와 양은 꽤 줄여도 된다고 정리해요. 다만 선수에게 딱 맞는 최소량은 아직 자료가 모자라요. 시즌 중 근력 운동을 끊은 프로 핸드볼 선수는 7주 뒤 던지는 속도가 떨어졌어요(연구 하나). 야구 투수를 직접 본 연구는 아니에요. 등판 앞뒤로 언제 얼마나 할지는 앱이 등판 일정에 맞춰 정해요.',
    sources: ['PM21873897', 'PM33629972', 'PM16937969'],
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
    body: '장거리 달리기와 스프린트 중 무엇이 투수에게 더 좋은지 구속이나 등판 사이 회복으로 직접 비교한 연구는 찾지 못했어요. 대학 야구 선수 16명 연구에서 시즌 중 지구력 달리기를 한 쪽은 하체 파워가 줄고 스피드 · 인터벌을 한 쪽은 늘었어요(작은 연구 하나). 반대로 MLB 선발 투수에서는 유산소 능력이 높을수록 시즌 성적이 좋은 경향이 있었어요(연구 하나). 유산소가 쓸모없다고도 말할 수 없어요. 메타분석으로는 유산소와 근력 운동을 같이 해도 최대 근력과 근육량은 평균적으로 줄지 않지만 순발력은 덜 늘어요. 같은 시간에 붙여 할 때 더 그래요. 그래서 유산소는 하되 파워 운동과 시간을 떼어 놓는 쪽이 근거에 맞아요. 달리기로 젖산을 빼야 근육통이 풀린다는 말은 근거가 없어요.',
    sources: ['PM18296980', 'PM29910262', 'PM34757594', 'PM33751469', 'PM27409551'],
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
    body: '코어만 따로 훈련하면 경기력이 오르는지는 결과가 갈려요. 예전 문헌고찰은 보탬이 작다고 했고, 더 최근 메타분석은 선수에게 중간 정도 효과가 있다고 했어요. 프로 투수 추적 연구에서는 한 발로 서서 허리 · 골반을 가누는 검사 점수가 나쁜 투수가 부상으로 오래 빠질 위험이 더 컸어요(관련만 본 연구). 코어 훈련이 구속을 올리는지 야구 투수로 확인한 연구는 찾지 못했어요. 그래서 코어는 다른 훈련과 같이 꾸준히 하는 기본으로 보는 쪽이 맞고, 코어만으로 구속이 오른다고 말할 근거는 없어요.',
    sources: ['PM22784233', 'PM35061213', 'PM25159541'],
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
    body: '한 번 던지고 나면 어깨 힘이 바로 떨어져요. 투수 13명을 본 연구에서 경기 뒤 어깨 안쪽 돌림 힘이 18% 줄었어요. 다른 작은 연구에서는 바깥 돌림 힘이 사흘째에, 안쪽 돌림 범위는 나흘째에 돌아왔어요. 암케어를 던지기 전에 할지 뒤에 할지 직접 견준 연구는 찾지 못했어요. 회전근개가 지치면 팔을 들 때 어깨 관절 움직임이 달라졌어요(실험). 던지기 전에 보강 운동으로 어깨를 미리 지치게 하면 좋지 않을 수 있다는 뜻이에요. 그래서 던지기 전에는 지치지 않을 만큼 가볍게 하고, 힘든 보강은 던진 뒤나 안 던지는 날에 하는 것이 무난한 관례예요. 증명된 규칙은 아니에요. 상체 준비 운동은 움직이며 하는 강한 준비가 파워와 근력 발휘에 도움이 됐어요(체계적 문헌고찰). 준비 운동이 상체 부상을 줄이는지 본 연구는 그 문헌고찰에 없었어요.',
    sources: [
      'PM15611006',
      'PM35286185',
      'PM21831667',
      'PM18668167',
      'PM17597949',
      'PM25694615',
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
