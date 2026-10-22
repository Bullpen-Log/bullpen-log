/**
 * 둥근 야구 아이콘(2026-10-21 금윤호 — rounded-baseball-icons-2 의 13종, 2026-10-22 rounded-baseball-icons-3 의 26종 + 단순판 셋) — 테두리형(outline) · 채움형(filled) 한 쌍씩.
 * 웹(components/round-icon.tsx)과 앱(native/src/shell/round-icon.tsx)이 같은 그림을 쓰려고 순수 문자열로 둔다(viewBox 0 0 64 64).
 * outline: {{W}} 는 선 굵기(64 칸 기준) · 색은 currentColor. filled: 구멍은 마스크로 — {{ID}} 를 그림마다 다른 이름으로 바꿔 쓴다.
 */
export type RoundIconName =
  | 'home' | 'baseball' | 'bat' | 'community' | 'menu' | 'bell' | 'settings' | 'training' | 'cutlery' | 'radar' | 'zone' | 'pitcher' | 'support'
  /* 14~39(2026-10-22 금윤호 — rounded-baseball-icons-3): 덕아웃(장터 · 레슨 · 연습장 · 장비 · 채팅)과 동작(검색 · 올리기 · 찜 · 별점 · 뒤로 · 고치기 · 지우기 ·
     신고 · 사진 · 잠금 · 숨김 · 내 정보), 싱커 메뉴(기록 · 암케어 · 영상 · 촬영 · 구속 관리자 · 관리자 · 팀 관리 · 인기 · 자료실) */
  | 'market' | 'lesson' | 'venue' | 'gear' | 'chat' | 'search' | 'plus' | 'heart' | 'star' | 'back' | 'pencil' | 'trash' | 'flag'
  | 'photo-plus' | 'lock' | 'eye-off' | 'user' | 'log' | 'armcare' | 'video' | 'clapper' | 'gauge' | 'shield' | 'people' | 'flame' | 'book'
  /* 20px 밑 작은 자리용 단순판(디자이너 제공 simpler-variants) — 레슨 공 실밥 · 글러브 손가락 · 암케어 맥박을 뺐다 */
  | 'lesson-simple' | 'gear-simple' | 'armcare-simple';

export const ROUND_ICONS: Record<RoundIconName, { outline: string; filled: string }> = {
  home: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 27 28 10Q32 6 36 10L55 27Q60 32 54 35H51V51Q51 56 46 56H37V43Q37 38 32 38Q27 38 27 43V56H18Q13 56 13 51V35H10Q4 33 9 27Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><path d=\"M27 56V43Q27 38 32 38Q37 38 37 43V56Z\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M9 27 28 10Q32 6 36 10L55 27Q60 32 54 35H51V51Q51 56 46 56H18Q13 56 13 51V35H10Q4 33 9 27Z\"/></g>",
  },
  baseball: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"32\" cy=\"32\" r=\"24\"/><path d=\"M16 14Q30 32 16 50M48 14Q34 32 48 50M17 19L23 16M21 26L27 24M23 33H29M21 40L27 42M17 46L23 49M47 19L41 16M43 26L37 24M41 33H35M43 40L37 42M47 46L41 49\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.8\" stroke-linecap=\"round\"><path d=\"M16 12Q32 32 16 52M48 12Q32 32 48 52\"/><path d=\"M16 18L23 15M20 25L27 23M22 33H29M20 41L27 43M16 47L23 50M48 18L41 15M44 25L37 23M42 33H35M44 41L37 43M48 47L41 50\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><circle cx=\"32\" cy=\"32\" r=\"24\"/></g>",
  },
  bat: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 49 15 43Q22 36 27 28L39 11Q45 3 53 10Q60 17 52 24L35 37Q27 42 21 49L17 54Q18 58 14 58Q10 57 6 53Q4 49 7 48Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M9 49 15 43Q22 36 27 28L39 11Q45 3 53 10Q60 17 52 24L35 37Q27 42 21 49L17 54Q18 58 14 58Q10 57 6 53Q4 49 7 48Z\"/></g>",
  },
  community: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 29Q8 11 28 11Q48 11 48 29Q48 46 28 46H21L12 52Q9 54 10 50L12 42Q8 37 8 29Z\"/><path d=\"M52 27Q57 32 57 41Q57 48 52 52L54 57Q55 60 51 58L43 54H37Q32 54 28 51\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M8 29Q8 11 28 11Q48 11 48 29Q48 46 28 46H21L12 52Q9 54 10 50L12 42Q8 37 8 29ZM47 26Q57 29 57 41Q57 48 52 52L54 57Q55 60 51 58L43 54H37Q27 54 24 50Q50 52 52 30Z\"/></g>",
  },
  menu: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"14\" width=\"46\" height=\"8\" rx=\"4\"/><rect x=\"9\" y=\"28\" width=\"46\" height=\"8\" rx=\"4\"/><rect x=\"9\" y=\"42\" width=\"46\" height=\"8\" rx=\"4\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><rect x=\"9\" y=\"14\" width=\"46\" height=\"8\" rx=\"4\"/><rect x=\"9\" y=\"28\" width=\"46\" height=\"8\" rx=\"4\"/><rect x=\"9\" y=\"42\" width=\"46\" height=\"8\" rx=\"4\"/></g>",
  },
  bell: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M28 12Q28 6 32 6Q36 6 36 12Q49 15 49 30V38Q49 42 54 47Q56 52 50 52H14Q8 52 10 47Q15 42 15 38V30Q15 16 28 12Z\"/><path d=\"M27 56Q28 60 32 60Q36 60 37 56\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M28 12Q28 6 32 6Q36 6 36 12Q49 15 49 30V38Q49 42 54 47Q56 52 50 52H14Q8 52 10 47Q15 42 15 38V30Q15 16 28 12Z\"/><path d=\"M26 55H38Q37 61 32 61Q27 61 26 55Z\"/></g>",
  },
  settings: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M24.18 14.73Q24.73 14.45 25.32 14.25L26.82 13.76Q27.4 13.56 27.34 12.11L27.19 8.42Q27.13 6.97 29.28 6.97L34.72 6.97Q36.87 6.97 36.81 8.42L36.66 12.11Q36.6 13.56 37.18 13.76L38.68 14.25Q39.27 14.45 39.82 14.73L41.23 15.43Q41.79 15.71 42.77 14.65L45.28 11.93Q46.26 10.86 47.77 12.37L51.63 16.23Q53.14 17.74 52.07 18.72L49.35 21.23Q48.29 22.21 48.57 22.77L49.27 24.18Q49.55 24.73 49.75 25.32L50.24 26.82Q50.44 27.4 51.89 27.34L55.58 27.19Q57.03 27.13 57.03 29.28L57.03 34.72Q57.03 36.87 55.58 36.81L51.89 36.66Q50.44 36.6 50.24 37.18L49.75 38.68Q49.55 39.27 49.27 39.82L48.57 41.23Q48.29 41.79 49.35 42.77L52.07 45.28Q53.14 46.26 51.63 47.77L47.77 51.63Q46.26 53.14 45.28 52.07L42.77 49.35Q41.79 48.29 41.23 48.57L39.82 49.27Q39.27 49.55 38.68 49.75L37.18 50.24Q36.6 50.44 36.66 51.89L36.81 55.58Q36.87 57.03 34.72 57.03L29.28 57.03Q27.13 57.03 27.19 55.58L27.34 51.89Q27.4 50.44 26.82 50.24L25.32 49.75Q24.73 49.55 24.18 49.27L22.77 48.57Q22.21 48.29 21.23 49.35L18.72 52.07Q17.74 53.14 16.23 51.63L12.37 47.77Q10.86 46.26 11.93 45.28L14.65 42.77Q15.71 41.79 15.43 41.23L14.73 39.82Q14.45 39.27 14.25 38.68L13.76 37.18Q13.56 36.6 12.11 36.66L8.42 36.81Q6.97 36.87 6.97 34.72L6.97 29.28Q6.97 27.13 8.42 27.19L12.11 27.34Q13.56 27.4 13.76 26.82L14.25 25.32Q14.45 24.73 14.73 24.18L15.43 22.77Q15.71 22.21 14.65 21.23L11.93 18.72Q10.86 17.74 12.37 16.23L16.23 12.37Q17.74 10.86 18.72 11.93L21.23 14.65Q22.21 15.71 22.77 15.43Z\"/><circle cx=\"32\" cy=\"32\" r=\"8\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><circle cx=\"32\" cy=\"32\" r=\"8\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><circle cx=\"32\" cy=\"32\" r=\"19\"/><g transform=\"rotate(0 32 32)\"><rect x=\"26\" y=\"6\" width=\"12\" height=\"17\" rx=\"4\"/></g><g transform=\"rotate(45 32 32)\"><rect x=\"26\" y=\"6\" width=\"12\" height=\"17\" rx=\"4\"/></g><g transform=\"rotate(90 32 32)\"><rect x=\"26\" y=\"6\" width=\"12\" height=\"17\" rx=\"4\"/></g><g transform=\"rotate(135 32 32)\"><rect x=\"26\" y=\"6\" width=\"12\" height=\"17\" rx=\"4\"/></g><g transform=\"rotate(180 32 32)\"><rect x=\"26\" y=\"6\" width=\"12\" height=\"17\" rx=\"4\"/></g><g transform=\"rotate(225 32 32)\"><rect x=\"26\" y=\"6\" width=\"12\" height=\"17\" rx=\"4\"/></g><g transform=\"rotate(270 32 32)\"><rect x=\"26\" y=\"6\" width=\"12\" height=\"17\" rx=\"4\"/></g><g transform=\"rotate(315 32 32)\"><rect x=\"26\" y=\"6\" width=\"12\" height=\"17\" rx=\"4\"/></g></g>",
  },
  training: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"12\" y=\"16\" width=\"11\" height=\"32\" rx=\"4\"/><rect x=\"41\" y=\"16\" width=\"11\" height=\"32\" rx=\"4\"/><path d=\"M23 28H41M23 36H41M9 24H8Q5 24 5 27V37Q5 40 8 40H9M55 24H56Q59 24 59 27V37Q59 40 56 40H55\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><rect x=\"5\" y=\"24\" width=\"8\" height=\"16\" rx=\"3\"/><rect x=\"12\" y=\"16\" width=\"11\" height=\"32\" rx=\"4\"/><rect x=\"22\" y=\"28\" width=\"20\" height=\"8\" rx=\"3\"/><rect x=\"41\" y=\"16\" width=\"11\" height=\"32\" rx=\"4\"/><rect x=\"51\" y=\"24\" width=\"8\" height=\"16\" rx=\"3\"/></g>",
  },
  cutlery: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10 10Q10 7 13 7Q16 7 16 10V23H20V10Q20 7 23 7Q26 7 26 10V23H30V10Q30 7 33 7Q36 7 36 10V24Q36 33 27 36V53Q27 58 23 58Q19 58 19 53V36Q10 33 10 24Z\"/><path d=\"M53 8Q56 8 56 12V53Q56 58 51 58Q46 58 46 53V38H43Q39 38 40 33Q41 14 50 9Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M10 10Q10 7 13 7Q16 7 16 10V23H20V10Q20 7 23 7Q26 7 26 10V23H30V10Q30 7 33 7Q36 7 36 10V24Q36 33 27 36V53Q27 58 23 58Q19 58 19 53V36Q10 33 10 24Z\"/><path d=\"M53 8Q56 8 56 12V53Q56 58 51 58Q46 58 46 53V38H43Q39 38 40 33Q41 14 50 9Z\"/></g>",
  },
  radar: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 13H44Q50 13 52 20L55 31Q57 37 50 39H41L45 52Q47 58 40 58H35Q31 58 30 54L26 39H12Q7 39 7 34V18Q7 13 9 13Z\"/><rect x=\"34\" y=\"20\" width=\"13\" height=\"7\" rx=\"2\"/><path d=\"M15 20V32M3 20V32\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><rect x=\"34\" y=\"20\" width=\"13\" height=\"7\" rx=\"2\"/><rect x=\"12\" y=\"19\" width=\"4\" height=\"14\" rx=\"2\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M9 13H44Q50 13 52 20L55 31Q57 37 50 39H41L45 52Q47 58 40 58H35Q31 58 30 54L26 39H12Q7 39 7 34V18Q7 13 9 13Z\"/><rect x=\"3\" y=\"18\" width=\"4\" height=\"16\" rx=\"2\"/></g>",
  },
  zone: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"13.5\" y=\"9.5\" width=\"10\" height=\"13\" rx=\"2.5\"/><rect x=\"26.5\" y=\"9.5\" width=\"10\" height=\"13\" rx=\"2.5\"/><rect x=\"39.5\" y=\"9.5\" width=\"10\" height=\"13\" rx=\"2.5\"/><rect x=\"13.5\" y=\"25.5\" width=\"10\" height=\"13\" rx=\"2.5\"/><rect x=\"26.5\" y=\"25.5\" width=\"10\" height=\"13\" rx=\"2.5\"/><rect x=\"39.5\" y=\"25.5\" width=\"10\" height=\"13\" rx=\"2.5\"/><rect x=\"13.5\" y=\"41.5\" width=\"10\" height=\"13\" rx=\"2.5\"/><rect x=\"26.5\" y=\"41.5\" width=\"10\" height=\"13\" rx=\"2.5\"/><rect x=\"39.5\" y=\"41.5\" width=\"10\" height=\"13\" rx=\"2.5\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><rect x=\"13\" y=\"9\" width=\"11\" height=\"14\" rx=\"2.8\"/><rect x=\"26\" y=\"9\" width=\"11\" height=\"14\" rx=\"2.8\"/><rect x=\"39\" y=\"9\" width=\"11\" height=\"14\" rx=\"2.8\"/><rect x=\"13\" y=\"25\" width=\"11\" height=\"14\" rx=\"2.8\"/><rect x=\"26\" y=\"25\" width=\"11\" height=\"14\" rx=\"2.8\"/><rect x=\"39\" y=\"25\" width=\"11\" height=\"14\" rx=\"2.8\"/><rect x=\"13\" y=\"41\" width=\"11\" height=\"14\" rx=\"2.8\"/><rect x=\"26\" y=\"41\" width=\"11\" height=\"14\" rx=\"2.8\"/><rect x=\"39\" y=\"41\" width=\"11\" height=\"14\" rx=\"2.8\"/></g>",
  },
  /* 투구 모션 — 2026-10-22 금윤호가 준 새 그림(팔 뒤로 공 · 글러브 팔 감음 · 크게 내딛음)으로 바꿈 */
  pitcher: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M19.9 13L24.2 19.1Q24.7 19.6 25.2 19.6H41.3Q42 19.6 42.6 19.8L49.6 21.8Q53.9 23 53.9 27.8Q53.9 30.2 52.3 32.2Q50.3 34.6 47.4 34.8Q44.5 34.8 43.8 31.4Q43.8 29.4 45.6 28.4L47.7 27.5Q49 26.6 47.7 25.6L42.6 24.2Q41.6 24.2 41.6 25V35.2Q41.6 35.8 42.1 36.2L49 39.8Q52.3 42 53.6 44.9L56.4 51.6Q57 52.6 58 52.8Q60.4 53 60.4 54.7Q60.4 56.6 58.6 56.6H55.6Q54 56.6 53.6 55L53.2 53.4L49.5 47.2Q49 46 47.9 45.6L37.7 41.8Q36.5 41.4 35.7 41.8L30.1 46.7Q27.6 48.5 24 50.2L6.6 58.1Q4.5 58.6 4.1 56.6Q4.1 55 5.1 54.3L21.9 45.5Q22.7 45 23.7 43.9L29.4 37.6Q30.1 36.8 30.1 36V24.4Q30.1 23.6 29.3 23.6H23.7Q22.3 23.6 21.2 22.2L16.6 14.5A3.6 3.6 0 1 1 19.9 13Z\"/><circle cx=\"34.8\" cy=\"13.7\" r=\"5.1\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M19.9 13L24.2 19.1Q24.7 19.6 25.2 19.6H41.3Q42 19.6 42.6 19.8L49.6 21.8Q53.9 23 53.9 27.8Q53.9 30.2 52.3 32.2Q50.3 34.6 47.4 34.8Q44.5 34.8 43.8 31.4Q43.8 29.4 45.6 28.4L47.7 27.5Q49 26.6 47.7 25.6L42.6 24.2Q41.6 24.2 41.6 25V35.2Q41.6 35.8 42.1 36.2L49 39.8Q52.3 42 53.6 44.9L56.4 51.6Q57 52.6 58 52.8Q60.4 53 60.4 54.7Q60.4 56.6 58.6 56.6H55.6Q54 56.6 53.6 55L53.2 53.4L49.5 47.2Q49 46 47.9 45.6L37.7 41.8Q36.5 41.4 35.7 41.8L30.1 46.7Q27.6 48.5 24 50.2L6.6 58.1Q4.5 58.6 4.1 56.6Q4.1 55 5.1 54.3L21.9 45.5Q22.7 45 23.7 43.9L29.4 37.6Q30.1 36.8 30.1 36V24.4Q30.1 23.6 29.3 23.6H23.7Q22.3 23.6 21.2 22.2L16.6 14.5A3.6 3.6 0 1 1 19.9 13Z\"/><circle cx=\"34.8\" cy=\"13.7\" r=\"5.1\"/></g>",
  },

  support: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 29V28Q12 9 32 9Q52 9 52 28V29\"/><rect x=\"7\" y=\"29\" width=\"12\" height=\"20\" rx=\"5\"/><rect x=\"45\" y=\"29\" width=\"12\" height=\"20\" rx=\"5\"/><path d=\"M52 49Q52 55 42 55\"/><rect x=\"29\" y=\"51\" width=\"13\" height=\"8\" rx=\"4\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M9 32V29Q9 6 32 6Q55 6 55 29V35H49V29Q49 13 32 13Q15 13 15 29V35H9Z\"/><rect x=\"7\" y=\"29\" width=\"12\" height=\"20\" rx=\"5\"/><rect x=\"45\" y=\"29\" width=\"12\" height=\"20\" rx=\"5\"/><path d=\"M49 46H55Q55 57 42 57H35V51H42Q49 51 49 46Z\"/><rect x=\"28\" y=\"49\" width=\"14\" height=\"10\" rx=\"5\"/></g>",
  },
  market: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10 12Q10 8 14 8H32Q35 8 37 10L56 29Q59 32 56 35L35 56Q32 59 29 56L10 37Q8 35 8 32V16Q8 12 12 12Z\"/><circle cx=\"11\" cy=\"11\" r=\"4\"/><circle cx=\"20\" cy=\"20\" r=\"4\"/><circle cx=\"11\" cy=\"11\" r=\"2\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><circle cx=\"20\" cy=\"20\" r=\"4\"/><circle cx=\"11\" cy=\"11\" r=\"2\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M10 12Q10 8 14 8H32Q35 8 37 10L56 29Q59 32 56 35L35 56Q32 59 29 56L10 37Q8 35 8 32V16Q8 12 12 12Z\"/><circle cx=\"11\" cy=\"11\" r=\"4\"/></g>",
  },
  lesson: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"12\" width=\"46\" height=\"44\" rx=\"7\"/><rect x=\"18\" y=\"7\" width=\"4\" height=\"10\" rx=\"2\"/><rect x=\"42\" y=\"7\" width=\"4\" height=\"10\" rx=\"2\"/><path d=\"M9 23H55\"/><circle cx=\"32\" cy=\"39\" r=\"10\"/><path d=\"M28 30Q34 39 28 48M36 30Q30 39 36 48\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 23H55\"/><circle cx=\"32\" cy=\"39\" r=\"10\"/><path d=\"M28 30Q34 39 28 48M36 30Q30 39 36 48\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><rect x=\"9\" y=\"12\" width=\"46\" height=\"44\" rx=\"7\"/><rect x=\"18\" y=\"7\" width=\"4\" height=\"10\" rx=\"2\"/><rect x=\"42\" y=\"7\" width=\"4\" height=\"10\" rx=\"2\"/></g>",
  },
  venue: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M32 58Q12 39 12 26C12 1 52 1 52 26Q52 39 32 58Z\"/><path d=\"M24 22Q24 20 26 20H38Q40 20 40 22V30L32 37L24 30Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><path d=\"M24 22Q24 20 26 20H38Q40 20 40 22V30L32 37L24 30Z\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M32 58Q12 39 12 26C12 1 52 1 52 26Q52 39 32 58Z\"/></g>",
  },
  gear: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M17 53Q8 47 8 36V27Q8 22 12 22Q16 22 16 27V32L18 15Q18 10 22 10Q26 10 26 15V27L28 10Q29 6 33 7Q37 8 36 13L35 27L39 12Q40 8 44 10Q48 11 46 16L42 30L47 21Q49 17 53 20Q56 22 54 26L47 44Q43 56 32 57Q23 58 17 53Z\"/><path d=\"M19 39Q29 33 39 41M24 47Q30 44 36 47\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M19 39Q29 33 39 41M24 47Q30 44 36 47\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M17 53Q8 47 8 36V27Q8 22 12 22Q16 22 16 27V32L18 15Q18 10 22 10Q26 10 26 15V27L28 10Q29 6 33 7Q37 8 36 13L35 27L39 12Q40 8 44 10Q48 11 46 16L42 30L47 21Q49 17 53 20Q56 22 54 26L47 44Q43 56 32 57Q23 58 17 53Z\"/></g>",
  },
  chat: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M11 46Q7 40 7 30Q7 10 31 10Q56 10 56 30Q56 49 33 49H22L10 56Z\"/><circle cx=\"22\" cy=\"30\" r=\"2.2\"/><circle cx=\"32\" cy=\"30\" r=\"2.2\"/><circle cx=\"42\" cy=\"30\" r=\"2.2\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><circle cx=\"22\" cy=\"30\" r=\"2.2\"/><circle cx=\"32\" cy=\"30\" r=\"2.2\"/><circle cx=\"42\" cy=\"30\" r=\"2.2\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M11 46Q7 40 7 30Q7 10 31 10Q56 10 56 30Q56 49 33 49H22L10 56Z\"/></g>",
  },
  search: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"27\" cy=\"27\" r=\"18\"/><path d=\"M40 45L44 41Q46 39 48 41L57 50Q60 53 57 56Q54 59 51 56L40 45Z\"/><circle cx=\"27\" cy=\"27\" r=\"11\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><circle cx=\"27\" cy=\"27\" r=\"11\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><circle cx=\"27\" cy=\"27\" r=\"18\"/><path d=\"M40 45L44 41Q46 39 48 41L57 50Q60 53 57 56Q54 59 51 56L40 45Z\"/></g>",
  },
  plus: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M28 12Q28 8 32 8Q36 8 36 12V28H52Q56 28 56 32Q56 36 52 36H36V52Q36 56 32 56Q28 56 28 52V36H12Q8 36 8 32Q8 28 12 28H28Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M28 12Q28 8 32 8Q36 8 36 12V28H52Q56 28 56 32Q56 36 52 36H36V52Q36 56 32 56Q28 56 28 52V36H12Q8 36 8 32Q8 28 12 28H28Z\"/></g>",
  },
  heart: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M32 55Q30 55 27 52L11 36C-2 21 15 2 29 16L32 19L35 16C49 2 66 21 53 36L37 52Q34 55 32 55Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M32 55Q30 55 27 52L11 36C-2 21 15 2 29 16L32 19L35 16C49 2 66 21 53 36L37 52Q34 55 32 55Z\"/></g>",
  },
  star: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M29 9Q32 3 35 9L41 22L55 24Q62 25 57 30L46 40L49 54Q50 60 44 57L32 50L20 57Q14 60 15 54L18 40L7 30Q2 25 9 24L23 22Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M29 9Q32 3 35 9L41 22L55 24Q62 25 57 30L46 40L49 54Q50 60 44 57L32 50L20 57Q14 60 15 54L18 40L7 30Q2 25 9 24L23 22Z\"/></g>",
  },
  back: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M40 9Q43 12 40 15L23 32L40 49Q43 52 40 55Q37 58 34 55L14 35Q11 32 14 29L34 9Q37 6 40 9Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M40 9Q43 12 40 15L23 32L40 49Q43 52 40 55Q37 58 34 55L14 35Q11 32 14 29L34 9Q37 6 40 9Z\"/></g>",
  },
  pencil: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M13 40L42 11Q46 7 50 11L54 15Q58 19 54 23L25 52L12 55Q9 56 10 53Z\"/><path d=\"M37 16L49 28M13 40L25 52\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M37 16L49 28M13 40L25 52\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M13 40L42 11Q46 7 50 11L54 15Q58 19 54 23L25 52L12 55Q9 56 10 53Z\"/></g>",
  },
  trash: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14 21H50L47 51Q47 56 42 56H22Q17 56 17 51Z\"/><rect x=\"9\" y=\"13\" width=\"46\" height=\"8\" rx=\"4\"/><rect x=\"24\" y=\"7\" width=\"16\" height=\"6\" rx=\"3\"/><path d=\"M26 29V47M38 29V47\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M26 29V47M38 29V47\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M14 21H50L47 51Q47 56 42 56H22Q17 56 17 51Z\"/><rect x=\"9\" y=\"13\" width=\"46\" height=\"8\" rx=\"4\"/><rect x=\"24\" y=\"7\" width=\"16\" height=\"6\" rx=\"3\"/></g>",
  },
  flag: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"7\" width=\"6\" height=\"50\" rx=\"3\"/><path d=\"M15 12Q26 6 35 12Q43 17 54 11V37Q43 43 34 37Q25 31 15 37Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><rect x=\"9\" y=\"7\" width=\"6\" height=\"50\" rx=\"3\"/><path d=\"M15 12Q26 6 35 12Q43 17 54 11V37Q43 43 34 37Q25 31 15 37Z\"/></g>",
  },
  "photo-plus": {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"7\" y=\"15\" width=\"42\" height=\"41\" rx=\"6\"/><path d=\"M47 9Q47 6 50 6Q53 6 53 9V14H57Q60 14 60 17Q60 20 57 20H53V24Q53 27 50 27Q47 27 47 24V20H43Q40 20 40 17Q40 14 43 14H47Z\"/><circle cx=\"20\" cy=\"28\" r=\"3.5\"/><path d=\"M12 48L23 36Q25 34 27 37L32 43L36 39Q38 37 40 40L45 48\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><circle cx=\"20\" cy=\"28\" r=\"3.5\"/><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 48L23 36Q25 34 27 37L32 43L36 39Q38 37 40 40L45 48\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><rect x=\"7\" y=\"15\" width=\"42\" height=\"41\" rx=\"6\"/><path d=\"M47 9Q47 6 50 6Q53 6 53 9V14H57Q60 14 60 17Q60 20 57 20H53V24Q53 27 50 27Q47 27 47 24V20H43Q40 20 40 17Q40 14 43 14H47Z\"/></g>",
  },
  lock: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"11\" y=\"27\" width=\"42\" height=\"30\" rx=\"7\"/><path d=\"M19 27V20C19 2 45 2 45 20V27H39V20C39 10 25 10 25 20V27Z\"/><circle cx=\"32\" cy=\"40\" r=\"3\"/><path d=\"M32 43V48\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><circle cx=\"32\" cy=\"40\" r=\"3\"/><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M32 43V48\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><rect x=\"11\" y=\"27\" width=\"42\" height=\"30\" rx=\"7\"/><path d=\"M19 27V20C19 2 45 2 45 20V27H39V20C39 10 25 10 25 20V27Z\"/></g>",
  },
  "eye-off": {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 29Q32 4 56 29Q59 32 56 35Q32 60 8 35Q5 32 8 29Z\"/><path d=\"M11 7Q13 5 15 7L57 49Q59 51 57 53Q55 55 53 53L11 11Q9 9 11 7Z\"/><circle cx=\"32\" cy=\"32\" r=\"9\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><circle cx=\"32\" cy=\"32\" r=\"9\"/><path d=\"M11 7Q13 5 15 7L57 49Q59 51 57 53Q55 55 53 53L11 11Q9 9 11 7Z\" fill=\"white\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M8 29Q32 4 56 29Q59 32 56 35Q32 60 8 35Q5 32 8 29Z\"/><path d=\"M11 7Q13 5 15 7L57 49Q59 51 57 53Q55 55 53 53L11 11Q9 9 11 7Z\"/></g>",
  },
  user: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"32\" cy=\"18\" r=\"10\"/><path d=\"M10 52Q10 34 32 34Q54 34 54 52Q54 57 49 57H15Q10 57 10 52Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><circle cx=\"32\" cy=\"18\" r=\"10\"/><path d=\"M10 52Q10 34 32 34Q54 34 54 52Q54 57 49 57H15Q10 57 10 52Z\"/></g>",
  },
  log: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"12\" y=\"10\" width=\"42\" height=\"47\" rx=\"6\"/><rect x=\"23\" y=\"6\" width=\"20\" height=\"9\" rx=\"4\"/><path d=\"M22 25L25 28L30 22M35 26H45M22 38L25 41L30 35M35 39H45M22 50H29M35 50H45\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 25L25 28L30 22M35 26H45M22 38L25 41L30 35M35 39H45M22 50H29M35 50H45\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><rect x=\"12\" y=\"10\" width=\"42\" height=\"47\" rx=\"6\"/><rect x=\"23\" y=\"6\" width=\"20\" height=\"9\" rx=\"4\"/></g>",
  },
  armcare: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10 53V31Q10 21 20 21Q29 21 29 31V39H43V27H40Q37 27 37 24V15Q37 9 43 9H48Q54 9 54 15V41Q54 54 41 54H14Q10 54 10 53Z\"/><path d=\"M15 36H20L23 31L27 42L31 36H36\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M15 36H20L23 31L27 42L31 36H36\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M10 53V31Q10 21 20 21Q29 21 29 31V39H43V27H40Q37 27 37 24V15Q37 9 43 9H48Q54 9 54 15V41Q54 54 41 54H14Q10 54 10 53Z\"/></g>",
  },
  video: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"7\" y=\"13\" width=\"50\" height=\"38\" rx=\"8\"/><path d=\"M27 23Q25 22 25 25V39Q25 42 28 40L40 33Q42 32 40 30Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><path d=\"M27 23Q25 22 25 25V39Q25 42 28 40L40 33Q42 32 40 30Z\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><rect x=\"7\" y=\"13\" width=\"50\" height=\"38\" rx=\"8\"/></g>",
  },
  clapper: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"24\" width=\"46\" height=\"32\" rx=\"6\"/><path d=\"M9 14Q9 10 13 10L49 6Q53 6 54 10L55 18L10 23Z\"/><path d=\"M20 10L26 21M35 8L41 19M10 32H54\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 10L26 21M35 8L41 19M10 32H54\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><rect x=\"9\" y=\"24\" width=\"46\" height=\"32\" rx=\"6\"/><path d=\"M9 14Q9 10 13 10L49 6Q53 6 54 10L55 18L10 23Z\"/></g>",
  },
  gauge: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"32\" cy=\"32\" r=\"25\"/><path d=\"M32 32L43 22M20 44H44M16 30H20M22 17L24 21M32 12V17M44 16L42 20M48 30H44\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M32 32L43 22M20 44H44M16 30H20M22 17L24 21M32 12V17M44 16L42 20M48 30H44\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><circle cx=\"32\" cy=\"32\" r=\"25\"/></g>",
  },
  shield: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M30 7Q32 6 34 7Q43 12 52 13Q54 13 54 16V30Q54 47 34 57Q32 59 30 57Q10 47 10 30V16Q10 13 12 13Q21 12 30 7Z\"/><path d=\"M31 21Q32 18 33 21L36 27L43 28Q46 28 44 30L39 35L40 42Q41 45 38 43L32 40L26 43Q23 45 24 42L25 35L20 30Q18 28 21 28L28 27Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><path d=\"M31 21Q32 18 33 21L36 27L43 28Q46 28 44 30L39 35L40 42Q41 45 38 43L32 40L26 43Q23 45 24 42L25 35L20 30Q18 28 21 28L28 27Z\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M30 7Q32 6 34 7Q43 12 52 13Q54 13 54 16V30Q54 47 34 57Q32 59 30 57Q10 47 10 30V16Q10 13 12 13Q21 12 30 7Z\"/></g>",
  },
  people: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"41\" cy=\"19\" r=\"8\"/><path d=\"M30 45Q30 32 43 32Q57 32 57 45V49H48\"/><circle cx=\"24\" cy=\"22\" r=\"10\"/><path d=\"M6 51Q6 36 24 36Q43 36 43 51Q43 56 38 56H11Q6 56 6 51Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><circle cx=\"41\" cy=\"19\" r=\"8\"/><path d=\"M30 45Q30 32 43 32Q57 32 57 45V49H48\"/><circle cx=\"24\" cy=\"22\" r=\"10\"/><path d=\"M6 51Q6 36 24 36Q43 36 43 51Q43 56 38 56H11Q6 56 6 51Z\"/></g>",
  },
  flame: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M34 6Q37 18 45 23Q56 31 53 42Q50 57 33 58Q15 58 11 44Q7 32 20 21Q18 30 25 32Q35 25 31 10Q30 5 34 6Z\"/><path d=\"M32 36Q44 45 37 51Q32 55 27 50Q22 44 32 36Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><path d=\"M32 36Q44 45 37 51Q32 55 27 50Q22 44 32 36Z\"/></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M34 6Q37 18 45 23Q56 31 53 42Q50 57 33 58Q15 58 11 44Q7 32 20 21Q18 30 25 32Q35 25 31 10Q30 5 34 6Z\"/></g>",
  },
  book: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M32 16Q20 8 9 11Q6 12 6 16V48Q6 52 10 51Q21 48 32 56Q43 48 54 51Q58 52 58 48V16Q58 12 55 11Q44 8 32 16Z\"/><path d=\"M32 16V56M14 22Q21 21 26 25M14 33Q21 32 26 36M38 25Q44 21 50 22M38 36Q44 32 50 33\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M32 16V56M14 22Q21 21 26 25M14 33Q21 32 26 36M38 25Q44 21 50 22M38 36Q44 32 50 33\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M32 16Q20 8 9 11Q6 12 6 16V48Q6 52 10 51Q21 48 32 56Q43 48 54 51Q58 52 58 48V16Q58 12 55 11Q44 8 32 16Z\"/></g>",
  },
  "lesson-simple": {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"12\" width=\"46\" height=\"44\" rx=\"7\"/><rect x=\"18\" y=\"7\" width=\"4\" height=\"10\" rx=\"2\"/><rect x=\"42\" y=\"7\" width=\"4\" height=\"10\" rx=\"2\"/><path d=\"M9 23H55\"/><circle cx=\"32\" cy=\"39\" r=\"11\"/><path d=\"M26 30Q34 39 26 48\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 23H55\"/><circle cx=\"32\" cy=\"39\" r=\"11\"/><path d=\"M26 30Q34 39 26 48\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><rect x=\"9\" y=\"12\" width=\"46\" height=\"44\" rx=\"7\"/><rect x=\"18\" y=\"7\" width=\"4\" height=\"10\" rx=\"2\"/><rect x=\"42\" y=\"7\" width=\"4\" height=\"10\" rx=\"2\"/></g>",
  },
  "gear-simple": {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M18 54Q8 48 8 36V29Q8 23 13 23Q18 23 18 29V32L23 15Q25 8 31 9L43 12Q51 14 49 22L45 42Q43 56 30 57Q23 57 18 54Z\"/><path d=\"M24 39Q31 35 38 40\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M24 39Q31 35 38 40\"/></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M18 54Q8 48 8 36V29Q8 23 13 23Q18 23 18 29V32L23 15Q25 8 31 9L43 12Q51 14 49 22L45 42Q43 56 30 57Q23 57 18 54Z\"/></g>",
  },
  "armcare-simple": {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10 53V31Q10 21 20 21Q29 21 29 31V39H43V27H40Q37 27 37 24V15Q37 9 43 9H48Q54 9 54 15V41Q54 54 41 54H14Q10 54 10 53Z\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><g fill=\"black\"><g fill=\"none\" stroke=\"black\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></g></g></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M10 53V31Q10 21 20 21Q29 21 29 31V39H43V27H40Q37 27 37 24V15Q37 9 43 9H48Q54 9 54 15V41Q54 54 41 54H14Q10 54 10 53Z\"/></g>",
  },
};

/** 64 칸 선 굵기 — 원본(2.4)은 큰 그림용이라 메뉴 크기(20~28px)에서 가늘어 lucide(24 칸 2.5 ≈ 64 칸 6.7)와 맞춰 굵게 */
export const ROUND_ICON_STROKE = 5.2;

/**
 * 그림마다 선 굵기 배율 — 속이 자잘한 그림(레슨 공 실밥 · 눈 · 계기판 눈금 · 체크 목록 · 맥박 · 손가락 · 책 줄)은 5.2 면 20~26px 에서 뭉개져
 * 0.8 배(≈4.2)로 그린다(2026-10-22 실제 크기로 견줘 고름). 채움형은 마스크라 상관없다.
 */
const ROUND_ICON_WEIGHT: Partial<Record<RoundIconName, number>> = {
  lesson: 0.8,
  'lesson-simple': 0.8,
  gear: 0.8,
  'gear-simple': 0.8,
  'eye-off': 0.8,
  gauge: 0.8,
  log: 0.8,
  armcare: 0.8,
  'armcare-simple': 0.8,
  clapper: 0.8,
  book: 0.8,
  'photo-plus': 0.8,
  people: 0.8,
};

/** 그릴 SVG 속 — outline 이면 선 굵기를, filled 면 마스크 이름을 채운다 */
export function roundIconMarkup(name: RoundIconName, filled: boolean, id: string, stroke = ROUND_ICON_STROKE): string {
  const icon = ROUND_ICONS[name];
  if (filled) return icon.filled.split('{{ID}}').join(id);
  const w = Math.round(stroke * (ROUND_ICON_WEIGHT[name] ?? 1) * 100) / 100;
  return icon.outline.split('{{W}}').join(String(w));
}
