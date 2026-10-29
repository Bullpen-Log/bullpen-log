import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Platform, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppDugout, loadAppVenues, MeetupCard } from '@/app/actions/app-dugout';
import type { loadAppCommunity } from '@/app/actions/community';
import { COMMUNITY_REGIONS, postCategoryLabel } from '@/lib/community';
import { hasKoreaDugout } from '@/lib/country';
import { DISTRICTS } from '@/lib/kr-districts';
import type { FeedCard } from '@/lib/sinker-dugout-feed';
import { useCountry } from '~/lib/country-store';
import { READABLE } from '~/lib/layout';
import { rpc, RpcError } from '~/lib/rpc';
import { SPACE, TYPE, usePalette, withAlpha, type Palette } from '~/lib/ui';
import { PageHead, Segmented } from '~/shell/heading';
import { Icon, type IconName } from '~/shell/icon';
import { MenuButton } from '~/shell/menu-button';
import { Pulse } from '~/shell/motion';
import { Press } from '~/shell/press';
import { useFocusRefresh, useOnTabActive, useRetapTop } from '~/shell/tab-pager';
import { useLoad } from '~/community/parts';
import { toast } from '~/shell/toast';
import { MatchRail } from './match-rail';
import { loadMoreMeetups, reloadMeetups, resetMeetups, selectMeetup, setMeetupRegion, useMeetups } from './home-store';

/** 덕아웃 탭의 앱 판 — 껍데기 주소 '/?dugout=1'(사이트 lib/nav.ts DUGOUT_HREF) */
export const isDugoutHome = (path: string, search: string) => path === '/' && new URLSearchParams(search).get('dugout') === '1';
export const resetDugoutCache = () => resetMeetups();

type Seg = 'browse' | 'community' | 'venues';

const failText = (e: unknown, what: string) => (e instanceof RpcError && e.code === 'offline' ? '신호가 약해 받지 못했어요.' : `${what}을 불러오지 못했어요.`);

/**
 * 덕아웃 탭(앱 화면) — 2026-10-29 확정 시안 '매치 카드 + 모임 가로 넘기기'.
 *   덕아웃 · 내 활동 · 메뉴 → [둘러보기 | 커뮤니티 | 연습장] → (둘러보기) 내 활동 한 줄 → 같이 연습(모임 카드 가로 넘기기) → 커뮤니티 인기 · 최신 둘 → 연습장 한 곳.
 * 모임 = 커뮤니티 번개(app/actions/app-dugout.ts) — 카드를 누르면 앱 모임 화면(/meetup/<id>, 참가 · 취소 · 티켓). 글 · 댓글 · 대화 · 글쓰기 · 신고 · 차단과
 * 연습장 자세히 · 예약은 기존 웹 덕아웃 화면 그대로(onWeb). 알림은 공통 메뉴 안(머리의 따로 된 종은 없다).
 * 묶음마다 따로 불러오고 따로 실패한다 — 모임이 없어도 커뮤니티 · 연습장은 보인다. 첫 사용자에게 예시 모임 · 글을 채우지 않는다.
 * 미국 · 일본은 커뮤니티만(lib/country.ts) — 같이 연습 · 연습장 칸이 없다.
 */
export function DugoutTab({ bottom, onWeb }: { bottom: number; onWeb: (href: string) => void }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const korea = hasKoreaDugout(useCountry());
  const [seg, setSeg] = useState<Seg>('browse');
  const segs: { value: Seg; label: string }[] = korea
    ? [
        { value: 'browse', label: '둘러보기' },
        { value: 'community', label: '커뮤니티' },
        { value: 'venues', label: '연습장' },
      ]
    : [
        { value: 'browse', label: '둘러보기' },
        { value: 'community', label: '커뮤니티' },
      ];

  /* 내 활동 · 커뮤니티 · 연습장 — 화면에 돌아올 때 다시 읽는다(useLoad), 탭을 다시 볼 때도 */
  const { data: home, error: homeError, reload: reloadHome } = useLoad<Awaited<ReturnType<typeof loadAppDugout>>>('app-dugout.loadAppDugout');
  const loadHome = () => void reloadHome();
  const meetups = useMeetups();
  useEffect(() => {
    if (korea) void reloadMeetups();
  }, [korea]);
  useOnTabActive(() => {
    void reloadHome();
    if (korea) void reloadMeetups();
  });
  useFocusRefresh(() => {
    if (korea) void reloadMeetups();
  });
  const scroll = useRef<ScrollViewInstance>(null);
  useRetapTop(() => scroll.current?.scrollTo({ y: 0, animated: true }));

  const openMeetup = useCallback((m: MeetupCard, ticket: boolean) => {
    selectMeetup(m.id);
    router.push(`/meetup/${m.id}${ticket ? '?ticket=1' : ''}` as Href);
  }, []);
  const nearEnd = useCallback(() => loadMoreMeetups(), []);

  return (
    <ScrollView
      ref={scroll}
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[{ paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side, gap: 14 }, READABLE]}
    >
      <PageHead title="덕아웃">
        <Press accessibilityRole="button" accessibilityLabel="내 활동, 참가 모임 · 내 글 · 저장한 글" onPress={() => onWeb('/me/community')} style={[st.headBtn, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Icon name="ticket" size={20} color={c.ink} />
        </Press>
        <MenuButton />
      </PageHead>
      <Segmented<Seg> label="덕아웃 보기" options={segs} value={seg} onChange={setSeg} />

      {seg === 'browse' ? (
        <View style={{ gap: 22 }}>
          {korea && home?.activity ? (
            <Press
              card
              accessibilityRole="button"
              accessibilityLabel={`${home.activity.title}, ${home.activity.sub}`}
              onPress={() => {
                const a = home.activity;
                if (!a) return;
                if (a.meetupId) router.push(`/meetup/${a.meetupId}?ticket=1` as Href);
                else onWeb(a.href);
              }}
              style={[st.activity, { backgroundColor: c.card, boxShadow: c.float }]}
            >
              <View style={[st.activityMark, { backgroundColor: withAlpha(c.link, 0.12) }]}>
                <Icon name={home.activity.meetupId ? 'ticket' : 'messages-square'} size={20} color={c.link} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>
                  {home.activity.title}
                </Text>
                <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13 }}>
                  {home.activity.sub}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={c.muted} />
            </Press>
          ) : null}
          {korea && home && home.activity === null ? <Text style={{ color: c.muted, fontSize: 13 }}>내 활동을 불러오지 못했어요.</Text> : null}

          {korea ? (
            <View style={{ gap: 10 }}>
              <View style={st.sectionHead}>
                <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink, flex: 1 }]}>
                  같이 연습
                </Text>
                <Press accessibilityRole="button" accessibilityLabel={`지역, ${areaOf(meetups.region) ?? '전국'}, 바꾸기`} onPress={pickRegion} style={st.region}>
                  <Icon name="map-pin" size={15} color={c.muted} />
                  <Text style={{ color: c.muted, fontSize: 13 }}>{areaOf(meetups.region) ?? '전국'}</Text>
                  <Icon name="chevron-down" size={14} color={c.muted} />
                </Press>
              </View>
              {meetups.items === null ? (
                meetups.error ? (
                  <Empty c={c} icon="circle-alert" text={meetups.error} action="다시 불러오기" onAction={() => void reloadMeetups()} />
                ) : (
                  <Pulse style={[st.skel, { height: 330, backgroundColor: c.line }]} />
                )
              ) : meetups.items.length === 0 ? (
                meetups.region.region ? (
                  <Empty c={c} icon="map-pin" text={`${areaOf(meetups.region)}에는 아직 모임이 없어요`} action="전국 모임 보기" onAction={() => setMeetupRegion({ region: null, district: null })} />
                ) : (
                  <Empty c={c} icon="people" text="등록된 모임이 없어요" action="모임 만들기" onAction={() => onWeb('/community/new?board=meetup')} />
                )
              ) : (
                <>
                  <MatchRail items={meetups.items} selected={meetups.selected} hasMore={meetups.hasMore} onSelect={selectMeetup} onOpen={openMeetup} onNearEnd={nearEnd} />
                  {meetups.error ? <Text style={{ color: c.muted, fontSize: 13 }}>{meetups.error}</Text> : null}
                </>
              )}
            </View>
          ) : null}

          <CommunityPreview c={c} data={home?.community ?? null} loading={!home && !homeError} onWeb={onWeb} onAll={() => setSeg('community')} onRetry={loadHome} />

          {korea ? (
            <View style={{ gap: 10 }}>
              <SectionTitle c={c} title="연습장" action="전체 보기" onAction={() => setSeg('venues')} />
              {!home ? (
                homeError ? <Retry c={c} text="연습장을 불러오지 못했어요." onRetry={loadHome} /> : <Pulse style={[st.skel, { height: 84, backgroundColor: c.line }]} />
              ) : home.venue === null ? (
                <Retry c={c} text="연습장을 불러오지 못했어요." onRetry={loadHome} />
              ) : home.venue ? (
                <VenueRow c={c} v={home.venue} onPress={() => onWeb(`/venues/${home.venue?.id}`)} />
              ) : (
                <Empty c={c} icon="venue" text="등록된 연습장이 없어요" action="연습장 지도 보기" onAction={() => onWeb('/venues')} />
              )}
            </View>
          ) : null}
        </View>
      ) : seg === 'community' ? (
        <CommunityAll c={c} onWeb={onWeb} />
      ) : (
        <VenueAll c={c} onWeb={onWeb} />
      )}
    </ScrollView>
  );
}

const areaOf = (r: { region: string | null; district: string | null }) => (r.region ? [r.region, r.district].filter(Boolean).join(' ') : null);

/** 지역 고르기 — 시 · 도 → (구가 여럿이면) 시 · 군 · 구. 위치 권한 없이 고른다(커뮤니티 동네 거르기와 같은 표) */
function pickRegion() {
  if (Platform.OS !== 'ios') return;
  const regions = ['전국', ...COMMUNITY_REGIONS];
  ActionSheetIOS.showActionSheetWithOptions(
    { title: '어느 동네 모임을 볼까요?', options: [...regions, '취소'], cancelButtonIndex: regions.length },
    (i) => {
      if (i >= regions.length) return;
      if (i === 0) return setMeetupRegion({ region: null, district: null });
      const region = regions[i];
      const list = DISTRICTS[region] ?? [];
      if (list.length <= 1) return setMeetupRegion({ region, district: null });
      const opts = [`${region} 전체`, ...list];
      ActionSheetIOS.showActionSheetWithOptions({ title: region, options: [...opts, '취소'], cancelButtonIndex: opts.length }, (j) => {
        if (j >= opts.length) return;
        setMeetupRegion({ region, district: j === 0 ? null : opts[j] });
      });
    }
  );
}

function SectionTitle({ c, title, action, onAction }: { c: Palette; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={st.sectionHead}>
      <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink, flex: 1 }]}>
        {title}
      </Text>
      {action && onAction ? (
        <Press accessibilityRole="button" accessibilityLabel={`${title} ${action}`} onPress={onAction} style={st.more}>
          <Text style={{ color: c.link, fontSize: 14 }}>{action}</Text>
          <Icon name="chevron-right" size={14} color={c.link} />
        </Press>
      ) : null}
    </View>
  );
}

function Empty({ c, icon, text, action, onAction }: { c: Palette; icon: IconName; text: string; action?: string; onAction?: () => void }) {
  return (
    <View style={[st.empty, { backgroundColor: c.card }]}>
      <Icon name={icon} size={22} color={c.muted} />
      <Text style={{ color: c.ink, fontSize: 15, textAlign: 'center' }}>{text}</Text>
      {action && onAction ? (
        <Press accessibilityRole="button" onPress={onAction} style={[st.emptyBtn, { backgroundColor: withAlpha(c.link, 0.12) }]}>
          <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
}

function Retry({ c, text, onRetry }: { c: Palette; text: string; onRetry: () => void }) {
  return (
    <View style={st.retry}>
      <Text style={{ color: c.danger, fontSize: 14, flex: 1 }}>{text}</Text>
      <Press accessibilityRole="button" accessibilityLabel="다시 불러오기" onPress={onRetry} style={st.more}>
        <Text style={{ color: c.link, fontSize: 15 }}>다시</Text>
      </Press>
    </View>
  );
}

/** 둘러보기의 커뮤니티 — 인기글 · 최신글 둘씩(인기 = 최근 7일 글의 좋아요 차례 — lib/sinker-dugout-load.ts, 서버 규칙 그대로) */
function CommunityPreview({
  c,
  data,
  loading,
  onWeb,
  onAll,
  onRetry,
}: {
  c: Palette;
  data: { hot: FeedCard[] | null; latest: FeedCard[] | null } | null;
  loading: boolean;
  onWeb: (href: string) => void;
  onAll: () => void;
  onRetry: () => void;
}) {
  const [sort, setSort] = useState<'hot' | 'latest'>('hot');
  const list = data ? data[sort] : null;
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle c={c} title="커뮤니티" action="전체 보기" onAction={onAll} />
      <View style={st.chips}>
        {(
          [
            ['hot', '인기글'],
            ['latest', '최신글'],
          ] as const
        ).map(([k, label]) => (
          <Press
            key={k}
            select
            selected={sort === k}
            accessibilityRole="tab"
            accessibilityState={{ selected: sort === k }}
            onPress={() => setSort(k)}
            style={[st.chip, sort === k && { backgroundColor: withAlpha(c.link, 0.12) }]}
          >
            <Text style={{ color: sort === k ? c.link : c.muted, fontSize: 14, fontWeight: sort === k ? '600' : '400' }}>{label}</Text>
          </Press>
        ))}
        {sort === 'hot' ? <Text style={{ color: c.muted, fontSize: 12, marginLeft: 'auto' }}>최근 7일</Text> : null}
      </View>
      {loading ? (
        <Pulse style={[st.skel, { height: 150, backgroundColor: c.line }]} />
      ) : !data || list === null ? (
        <Retry c={c} text="글을 불러오지 못했어요." onRetry={onRetry} />
      ) : list.length === 0 ? (
        <Empty c={c} icon="pencil" text="아직 올라온 글이 없어요" action="글쓰기" onAction={() => onWeb('/community/new')} />
      ) : (
        <View style={[st.list, { backgroundColor: c.card }]}>
          {list.map((p, i) => (
            <PostRow key={`${p.id}:${p.saved}`} c={c} p={p} first={i === 0} onOpen={() => onWeb(`/community/${p.id}`)} />
          ))}
        </View>
      )}
    </View>
  );
}

/** 글 한 줄 — 말머리 · 제목 · 쓴 사람 · 댓글, 오른쪽 저장(책갈피, 서버가 돌려준 실제 상태로 맞춘다) */
function PostRow({ c, p, first, onOpen }: { c: Palette; p: FeedCard; first: boolean; onOpen: () => void }) {
  const [saved, setSaved] = useState(p.saved);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const toggle = () => {
    if (lock.current) return;
    lock.current = true;
    const want = !saved;
    setBusy(true);
    setSaved(want);
    rpc<{ ok: true; saved: boolean } | { ok: false; error: string }>('app-dugout.setAppPostSaved', p.id, want)
      .then(
        (r) => {
          if (r.ok) return setSaved(r.saved);
          setSaved(!want);
          toast(r.error, 'error');
        },
        (e: unknown) => {
          setSaved(!want);
          toast(failText(e, '저장'), 'error');
        }
      )
      .then(() => {
        lock.current = false;
        setBusy(false);
      });
  };
  return (
    <View style={[st.postRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
      <Press accessibilityRole="button" accessibilityLabel={`${p.label}, ${p.title}, ${p.author}, ${p.meta}`} onPress={onOpen} style={{ flex: 1, minWidth: 0, gap: 3, paddingVertical: 12 }}>
        <Text style={{ color: c.link, fontSize: 12, fontWeight: '600' }}>{p.label}</Text>
        <Text numberOfLines={2} style={{ color: c.ink, fontSize: 16, fontWeight: '600', lineHeight: 22 }}>
          {p.title}
        </Text>
        <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{`${p.author} · ${p.meta}`}</Text>
      </Press>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`${p.title} ${saved ? '저장 풀기' : '저장'}`}
        accessibilityState={{ selected: saved, busy }}
        onPress={toggle}
        style={st.save}
      >
        <Icon name="bookmark" size={20} color={saved ? c.link : c.muted} fill={saved ? c.link : 'none'} />
      </Press>
    </View>
  );
}

/** 커뮤니티 칸 — 앱 글 목록(community.loadAppCommunity, 인기 · 최신은 서버 정렬 그대로) · 더 보기, 글 · 글쓰기 · 게시판 고르기는 웹 덕아웃 */
function CommunityAll({ c, onWeb }: { c: Palette; onWeb: (href: string) => void }) {
  const [sort, setSort] = useState<'new' | 'hot'>('new');
  const [pages, setPages] = useState(1);
  const { data, stale: busy, error, reload } = useLoad<Awaited<ReturnType<typeof loadAppCommunity>>>('community.loadAppCommunity', null, sort, pages);
  return (
    <View style={{ gap: 12 }}>
      <View style={st.chips}>
        {(
          [
            ['new', '최신'],
            ['hot', '인기'],
          ] as const
        ).map(([k, label]) => (
          <Press
            key={k}
            select
            selected={sort === k}
            accessibilityRole="tab"
            accessibilityState={{ selected: sort === k }}
            onPress={() => {
              setSort(k);
              setPages(1);
            }}
            style={[st.chip, sort === k && { backgroundColor: withAlpha(c.link, 0.12) }]}
          >
            <Text style={{ color: sort === k ? c.link : c.muted, fontSize: 14, fontWeight: sort === k ? '600' : '400' }}>{label}</Text>
          </Press>
        ))}
        <Press accessibilityRole="button" onPress={() => onWeb('/community/new')} style={[st.write, { backgroundColor: c.action }]}>
          <Icon name="pencil" size={15} color={c.onAction} />
          <Text style={{ color: c.onAction, fontSize: 14, fontWeight: '600' }}>글쓰기</Text>
        </Press>
      </View>
      {error && !data ? (
        <Retry c={c} text={error} onRetry={() => void reload()} />
      ) : !data ? (
        <Pulse style={[st.skel, { height: 260, backgroundColor: c.line }]} />
      ) : data.posts.length === 0 ? (
        <Empty c={c} icon="pencil" text="아직 올라온 글이 없어요" action="글쓰기" onAction={() => onWeb('/community/new')} />
      ) : (
        <View style={[st.list, { backgroundColor: c.card }]}>
          {data.posts.map((p, i) => (
            <Press
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`${postCategoryLabel(p.category)}, ${p.title}, ${p.nickname}, 댓글 ${p.comments}`}
              onPress={() => onWeb(`/community/${p.id}`)}
              style={[st.postRow, { paddingVertical: 12, opacity: p.hidden ? 0.5 : 1 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={{ color: c.link, fontSize: 12, fontWeight: '600' }}>{postCategoryLabel(p.category)}</Text>
                <Text numberOfLines={2} style={{ color: c.ink, fontSize: 16, fontWeight: '600', lineHeight: 22 }}>
                  {p.title}
                </Text>
                <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{`${p.nickname} · ${p.ago} · 댓글 ${p.comments}`}</Text>
              </View>
            </Press>
          ))}
        </View>
      )}
      {error && data ? <Text style={{ color: c.muted, fontSize: 13 }}>{error}</Text> : null}
      {data?.hasMore && pages < 10 ? (
        <Press accessibilityRole="button" disabled={busy} onPress={() => setPages(pages + 1)} style={[st.moreBtn, { backgroundColor: c.card }]}>
          <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>{busy ? '불러오는 중…' : '글 더 보기'}</Text>
        </Press>
      ) : null}
      <Press accessibilityRole="button" onPress={() => onWeb('/community')} style={[st.moreBtn, { backgroundColor: c.card }]}>
        <Text style={{ color: c.ink, fontSize: 15 }}>게시판 · 말머리로 찾기</Text>
        <Icon name="chevron-right" size={14} color={c.muted} />
      </Press>
    </View>
  );
}

function VenueRow({ c, v, onPress }: { c: Palette; v: { name: string; kindLabel: string; region: string | null; price: string; unit: string; booking: string }; onPress: () => void }) {
  return (
    <Press card accessibilityRole="button" accessibilityLabel={`${v.name}, ${[v.region, v.kindLabel].filter(Boolean).join(' · ')}, ${v.price} ${v.unit}, ${v.booking}`} onPress={onPress} style={[st.venue, { backgroundColor: c.card }]}>
      <View style={[st.venueMark, { backgroundColor: withAlpha(c.link, 0.12) }]}>
        <Icon name="venue" size={26} color={c.link} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>
          {[v.region, v.kindLabel].filter(Boolean).join(' · ')}
        </Text>
        <Text numberOfLines={2} style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>
          {v.name}
        </Text>
        <Text style={{ color: c.ink, fontSize: 14, fontWeight: '600' }}>
          {v.price}
          <Text style={{ color: c.muted, fontWeight: '400', fontSize: 12 }}>{v.unit ? ` ${v.unit}` : ''}</Text>
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={c.muted} />
    </Press>
  );
}

/** 연습장 칸 — 공개된 연습장(새로 연 곳부터). 자세히 · 빈 시간 · 예약은 웹 덕아웃(/venues/<id>), 지도는 /venues */
function VenueAll({ c, onWeb }: { c: Palette; onWeb: (href: string) => void }) {
  const { data, error, reload } = useLoad<Awaited<ReturnType<typeof loadAppVenues>>>('app-dugout.loadAppVenues');
  const venues = data?.venues ?? null;
  return (
    <View style={{ gap: 12 }}>
      <Press accessibilityRole="button" onPress={() => onWeb('/venues')} style={[st.moreBtn, { backgroundColor: c.card }]}>
        <Icon name="map-pin" size={16} color={c.link} />
        <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>지도로 보기</Text>
      </Press>
      {error && !venues ? (
        <Retry c={c} text={error} onRetry={() => void reload()} />
      ) : !venues ? (
        <Pulse style={[st.skel, { height: 200, backgroundColor: c.line }]} />
      ) : venues.length === 0 ? (
        <Empty c={c} icon="venue" text="등록된 연습장이 없어요" />
      ) : (
        venues.map((v) => <VenueRow key={v.id} c={c} v={v} onPress={() => onWeb(`/venues/${v.id}`)} />)
      )}
    </View>
  );
}

const st = StyleSheet.create({
  headBtn: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  activityMark: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  region: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingLeft: 8 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, minWidth: 44, justifyContent: 'flex-end' },
  skel: { borderRadius: 20 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 20, borderRadius: 20 },
  emptyBtn: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  write: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 20 },
  list: { borderRadius: 20, paddingHorizontal: 16 },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  save: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  venue: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 84, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 20 },
  venueMark: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 16 },
});
