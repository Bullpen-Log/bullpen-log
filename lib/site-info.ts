/**
 * 사이트 정보 글 — 문의 메일 · 의료 안내 · 3D 모델 출처. 웹(components/site-footer.tsx · settings-info.tsx)과 앱 설정(native/src/app/settings.tsx)이 같이 쓴다.
 */
/** 문의 메일 — 이용약관 · 개인정보 처리방침의 '문의'와 같은 주소 */
export const CONTACT = 'bullpenlog.com@gmail.com';

/** 의료 안내 — 꼬리말과 설정 '정보'(휴대폰은 꼬리말이 없다)가 같이 쓴다 */
export const MEDICAL_NOTICE =
  '투구 계획과 운동 제안은 남긴 기록을 바탕으로 계산한 참고 자료이며, 의학적 진단이나 처방이 아닙니다. 통증이 있으면 수치와 관계없이 던지지 말고 전문의와 상담하세요.';

/*
 * 3D 근육 지도 모델 출처 — public/models/ATTRIBUTION.txt 와 같은 내용. 따옴표 안 문구는 원저작자가 정한 그대로 둔다(번역하지 않는다).
 */
export const MODEL_CREDITS: readonly { quote: string; note: string }[] = [
  {
    quote: 'Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0',
    note: 'github.com/Z-Anatomy/Models-of-human-anatomy',
  },
  {
    quote: 'BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan',
    note: 'creativecommons.org/licenses/by-sa/2.1/jp',
  },
  {
    quote:
      'BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution 4.0 International',
    note: 'dbarchive.biosciencedbc.jp/en/bodyparts3d',
  },
  {
    quote: 'Fit Mit With anatomy atlas (CC BY-SA 4.0)',
    note: 'github.com/slfresh/fitmitwith-anatomy-atlas',
  },
];

export const MODEL_CREDIT_INTRO =
  '암케어 · 부위별 보강의 3D 근육 지도는 아래 자료를 고쳐 만들었어요. 이 모델 파일은 크리에이티브 커먼즈 저작자표시-동일조건변경허락 4.0(CC BY-SA 4.0)으로 쓰고, 불펜로그의 나머지는 따로예요.';

/** 바꾼 것 */
export const MODEL_CREDIT_CHANGES =
  '팔 관리 지도는 상체 근육 · 뼈 · 머리와 손만 남기고 다리와 결합 조직을 뺐어요. 전신 지도는 결합 조직만 뺐어요. 둘 다 파일을 가볍게 줄였고 근육 이름은 그대로예요. 해부학 전문가의 검토는 받지 않았어요.';

export const CC_BY_SA_URL = 'https://creativecommons.org/licenses/by-sa/4.0/deed.ko';
