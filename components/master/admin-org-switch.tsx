import { ClipboardList, Users } from '@/components/icon';
import { SafeForm } from '@/components/safe-form';
import { Button } from '@/components/ui';
import { adminEnterOrg } from '@/app/actions/org';

/**
 * 대표관리자의 화면 전환 — 팀 화면 · 레슨장 화면으로 바로 넘어간다(app/actions/org.ts adminEnterOrg).
 * 관리자의 '내 팀' · '내 레슨장'이 없으면 처음 누를 때 하나 만든다. 돌아올 때는 마스터 화면 위 막대의 '선수 화면으로'.
 */
export function AdminOrgSwitch({ compact = false }: { compact?: boolean }) {
  return (
    <section
      className={
        compact
          ? 'flex flex-wrap gap-2'
          : 'space-y-3 rounded-2xl border border-line bg-surface p-(--block-pad)'
      }
    >
      {!compact && (
        <div>
          <h2 className="text-sm font-bold text-ink">팀 · 레슨장 화면으로 전환</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            팀 · 레슨장 계정이 보는 관리 화면으로 넘어가요. 처음 누르면 관리자 것이 하나
            만들어지고, 돌아올 때는 위 막대의 ‘선수 화면으로’를 눌러요. 다른 사람의 팀 ·
            레슨장은 ‘모든 조직’에서 골라요.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <SafeForm action={adminEnterOrg}>
          <input type="hidden" name="kind" value="TEAM" />
          <Button type="submit" variant={compact ? 'secondary' : 'primary'}>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" /> 팀 화면으로
            </span>
          </Button>
        </SafeForm>
        <SafeForm action={adminEnterOrg}>
          <input type="hidden" name="kind" value="LESSON" />
          <Button type="submit" variant="secondary">
            <span className="inline-flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4" /> 레슨장 화면으로
            </span>
          </Button>
        </SafeForm>
        {!compact && (
          <a
            href="/manage/orgs"
            className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-sky"
          >
            모든 조직 보기
          </a>
        )}
      </div>
    </section>
  );
}
