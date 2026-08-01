import { redirect } from 'next/navigation';

/** 라이브러리에 그냥 들어오면 트레이닝 탭을 연다. */
export default function LibraryPage() {
  redirect('/library/training');
}
