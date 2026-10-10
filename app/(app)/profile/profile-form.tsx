'use client';


import { useActionState, useEffect, useState, useSyncExternalStore } from 'react';
import { useFormStatus } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { MiniCalendar } from '@/components/mini-calendar';
import { updateProfile, type ProfileState } from '@/app/actions/profile';
import { guardFormAction } from '@/lib/action-offline';
import { Button, FormError } from '@/components/ui';
import { ListGroup, ListRow, ROW_INPUT, RowUnit, SelectRow } from '@/components/settings-list';
import { toast } from '@/components/toast';
import { kept } from '@/lib/form-values';
import {
  fromLength,
  fromWeight,
  readLengthUnit,
  readWeightUnit,
  round1,
  serverLengthUnit,
  serverWeightUnit,
  subscribeUnits,
  toLength,
  toWeight,
} from '@/lib/units';
import {
  MAX_AGE,
  MAX_HEIGHT_CM,
  MAX_WEIGHT_KG,
  MAX_WINGSPAN_CM,
  MIN_AGE,
  MIN_HEIGHT_CM,
  MIN_WEIGHT_KG,
  MIN_WINGSPAN_CM,
  SEX_OPTIONS,
} from '@/lib/profile';
import {
  BASELINE_FREQ_NAMES,
  BASELINE_INTENSITY_NAMES,
  BASELINE_VOLUME_NAMES,
  BASELINE_WORKOUT_FREQ_NAMES,
  THROWING_HANDS,
} from '@/lib/baseline';
import {
  DEFAULT_WORKOUT_MINUTES,
  nearestMinutesChoice,
  WORKOUT_MINUTES_CHOICES,
} from '@/lib/report/theme';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? '저장 중…' : '저장'}
    </Button>
  );
}

/**
 * 몸 치수 한 칸 — 고른 단위로 보여주고, 저장은 늘 기본 단위로 한다.
 *
 * 눈에 보이는 칸은 고른 단위(inch·lb)이고, 서버로는 숨겨 둔 칸이 언제나
 * cm·kg 을 보낸다. DB 에 단위가 섞이면 나중에 어느 줄이 인치인지 알 수 없게
 * 되고, 영상에서 잰 길이와 견줄 때도 매번 물어봐야 한다.
 *
 * 단위를 바꾸면 적어 둔 값도 같이 환산해 보여준다. 숫자를 그대로 두고 단위만
 * 바꾸면 180cm 가 180inch(4.6m)가 되어 버린다.
 *
 * 키·몸무게·윙스팬이 하는 일이 같아 한 부품으로 둔다. 다른 것은 어느 단위를
 * 따르는지와 범위뿐이다.
 */
function BodyField({
  name,
  label,
  base,
  kind,
  min,
  max,
  integer = false,
}: {
  /** 서버로 보낼 칸 이름 — 값은 언제나 cm 또는 kg */
  name: string;
  label: string;
  /** 저장된 값 (cm 또는 kg) */
  base: string;
  /** 어느 단위를 따르는가 */
  kind: 'length' | 'weight';
  /** 저장 단위 기준 범위 */
  min: number;
  max: number;
  /** 저장 값을 정수로(키 — 서버가 정수 cm 만 받는다. 인치로 적은 70 이 177.8cm 로 가 저장이 막혔다) */
  integer?: boolean;
}) {
  const lengthUnit = useSyncExternalStore(
    subscribeUnits,
    readLengthUnit,
    serverLengthUnit
  );
  const weightUnit = useSyncExternalStore(
    subscribeUnits,
    readWeightUnit,
    serverWeightUnit
  );
  const [stored, setStored] = useState(base);

  const isLength = kind === 'length';
  const unit = isLength ? lengthUnit : weightUnit;
  const to = (n: number) =>
    isLength ? toLength(n, lengthUnit) : toWeight(n, weightUnit);
  const from = (n: number) =>
    isLength ? fromLength(n, lengthUnit) : fromWeight(n, weightUnit);

  /*
   * 적는 중인 글자와 그 단위 — 저장 단위로 바꿨다 되돌려 보이면(0.1 로 반올림) lb · inch 로 적는 사이 글자가 바뀌어(1 →
   * 1.1) 적을 수 없었다. 적는 동안은 적은 그대로, 단위를 바꾸면 저장 값에서 다시 보인다.
   */
  const [draft, setDraft] = useState<{ text: string; unit: string } | null>(null);
  const shown =
    draft && draft.unit === unit
      ? draft.text
      : stored === ''
        ? ''
        : String(round1(to(Number(stored))));

  return (
    /* 아이폰 설정의 한 줄 — 이름 · 숫자 · 단위(components/settings-list.tsx) */
    <ListRow label={label}>
      <input
        type="number"
        inputMode="decimal"
        className={ROW_INPUT}
        value={shown}
        onChange={(e) => {
          const v = e.target.value;
          setDraft({ text: v, unit });
          const saved = from(Number(v));
          setStored(v === '' ? '' : String(integer ? Math.round(saved) : round1(saved)));
        }}
        min={round1(to(min))}
        max={round1(to(max))}
        /*
         * 칸 단위는 따지지 않는다(any). 0.5 로 두었더니 lb · inch 로 바꾼 값(72kg → 158.7lb)이 칸에 안 맞아 브라우저가
         * 폼 저장을 통째로 막았다 — 닉네임만 고쳐도.
         */
        step="any"
        /* 빈 칸은 '입력' — 예시 숫자(75)를 두면 적어 둔 값처럼 보였다 */
        placeholder="입력"
      />
      <RowUnit>{unit === 'in' ? 'inch' : unit}</RowUnit>
      {/* 서버로 가는 값은 언제나 cm · kg */}
      <input type="hidden" name={name} value={stored} />
    </ListRow>
  );
}

/**
 * 생년월일 — 가입 화면과 같은 작은 달력(components/mini-calendar.tsx)으로 고른다(2026-10-03).
 *
 * 예전에는 브라우저의 날짜 칸(type="date")이었다. 아이폰은 max 를 무시해 앞날도 골라졌고(저장할 때에야 막혔다),
 * 비어 있으면 납작한 빈 상자만 보였다. 이제 칸을 누르면 바로 밑에 달력이 펴진다 — 이 칸은 창(시트) 안이라
 * 가입처럼 화면 위에 띄우면 창 뒤에 깔린다. 고를 수 있는 날은 서버와 같다(만 5세 ~ 100세, lib/profile.ts).
 *
 * Field(<label>)로 감싸지 않는다. 라벨 안에 달력을 펴면 빈 곳(요일 줄)을 누를 때마다 라벨이 첫 단추(여닫기)를
 * 대신 눌러 달력이 닫혔다.
 */
function BirthDatePicker({
  value,
  onChange,
  today,
}: {
  value: string;
  onChange: (next: string) => void;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const year = Number(today.slice(0, 4));
  const monthDay = today.slice(4);
  const min = `${year - MAX_AGE}${monthDay}`;
  const max = `${year - MIN_AGE}${monthDay}`;
  const [y, m, d] = value ? value.split('-').map(Number) : [];

  /* 묶음 안의 한 줄 — 누르면 그 밑에 달력이 펴진다(창 안이라 화면 위에 띄우면 창 뒤에 깔린다) */
  return (
    <div>
      <input type="hidden" name="birthDate" value={value} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-3 px-4 text-left"
      >
        <span className="shrink-0 text-sm text-ink">생년월일</span>
        <span className={`ml-auto text-sm ${value ? 'text-muted' : 'text-muted/45'}`}>
          {value ? `${y}년 ${m}월 ${d}일` : '날짜 고르기'}
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted/60 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="motion-safe:animate-fade-in border-t border-line p-3">
          <MiniCalendar
            value={value}
            today={today}
            min={min}
            max={max}
            viewFrom={`${year - 15}-01-01`}
            pickYear
            marked={() => false}
            onPick={(key) => {
              onChange(key);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ProfileForm({
  nickname,
  birthDate,
  sex,
  heightCm,
  weightKg,
  wingspanCm,
  dailyWorkoutMinutes,
  baseline,
  /** 오늘 날짜(YYYY-MM-DD). 미래 날짜를 못 고르게 막는 데 쓴다. */
  today,
}: {
  nickname: string;
  birthDate: string;
  /** 'M' | 'F'. 이 칸이 생기기 전에 가입했으면 비어 있다 */
  sex: string | null;
  heightCm: number | null;
  weightKg: number | null;
  wingspanCm: number | null;
  dailyWorkoutMinutes: number | null;
  baseline: {
    baselineFreq: string | null;
    baselineVolume: string | null;
    baselineIntensity: string | null;
    baselineWorkoutFreq: string | null;
    throwingHand: string | null;
    competitionLevel: string | null;
  };
  today: string;
}) {
  const [state, formAction] = useActionState<ProfileState, FormData>(
    /* 신호가 끊겨도 오류 화면으로 넘어가지 않고 한 줄로 알린다(lib/action-offline.ts) */
    guardFormAction(updateProfile),
    undefined
  );
  /*
   * 저장되면 잠깐 뜨는 한 줄로 알린다(components/toast.tsx). 예전에는 폼 맨 위의 하늘색 상자였는데, 단추는 폼 맨 밑이라
   * 상자가 화면 밖에 생겨 저장된 줄 몰랐다.
   */
  useEffect(() => {
    if (state?.success) toast('저장했어요');
  }, [state]);

  /*
   * 오류로 되돌아왔을 때 고치던 내용을 그대로 다시 보여준다.
   * 저장 전 값으로 되돌아가면 방금 고친 것이 사라져버린다.
   */
  const before = state?.values;
  const pick = (name: string, fallback: string | number | null) =>
    before ? (kept(before, name) ?? '') : fallback == null ? '' : String(fallback);
  /* 소속 칸이 나이에 맞춰 바뀌도록 생년월일을 따라 쥔다(칸 자체는 그대로 폼이 보낸다) */
  const [birth, setBirth] = useState(() => pick('birthDate', birthDate));

  const minutes = `${nearestMinutesChoice(dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES)}분`;
  const names = (list: readonly string[]) => list.map((value) => ({ value }));

  /*
   * 아이폰 설정 목록처럼 — 묶음마다 '이름 · 값' 줄(2026-10-04 '앱 느낌' 4단계, components/settings-list.tsx). 예전에는 이름표
   * 밑에 상자 칸 · 칩 묶음이 하나씩 쌓인 긴 웹 폼이었다. 칸 이름 · 보내는 값은 그대로라 저장(updateProfile)은 바뀌지 않는다 —
   * 고르는 칸은 라디오 대신 아이폰 기본 고르개(select)로 같은 name · 값을 보낸다. 설명은 묶음 밑 꼬리글로 모았다.
   */
  return (
    <form action={formAction} className="space-y-6">
      <FormError>{state?.error}</FormError>

      <ListGroup
        title="기본 정보"
        footer="생년월일로 안전한 투구수 한도와 영양 기준을, 성별로 영양 목표를 정해요."
      >
        <ListRow label="닉네임">
          <input
            name="nickname"
            type="text"
            defaultValue={pick('nickname', nickname)}
            autoComplete="nickname"
            minLength={2}
            required
            className={ROW_INPUT}
          />
        </ListRow>
        <BirthDatePicker value={birth} onChange={setBirth} today={today} />
        {/*
          성별 — 가입할 때 고른 값. 이 칸이 생기기 전에 가입한 계정은 비어 있다. 꼭 고르게 하지는 않는다 —
          닉네임 하나 고치려다 막히면 안 된다. 안 고르면(빈 값) 서버가 지금 값을 그대로 둔다.
        */}
        <SelectRow
          label="성별"
          name="sex"
          options={SEX_OPTIONS.map((o) => ({ value: o.value, label: o.name }))}
          defaultValue={pick('sex', sex)}
        />
      </ListGroup>

      <ListGroup
        title="몸"
        footer="키는 영상에서 잰 보폭을 견줄 때 써요. 윙스팬은 양팔을 벌린 길이예요."
      >
        <BodyField
          name="heightCm"
          label="키"
          base={pick('heightCm', heightCm)}
          kind="length"
          integer
          min={MIN_HEIGHT_CM}
          max={MAX_HEIGHT_CM}
        />
        <BodyField
          name="weightKg"
          label="몸무게"
          base={pick('weightKg', weightKg)}
          kind="weight"
          min={MIN_WEIGHT_KG}
          max={MAX_WEIGHT_KG}
        />
        <BodyField
          name="wingspanCm"
          label="윙스팬"
          base={pick('wingspanCm', wingspanCm)}
          kind="length"
          min={MIN_WINGSPAN_CM}
          max={MAX_WINGSPAN_CM}
        />
      </ListGroup>

      <ListGroup
        title="운동"
        footer="하루 운동 시간에 맞춰 운동 개수를 정해요. 웨이트 경력 · 장비는 설정 › 트레이닝에서 골라요."
      >
        <SelectRow
          label="하루 운동 시간"
          name="dailyWorkoutMinutes"
          options={names(WORKOUT_MINUTES_CHOICES.map((m) => `${m}분`))}
          /* 예전에 고를 수 있던 15·20·30분이 저장돼 있으면 짝이 없다 — 가장 가까운 값을 짚는다 */
          defaultValue={pick('dailyWorkoutMinutes', minutes)}
        />
        <SelectRow
          label="던지는 손"
          name="throwingHand"
          options={names(THROWING_HANDS)}
          defaultValue={pick('throwingHand', baseline.throwingHand)}
        />
      </ListGroup>

      {/* 평소 투구량 · 웨이트 문진 — 부하 지수의 추정 기준선. 투구 셋은 모두 답해야 저장된다(서버 validateBaseline) */}
      <ListGroup
        title="평소 투구 · 웨이트"
        footer="이 답으로 투구 · 운동 부하 지수를 기록 첫날부터 계산해요. 상황이 바뀌면 언제든 고칠 수 있어요."
      >
        <SelectRow
          label="던지는 횟수"
          name="baselineFreq"
          options={names(BASELINE_FREQ_NAMES)}
          defaultValue={pick('baselineFreq', baseline.baselineFreq)}
        />
        <SelectRow
          label="한 번에 던지는 양"
          name="baselineVolume"
          options={names(BASELINE_VOLUME_NAMES)}
          defaultValue={pick('baselineVolume', baseline.baselineVolume)}
        />
        <SelectRow
          label="평소 강도"
          name="baselineIntensity"
          options={names(BASELINE_INTENSITY_NAMES)}
          defaultValue={pick('baselineIntensity', baseline.baselineIntensity)}
        />
        <SelectRow
          label="웨이트 횟수"
          name="baselineWorkoutFreq"
          options={names(BASELINE_WORKOUT_FREQ_NAMES)}
          defaultValue={pick('baselineWorkoutFreq', baseline.baselineWorkoutFreq)}
        />
      </ListGroup>

      <SubmitButton />
    </form>
  );
}
