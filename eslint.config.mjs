import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    /* 아이폰 앱(Expo)은 제 린트를 쓴다 — cd native && npx expo lint */
    'native/**',
    'packages/pitch-reading/**',
  ]),
  /*
   * 아이콘은 components/icon.tsx 에서만 받는다(2026-10-14, docs/designs/icon-system.md) — 굵기 · 크기 규칙이 한 곳에 있어야
   * "아이폰 느낌으로" 가 한 번에 바뀐다. lucide 를 직접 불러도 되는 곳은 그 파일과 아이콘을 만드는 쪽(baseball-icon · app-icon)뿐.
   */
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    ignores: [
      'components/icon.tsx',
      'components/baseball-icon.tsx',
      'components/app-icon.tsx',
      /* 구속 측정은 메인 세션(김민)이 작업 중이라 아직 안 옮겼다(2026-10-14 HANDOFF) — 옮기면 이 셋을 지운다 */
      'components/velocity/**',
      'app/(session)/velocity/**',
      'app/(app)/admin/velocity/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react',
              message: "아이콘은 '@/components/icon' 에서 받아요(굵기 규칙이 거기 하나). 없는 아이콘은 그 파일에 한 줄 더해요.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
