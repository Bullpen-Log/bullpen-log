/*
 * 리액트의 <ViewTransition> 타입을 켠다.
 *
 * 이 컴포넌트는 @types/react 안에 있지만 'react/canary' 라는 별도 문 뒤에
 * 들어 있어서, 그냥 두면 타입 검사가 "그런 것 없다"고 한다. 실제 알맹이는
 * Next 가 들고 다니는 리액트 빌드에 들어 있다(next/dist/compiled/react).
 *
 * tsconfig 의 compilerOptions.types 배열로 켜지 않는 이유는, 그 배열을 한 번
 * 쓰면 자동으로 딸려오던 나머지 전역 타입(node 등)이 전부 끊기기 때문이다.
 * 파일 하나로 켜면 그런 일이 없다.
 */
/// <reference types="react/canary" />
