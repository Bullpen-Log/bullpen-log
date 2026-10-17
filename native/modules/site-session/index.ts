import { requireNativeModule } from 'expo';

/** 웹뷰의 사이트 쿠키(로그인)를 앱의 요청 저장소로 옮긴다 — ios/SiteSessionModule.swift */
export const SiteSession = requireNativeModule<{ sync(host: string): Promise<number> }>('SiteSession');
