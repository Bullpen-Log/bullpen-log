'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateOrg, type OrgActionState } from '@/app/actions/org';
import { Button, Field, FormError, Input } from '@/components/ui';
import { guardFormAction } from '@/lib/action-offline';
import {
  ORG_KIND_LABEL,
  ORG_NAME_MAX,
  ORG_NOTE_MAX,
  ORG_REGION_MAX,
  type OrgKind,
} from '@/lib/org/rules';

/** 조직 이름 · 지역 · 소개 — 만든 마스터와 관리자만 고친다(서버가 막는다). 스태프에게는 읽기만 */
export function OrgInfoForm({
  org,
  canEdit,
}: {
  org: {
    id: string;
    kind: OrgKind;
    name: string;
    region: string | null;
    note: string | null;
  };
  canEdit: boolean;
}) {
  const [state, action] = useActionState<OrgActionState, FormData>(
    guardFormAction(updateOrg),
    undefined
  );
  const noteLabel = org.kind === 'TEAM' ? '연령대 · 리그' : '코치 수 · 소개';
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orgId" value={org.id} />
      <Field label={`${ORG_KIND_LABEL[org.kind]} 이름`}>
        <Input
          name="name"
          type="text"
          defaultValue={org.name}
          maxLength={ORG_NAME_MAX}
          required
          readOnly={!canEdit}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="지역" hint="선택">
          <Input
            name="region"
            type="text"
            defaultValue={org.region ?? ''}
            maxLength={ORG_REGION_MAX}
            readOnly={!canEdit}
            placeholder="서울 강남"
          />
        </Field>
        <Field label={noteLabel} hint="선택">
          <Input
            name="note"
            type="text"
            defaultValue={org.note ?? ''}
            maxLength={ORG_NOTE_MAX}
            readOnly={!canEdit}
          />
        </Field>
      </div>
      {state?.error && <FormError>{state.error}</FormError>}
      {state?.success && (
        <p role="status" className="text-xs font-medium text-sky-strong">
          {state.success}
        </p>
      )}
      {canEdit ? (
        <Submit />
      ) : (
        <p className="text-xs text-muted">
          조직 정보는 만든 사람(마스터)만 고칠 수 있어요.
        </p>
      )}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? '저장하는 중…' : '저장'}
    </Button>
  );
}
