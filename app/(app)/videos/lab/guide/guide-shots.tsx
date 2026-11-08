import type { LabGuideScreen, LabGuideShot } from '@/lib/pitch-lab-guide';
import { forHand, type LabHand } from '@/lib/pitch-lab-meta';

/**
 * 촬영 안내의 폰 화면 그림(카메라 설정 · AirDrop) — 자료는 lib/pitch-lab-guide.ts, 앱 native/src/lab/guide-shots.tsx 와 같은 짜임.
 * 그림 속은 늘 아이폰 밝은 화면 색(실제 폰 화면처럼). 그림은 읽어 주지 않는다(옆 글이 같은 말을 한다).
 */
const HOT = 'outline outline-2 outline-[#0a84ff] rounded-[7px]';

export function GuideShots({ shots, hand }: { shots: readonly LabGuideShot[]; hand: LabHand }) {
  return (
    <ol className="space-y-4">
      {shots.map((shot, i) => (
        <li key={shot.text} className="flex items-center gap-4">
          <PhoneShot screen={shot.screen} />
          <div className="space-y-1.5">
            <span className="text-numeric grid h-6 w-6 place-items-center rounded-full bg-sky text-xs font-bold text-white">{i + 1}</span>
            <p className="text-sm leading-relaxed break-keep text-ink">{forHand(shot.text, hand)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function PhoneShot({ screen }: { screen: LabGuideScreen }) {
  return (
    <div
      aria-hidden
      style={{ zoom: 1.25 }}
      className={`aspect-[9/18.5] w-28 shrink-0 overflow-hidden rounded-[20px] border-4 border-[#1c1c1e] text-black select-none ${screen.kind === 'camera' ? 'bg-black' : 'bg-[#f2f2f7]'}`}
    >
      {screen.kind === 'list' ? <ListScreen s={screen} /> : screen.kind === 'camera' ? <CameraScreen lock={!!screen.lock} /> : <ShareScreen hot={screen.hot} />}
    </div>
  );
}

function ListScreen({ s }: { s: Extract<LabGuideScreen, { kind: 'list' }> }) {
  return (
    <div className="space-y-2 px-1.5 pt-3.5">
      <div className="relative text-center text-[8px] font-bold">
        {s.title}
        {s.done && <span className="absolute right-0 text-[#0a84ff]">완료</span>}
      </div>
      <div className="rounded-[7px] bg-white">
        {s.rows.map((r, i) => (
          <div
            key={r.label}
            className={`flex min-h-[22px] items-center justify-between px-1.5 text-[7px] ${i ? 'border-t-[0.5px] border-[#d1d1d6]' : ''} ${r.hot ? `${HOT} font-bold` : ''}`}
          >
            <span>{r.label}</span>
            {r.check && <span className="text-[9px] font-extrabold text-[#0a84ff]">✓</span>}
            {r.on != null && (
              <span className={`flex h-[11px] w-[18px] rounded-full p-px ${r.on ? 'justify-end bg-[#34c759]' : 'bg-[#e5e5ea]'}`}>
                <span className="h-[9px] w-[9px] rounded-full bg-white" />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CameraScreen({ lock }: { lock: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[30px] items-center justify-end px-1.5 pt-3">
        <span className={`rounded px-0.5 text-[6px] font-bold ${lock ? 'text-white' : 'border border-[#ffd60a] text-[#ffd60a]'}`}>HD · 240</span>
      </div>
      <div className="relative flex flex-1 items-center justify-center bg-[#3a3f2f]">
        {lock && <span className="absolute top-1.5 rounded-sm bg-[#ffd60a] px-1 text-[6px] font-extrabold">AE/AF 잠금</span>}
        <div className="flex flex-col items-center">
          <span className="h-[9px] w-[9px] rounded-full bg-[#d9d4c7]" />
          <span className="mt-px h-6 w-1 bg-[#d9d4c7]" />
          <span className="flex gap-1.5">
            <span className="h-4 w-[3px] rotate-[20deg] bg-[#d9d4c7]" />
            <span className="h-4 w-[3px] -rotate-[20deg] bg-[#d9d4c7]" />
          </span>
        </div>
        {lock && <span className="absolute h-10 w-10 border-[1.5px] border-[#ffd60a]" />}
      </div>
      <div className="flex h-[66px] flex-col items-center gap-1 pt-1 text-[6px]">
        <div className="flex items-center gap-1 text-white">
          <span>.5</span>
          <span className={`grid h-3.5 w-3.5 place-items-center rounded-full bg-white/20 font-extrabold text-[#ffd60a] ${lock ? '' : 'outline outline-[1.5px] outline-[#0a84ff]'}`}>1×</span>
          <span>2</span>
        </div>
        <div className="flex gap-1.5 text-[#8e8e93]">
          <span>동영상</span>
          <span className="font-extrabold text-[#ffd60a]">슬로 모션</span>
          <span>사진</span>
        </div>
        <span className="grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-white">
          <span className="h-[15px] w-[15px] rounded-full bg-[#ff3b30]" />
        </span>
      </div>
    </div>
  );
}

function ShareScreen({ hot }: { hot: 'options' | 'airdrop' }) {
  return (
    <div className="flex h-full flex-col">
      <div className="h-[70px] shrink-0 bg-[#3a3f2f]" />
      <div className="-mt-2 flex-1 space-y-2 rounded-t-[10px] bg-[#f2f2f7] px-1.5 pt-2 text-[6px]">
        <div className="flex items-center gap-1">
          <span className="h-4 w-4 rounded-[3px] bg-[#3a3f2f]" />
          <div>
            <p className="font-bold">비디오 1개 선택됨</p>
            <p className={`inline-block px-0.5 font-bold text-[#0a84ff] ${hot === 'options' ? HOT : ''}`}>옵션 ›</p>
          </div>
        </div>
        <div className="flex justify-between">
          {(['AirDrop', '메시지', '메일'] as const).map((name) => (
            <div key={name} className={`flex flex-col items-center gap-0.5 p-0.5 text-[5.5px] ${hot === 'airdrop' && name === 'AirDrop' ? HOT : ''}`}>
              <span className={`h-5 w-5 ${name === 'AirDrop' ? 'rounded-full bg-[#0a84ff]' : `rounded-[5px] ${name === '메시지' ? 'bg-[#34c759]' : 'bg-[#5ac8fa]'}`}`} />
              {name}
            </div>
          ))}
        </div>
        <div className="flex h-5 items-center rounded-md bg-white px-1.5">복사하기</div>
      </div>
    </div>
  );
}
