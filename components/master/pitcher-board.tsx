import Link from 'next/link';
import { Badge, Card } from '@/components/ui';
import { ARM_LEVEL_LABEL } from '@/lib/report/arm-status';
import { ARM_WORD } from '@/lib/org/rules';
import type { BoardRow } from '@/lib/org/player-data';
import { ARM_MISSING_TEXT, armUnknown } from '@/lib/org/arm-view';

const DOT = { danger: 'bg-danger', caution: 'bg-warn', safe: 'bg-ok' } as const;
const WORD = { danger: 'text-danger', caution: 'text-warn', safe: 'text-ok' } as const;

/**
 * 투수 부하판(팀 홈) — 선수마다 지금 팔 상태(lib/report/arm-status.ts 그대로)와 까닭 한 줄. 위험부터.
 * 투구 공유를 안 켠 선수는 수만 적는다 — 기록을 안 보여 주기로 한 선수의 상태를 코치가 보면 안 된다.
 */
export function PitcherBoard({
  rows,
  hidden,
  memberWord,
}: {
  rows: BoardRow[];
  hidden: number;
  memberWord: string;
}) {
  return (
    <Card className="divide-y divide-line p-0">
      {rows.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-muted">
          투구 기록을 공유한 {memberWord}이 아직 없어요.
        </p>
      )}
      {rows.map((r) => {
        const unknown = armUnknown(r.status);
        return (
        <Link
          key={r.memberId}
          href={`/manage/players/${r.memberId}`}
          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink/4"
        >
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${unknown ? 'bg-line' : DOT[r.status.level]}`}
          />
          <span className="w-24 shrink-0 truncate text-sm font-semibold text-ink">
            {r.nickname}
          </span>
          <span className={`w-20 shrink-0 text-xs font-bold ${unknown ? 'text-muted' : WORD[r.status.level]}`}>
            {unknown ? '정보 부족' : ARM_WORD[r.status.level]}
            {!unknown && <span className="sr-only"> ({ARM_LEVEL_LABEL[r.status.level]})</span>}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            {unknown ? ARM_MISSING_TEXT[r.status.missing[0]] : r.status.headline}
          </span>
          <span className="hidden shrink-0 text-xs text-muted sm:block">
            {r.lastOuting
              ? `${shortKey(r.lastOuting.key)} ${r.lastOuting.pitches}구`
              : '기록 없음'}
          </span>
          {r.tags[0] && <Badge className="hidden sm:inline-flex">{r.tags[0]}</Badge>}
        </Link>
        );
      })}
      {hidden > 0 && (
        <p className="px-4 py-2.5 text-xs text-muted">
          투구 기록을 공유하지 않은 {memberWord} {hidden}명은 안 보여요.
        </p>
      )}
    </Card>
  );
}

function shortKey(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
}
