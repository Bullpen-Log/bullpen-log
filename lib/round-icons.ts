/**
 * 둥근 야구 아이콘 13종(2026-10-21 금윤호 — rounded-baseball-icons-2) — 테두리형(outline) · 채움형(filled) 한 쌍씩.
 * 웹(components/round-icon.tsx)과 앱(native/src/shell/round-icon.tsx)이 같은 그림을 쓰려고 순수 문자열로 둔다(viewBox 0 0 64 64).
 * outline: {{W}} 는 선 굵기(64 칸 기준) · 색은 currentColor. filled: 구멍은 마스크로 — {{ID}} 를 그림마다 다른 이름으로 바꿔 쓴다.
 */
export type RoundIconName = 'home' | 'baseball' | 'bat' | 'community' | 'menu' | 'bell' | 'settings' | 'training' | 'cutlery' | 'radar' | 'zone' | 'pitcher' | 'support';

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
  pitcher: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"34\" cy=\"11\" r=\"5.5\"/><path d=\"M29 19Q33 16 38 21L42 29L49 26Q53 25 54 29Q55 32 51 34L42 37Q39 38 36 35L34 32L31 38L42 42Q46 44 44 49L41 56Q39 60 35 58Q32 57 34 53L36 48L27 45L24 55Q23 59 19 58Q15 57 17 53L22 37L25 28L18 24L13 17Q11 13 15 11Q18 10 20 14L23 18Z\"/><circle cx=\"11\" cy=\"9\" r=\"3\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><circle cx=\"34\" cy=\"11\" r=\"5.5\"/><path d=\"M29 19Q33 16 38 21L42 29L49 26Q53 25 54 29Q55 32 51 34L42 37Q39 38 36 35L34 32L31 38L42 42Q46 44 44 49L41 56Q39 60 35 58Q32 57 34 53L36 48L27 45L24 55Q23 59 19 58Q15 57 17 53L22 37L25 28L18 24L13 17Q11 13 15 11Q18 10 20 14L23 18Z\"/><circle cx=\"11\" cy=\"9\" r=\"3\"/></g>",
  },
  support: {
    outline: "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"{{W}}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 29V28Q12 9 32 9Q52 9 52 28V29\"/><rect x=\"7\" y=\"29\" width=\"12\" height=\"20\" rx=\"5\"/><rect x=\"45\" y=\"29\" width=\"12\" height=\"20\" rx=\"5\"/><path d=\"M52 49Q52 55 42 55\"/><rect x=\"29\" y=\"51\" width=\"13\" height=\"8\" rx=\"4\"/></g>",
    filled: "<defs><mask id=\"{{ID}}\"><rect width=\"64\" height=\"64\" fill=\"white\"/></mask></defs><g fill=\"currentColor\" mask=\"url(#{{ID}})\"><path d=\"M9 32V29Q9 6 32 6Q55 6 55 29V35H49V29Q49 13 32 13Q15 13 15 29V35H9Z\"/><rect x=\"7\" y=\"29\" width=\"12\" height=\"20\" rx=\"5\"/><rect x=\"45\" y=\"29\" width=\"12\" height=\"20\" rx=\"5\"/><path d=\"M49 46H55Q55 57 42 57H35V51H42Q49 51 49 46Z\"/><rect x=\"28\" y=\"49\" width=\"14\" height=\"10\" rx=\"5\"/></g>",
  },
};

/** 64 칸 선 굵기 — 원본(2.4)은 큰 그림용이라 메뉴 크기(20~28px)에서 가늘어 lucide(24 칸 2.5 ≈ 64 칸 6.7)와 맞춰 굵게 */
export const ROUND_ICON_STROKE = 5.2;

/** 그릴 SVG 속 — outline 이면 선 굵기를, filled 면 마스크 이름을 채운다 */
export function roundIconMarkup(name: RoundIconName, filled: boolean, id: string, stroke = ROUND_ICON_STROKE): string {
  const icon = ROUND_ICONS[name];
  return filled ? icon.filled.split('{{ID}}').join(id) : icon.outline.split('{{W}}').join(String(stroke));
}
