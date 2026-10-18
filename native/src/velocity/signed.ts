/** 차이 글 — '+1.2' · '-0.8'(웹 app/(app)/admin/velocity/format.ts signed 와 같다) */
export const signed = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
