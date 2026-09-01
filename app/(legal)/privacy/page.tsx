import type { Metadata } from 'next';
import Link from 'next/link';
import { Article, Blank, DataTable, Item, Items, LegalHeading } from '../_parts';

export const metadata: Metadata = {
  title: '개인정보 처리방침 — Bullpen Log',
  description: 'Bullpen Log가 어떤 정보를 받아 어떻게 쓰는지 적어 둔 문서입니다.',
};

/**
 * 개인정보 처리방침.
 *
 * 받는 정보를 보면 그냥 넘어갈 수준이 아니다 — 생년월일, 키, 통증 부위, 투구
 * 기록, 영상. 통증 기록은 건강에 관한 정보라 민감한 축에 든다.
 *
 * 실제로 코드가 무엇을 받고 어디로 보내는지 확인해서 적었다. 실제와 다른
 * 방침은 없느니만 못하다. 항목이 늘거나 줄면 이 문서도 함께 고쳐야 한다.
 */
export default function PrivacyPage() {
  return (
    <article>
      <LegalHeading
        title="개인정보 처리방침"
        updatedAt="2026년 0월 0일"
        summary={
          <>
            Bullpen Log는 <strong>안전한 투구량을 계산하는 데 필요한 만큼만</strong>{' '}
            정보를 받습니다. 회원의 투구 기록과 영상은 <strong>본인만</strong> 볼 수
            있고, 다른 회원이나 제3자에게 팔거나 넘기지 않습니다.
          </>
        }
      />

      <Article no={1} title="어떤 정보를 받나요">
        <p>서비스를 쓰시는 데 실제로 쓰이는 것만 받습니다.</p>
        <DataTable
          head={['언제', '받는 것', '왜 필요한가']}
          rows={[
            [
              '가입할 때 (필수)',
              '이메일, 비밀번호, 닉네임, 생년월일',
              '로그인과 본인 구분. 생년월일은 나이에 따라 안전한 투구수 한도가 달라져 투구량 조언에 꼭 필요합니다.',
            ],
            [
              '가입할 때 (선택)',
              '키, 목표 구속, 던지는 손, 소속(학교·사회인 등), 평소 투구량·웨이트 빈도',
              '영상에서 잰 길이를 몸 크기로 나눠 비교하고, 기록 첫날부터 부하 지수를 낼 기준을 만듭니다. 안 적으셔도 서비스는 돌아갑니다.',
            ],
            [
              '쓰시는 동안',
              '투구 기록(날짜·투구수·강도·구속·메모), 컨디션 체크인(어깨·팔꿈치·손목·허리·하체 상태, 수면, 컨디션 점수), 운동 기록(세트·횟수·무게), 투구 영상',
              '부하 지수 계산, 운동 제안, 리포트 생성. 이것이 서비스의 본체입니다.',
            ],
            [
              '자동으로',
              '접속 기록, 오류 기록',
              '장애를 찾아 고치기 위해서입니다. 별도로 분석 도구를 붙여 행동을 추적하지 않습니다.',
            ],
          ]}
        />
        <p className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-warn">
          <strong>건강에 관한 정보</strong> — 컨디션 체크인의 통증·뻐근 기록은 건강에
          관한 정보에 해당합니다. 회원이 직접 적으신 것만 저장하고, 오늘 운동을 고르고
          부하를 계산하는 데에만 씁니다. 가입할 때 따로 동의를 받습니다.
        </p>
      </Article>

      <Article no={2} title="무엇에 쓰나요">
        <Items>
          <Item>계정을 만들고 로그인 상태를 유지하는 데</Item>
          <Item>
            투구 부하 지수와 운동 부하 지수를 계산하고, 안전한 투구수·휴식일을 제안하는
            데
          </Item>
          <Item>오늘 할 운동을 고르고, 리포트를 만드는 데</Item>
          <Item>영상을 저장하고 본인에게만 보여주는 데</Item>
          <Item>문의에 답하고 장애를 고치는 데</Item>
        </Items>
        <p>
          위에 적은 것 말고 다른 목적으로 쓰지 않습니다. 목적이 바뀌면 미리 알리고 다시
          동의를 받습니다.
        </p>
      </Article>

      <Article no={3} title="얼마나 보관하나요">
        <Items>
          <Item>
            <strong>탈퇴하면 바로 지웁니다.</strong> 투구 기록, 영상, 체크인, 운동 기록,
            남긴 글이 함께 삭제되며 복구할 수 없습니다.
          </Item>
          <Item>
            법으로 보관해야 하는 것이 생기면(예: 유료 결제 기록) 그 법이 정한 기간만
            따로 보관하고, 그 사실을 미리 알립니다. 지금은 무료 서비스라 해당 사항이
            없습니다.
          </Item>
        </Items>
      </Article>

      <Article no={4} title="다른 곳에 넘기나요">
        <p>
          <strong>팔지 않고, 넘기지 않습니다.</strong> 다만 서비스를 돌리는 데 필요한
          일을 아래 회사에 맡기고 있습니다.
        </p>
        <DataTable
          head={['맡기는 곳', '맡기는 일', '어디에 두나']}
          rows={[
            ['Vercel Inc.', '서비스 실행과 배포', '해외'],
            ['Supabase Inc.', '데이터베이스와 영상 저장', '해외'],
            [
              'Anthropic PBC',
              <>
                리포트 문장 생성. <strong>기록에서 계산한 수치와 계획만</strong> 보내고,
                이메일·닉네임 같은 신원 정보는 보내지 않습니다.
              </>,
              '해외',
            ],
          ]}
        />
        <p>
          맡기는 곳이 바뀌면 이 문서를 고치고 알립니다. 그 밖에는 법에 따른 요청이 있는
          경우가 아니면 어디에도 제공하지 않습니다.
        </p>
      </Article>

      <Article no={5} title="회원이 하실 수 있는 것">
        <Items>
          <Item>
            <strong>보기·고치기</strong> — 내 정보와 투구 일지, 트레이닝에서 언제든
            확인하고 고칠 수 있습니다.
          </Item>
          <Item>
            <strong>지우기</strong> — 기록은 하나씩 지울 수 있고, 전부 지우려면{' '}
            <strong>내 정보 → 회원 탈퇴</strong>를 쓰시면 됩니다.
          </Item>
          <Item>
            <strong>동의 철회</strong> — 탈퇴가 곧 동의 철회입니다. 탈퇴하면 저장된 것이
            모두 삭제됩니다.
          </Item>
          <Item>
            그 밖의 요청은{' '}
            <a
              href="mailto:bullpenlog.com@gmail.com"
              className="font-medium text-sky underline underline-offset-2"
            >
              bullpenlog.com@gmail.com
            </a>
            로 보내주시면 처리하고 알려드립니다.
          </Item>
        </Items>
      </Article>

      <Article no={6} title="안전하게 지키기 위해 하는 일">
        <Items>
          <Item>비밀번호는 되돌릴 수 없는 방식(bcrypt)으로 바꿔 저장합니다.</Item>
          <Item>
            영상은 아무나 열 수 없는 곳에 두고, 볼 때마다 짧게 유효한 주소를 새로
            발급합니다.
          </Item>
          <Item>
            로그인은 서버가 서명한 표(토큰)로 확인하며, 브라우저 스크립트가 읽을 수 없는
            쿠키에 담습니다.
          </Item>
          <Item>
            기록을 읽고 고치는 모든 자리에서 &lsquo;본인 것인가&rsquo;를 먼저
            확인합니다.
          </Item>
        </Items>
      </Article>

      <Article no={7} title="만 14세 미만">
        <p>
          만 14세 미만은 법정대리인의 동의 없이 가입할 수 없습니다. 동의 없이 가입한
          것이 확인되면 지체 없이 삭제합니다.
        </p>
      </Article>

      <Article no={8} title="문의">
        <Items>
          <Item>
            개인정보 보호책임자: <Blank>[이름]</Blank>
          </Item>
          <Item>
            연락처:{' '}
            <a
              href="mailto:bullpenlog.com@gmail.com"
              className="font-medium text-sky underline underline-offset-2"
            >
              bullpenlog.com@gmail.com
            </a>
          </Item>
          <Item>
            개인정보 침해로 신고·상담이 필요하시면 개인정보침해신고센터(118), 대검찰청
            사이버수사과(1301), 경찰청 사이버수사국(182)에 문의하실 수 있습니다.
          </Item>
        </Items>
      </Article>

      <Article no={9} title="이 방침이 바뀔 때">
        <p>
          내용이 바뀌면 시행일 7일 전부터 서비스 화면에 알립니다. 회원에게 불리하게
          바뀌는 경우에는 30일 전에 알리고 다시 동의를 받습니다.
        </p>
      </Article>

      <footer className="mt-12 border-t border-line pt-6 text-sm leading-relaxed text-muted">
        <p>
          서비스 이용에 관한 약속은{' '}
          <Link href="/terms" className="font-medium text-sky underline">
            이용약관
          </Link>
          에 적어 두었습니다.
        </p>
      </footer>
    </article>
  );
}
