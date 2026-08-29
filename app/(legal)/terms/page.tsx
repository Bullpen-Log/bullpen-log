import type { Metadata } from 'next';
import Link from 'next/link';
import { Article, Blank, Item, Items, LegalHeading } from '../_parts';

export const metadata: Metadata = {
  title: '이용약관 — Bullpen Log',
  description: 'Bullpen Log 서비스 이용약관입니다.',
};

/**
 * 이용약관.
 *
 * 변호사가 쓴 것이 아니라 초안이다. 사람을 받기 전에 한 번은 검토를 받는 것이
 * 좋다. 다만 아무것도 없이 가입을 받는 것보다는 낫다 — 지금은 동의 절차 자체가
 * 없었다.
 *
 * 노란 표시(Blank)는 운영자만 아는 것이라 비워 둔 자리다. 배포 전에 채워야 한다.
 */
export default function TermsPage() {
  return (
    <article>
      <LegalHeading
        title="이용약관"
        updatedAt="2026년 0월 0일"
        summary={
          <>
            Bullpen Log는 투수의 투구량과 훈련을 기록하고, 그 기록을 바탕으로 참고할
            만한 조언을 보여주는 서비스입니다. <strong>의료 서비스가 아닙니다.</strong>{' '}
            이 약관은 서비스를 쓰실 때의 약속을 정리한 것입니다.
          </>
        }
      />

      <Article no={1} title="목적">
        <p>
          이 약관은 <Blank>[운영자/사업자명]</Blank>(이하 &lsquo;회사&rsquo;)가 제공하는
          Bullpen Log 서비스(이하 &lsquo;서비스&rsquo;)를 이용하는 데 필요한 회사와
          회원 사이의 권리·의무와 책임을 정하는 것을 목적으로 합니다.
        </p>
      </Article>

      <Article no={2} title="용어">
        <Items>
          <Item>
            &lsquo;회원&rsquo;이란 이 약관에 동의하고 계정을 만들어 서비스를 이용하는
            분을 말합니다.
          </Item>
          <Item>
            &lsquo;기록&rsquo;이란 회원이 서비스에 남긴 투구 기록, 컨디션 체크인, 운동
            기록, 영상, 메모를 말합니다.
          </Item>
          <Item>
            &lsquo;조언&rsquo;이란 회원의 기록을 바탕으로 서비스가 계산해 보여주는 부하
            지수, 투구 계획, 운동 제안, 리포트를 말합니다.
          </Item>
        </Items>
      </Article>

      <Article no={3} title="약관의 효력과 변경">
        <Items>
          <Item>
            이 약관은 서비스 화면에 게시하여 효력이 생깁니다.
          </Item>
          <Item>
            회사는 필요한 경우 약관을 변경할 수 있으며, 변경할 때에는 시행일 7일
            전(회원에게 불리한 변경은 30일 전)부터 서비스 화면에 알립니다.
          </Item>
          <Item>
            알린 뒤에도 계속 서비스를 이용하시면 변경된 약관에 동의한 것으로 봅니다.
            동의하지 않으시면 언제든 탈퇴하실 수 있습니다.
          </Item>
        </Items>
      </Article>

      <Article no={4} title="가입과 계정">
        <Items>
          <Item>
            가입은 이메일과 비밀번호, 그리고 안전한 투구량을 계산하는 데 필요한 정보를
            입력하고 이 약관과 개인정보 처리방침에 동의하면 완료됩니다.
          </Item>
          <Item>
            만 14세 미만은 법정대리인의 동의 없이 가입할 수 없습니다.
          </Item>
          <Item>
            계정은 본인만 사용해야 하며, 비밀번호 관리 책임은 회원에게 있습니다.
            계정이 도용된 것으로 보이면 즉시 <Blank>[문의 이메일]</Blank>로 알려주세요.
          </Item>
        </Items>
      </Article>

      <Article no={5} title="서비스의 내용">
        <Items>
          <Item>
            회사는 투구·훈련 기록 저장, 부하 지수 계산, 운동 제안, 리포트 생성, 영상
            보관과 재생 기능을 제공합니다.
          </Item>
          <Item>
            서비스의 내용은 개선을 위해 바뀔 수 있습니다. 중요한 기능이 없어질 때에는
            미리 알립니다.
          </Item>
          <Item>
            점검·장애·천재지변 등으로 서비스가 일시적으로 멈출 수 있습니다. 예정된
            점검은 미리 알립니다.
          </Item>
        </Items>
      </Article>

      <Article no={6} title="조언의 성격 — 중요">
        <div className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3.5 text-sm leading-relaxed text-warn">
          <p className="font-bold">서비스의 조언은 의학적 진단이나 처방이 아닙니다.</p>
          <p className="mt-1.5">
            부하 지수와 투구 계획, 운동 제안은 회원이 남긴 기록에 공개된 연구를 바탕으로
            한 규칙을 적용해 계산한 <strong>참고 자료</strong>입니다. 사람마다 몸 상태가
            다르고, 서비스는 회원을 직접 진찰하지 않습니다.
          </p>
          <p className="mt-1.5">
            <strong>통증이 있으면 수치와 관계없이 던지지 마시고 전문의와 상담하세요.</strong>
          </p>
        </div>
        <Items>
          <Item>
            서비스는 무엇을 강제하지 않습니다. 최종 판단은 회원과 지도자, 의료진의
            몫입니다.
          </Item>
          <Item>
            회원이 조언을 따르거나 따르지 않아 생긴 부상이나 손해에 대해 회사는 책임을
            지지 않습니다. 다만 회사의 고의나 중대한 과실이 있는 경우에는 그러하지
            않습니다.
          </Item>
        </Items>
      </Article>

      <Article no={7} title="회원의 기록과 저작권">
        <Items>
          <Item>
            회원이 남긴 기록과 영상의 저작권은 회원에게 있습니다.
          </Item>
          <Item>
            회사는 서비스를 제공하는 데 필요한 범위(저장, 표시, 부하 계산, 리포트 생성)
            안에서만 회원의 기록을 이용합니다.
          </Item>
          <Item>
            회사는 회원의 기록을 다른 회원에게 공개하지 않습니다. 회원의 기록과 영상은
            본인만 볼 수 있습니다.
          </Item>
          <Item>
            서비스가 제공하는 운동 영상, 드릴, 설명 등의 저작권은 회사 또는 정당한
            권리자에게 있으며, 회원은 이를 서비스 밖에서 복제·배포할 수 없습니다.
          </Item>
        </Items>
      </Article>

      <Article no={8} title="회원이 하시면 안 되는 일">
        <Items>
          <Item>남의 계정을 쓰거나 남의 정보를 함부로 올리는 것</Item>
          <Item>
            서비스를 자동으로 긁어가거나, 정상적인 이용을 방해할 정도로 부하를 주는 것
          </Item>
          <Item>서비스의 영상과 자료를 밖으로 복제·배포·판매하는 것</Item>
          <Item>다른 사람의 권리를 침해하거나 법을 어기는 내용을 올리는 것</Item>
        </Items>
        <p>
          위반이 확인되면 회사는 사전 통지 후 이용을 제한할 수 있습니다. 다만 긴급한
          경우에는 먼저 제한하고 알릴 수 있습니다.
        </p>
      </Article>

      <Article no={9} title="유료 서비스">
        <Items>
          <Item>
            일부 기능은 앞으로 유료로 제공될 수 있습니다. 그때에는 요금과 결제 방법,
            환불 기준을 미리 서비스 화면에 알리고 따로 동의를 받습니다.
          </Item>
          <Item>
            결제와 환불에 관한 사항은 「콘텐츠산업 진흥법」, 「전자상거래 등에서의
            소비자보호에 관한 법률」 등 관련 법을 따릅니다.
          </Item>
          <Item>
            지금 시점에 서비스는 <strong>무료로 제공</strong>되며, 유료 전환 전에 별도로
            안내합니다.
          </Item>
        </Items>
      </Article>

      <Article no={10} title="탈퇴와 이용 종료">
        <Items>
          <Item>
            회원은 언제든지 <strong>내 정보 → 회원 탈퇴</strong>에서 스스로 탈퇴할 수
            있습니다.
          </Item>
          <Item>
            탈퇴하면 회원의 기록·영상·체크인·운동 기록이 모두 삭제되며 복구할 수
            없습니다.
          </Item>
          <Item>
            회사는 회원이 이 약관을 중대하게 어긴 경우 이용 계약을 해지할 수 있습니다.
            해지 전에 소명할 기회를 드립니다.
          </Item>
        </Items>
      </Article>

      <Article no={11} title="책임의 한계">
        <Items>
          <Item>
            회사는 천재지변, 회원의 귀책사유, 통신사 장애 등 회사가 어쩔 수 없는 사유로
            서비스를 제공하지 못한 경우 책임을 지지 않습니다.
          </Item>
          <Item>
            회사는 회원이 서비스에 올린 기록의 정확성을 보증하지 않습니다. 잘못 입력된
            기록으로 계산된 조언의 결과도 마찬가지입니다.
          </Item>
          <Item>
            회사는 회원의 영상을 안전하게 보관하기 위해 노력하지만, 회원께서는 중요한
            영상을 따로 보관해 두시기를 권합니다.
          </Item>
        </Items>
      </Article>

      <Article no={12} title="분쟁 해결">
        <Items>
          <Item>
            서비스 이용과 관련한 문의는 <Blank>[문의 이메일]</Blank>로 보내주세요.
          </Item>
          <Item>
            회사와 회원 사이에 분쟁이 생기면 서로 성실히 협의해 해결합니다. 협의가
            안 되면 「민사소송법」에 따른 관할 법원에 소를 제기할 수 있습니다.
          </Item>
        </Items>
      </Article>

      <footer className="mt-12 border-t border-line pt-6 text-sm leading-relaxed text-muted">
        <p>
          개인정보를 어떻게 다루는지는{' '}
          <Link href="/privacy" className="font-medium text-sky underline">
            개인정보 처리방침
          </Link>
          에 따로 적어 두었습니다.
        </p>
      </footer>
    </article>
  );
}
