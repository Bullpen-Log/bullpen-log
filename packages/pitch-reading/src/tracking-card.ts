import type {Pitch} from './physics.ts';
import {STRIKE_ZONE,type ZoneAssessment} from './strike-zone.ts';
export function trackingCard(pitch:Pitch,result:ZoneAssessment){
  const scale=140,x=120-result.point.x*scale,y=225-result.point.y*scale;
  const left=120-STRIKE_ZONE.halfWidth*scale,top=225-STRIKE_ZONE.top*scale,width=STRIKE_ZONE.halfWidth*2*scale,height=(STRIKE_ZONE.top-STRIKE_ZONE.bottom)*scale;
  return `<div class="track-heading"><span>공 추적</span><strong>${pitch.name}</strong><small>${pitch.speedKmh.toFixed(1)} km/h</small></div>
    <svg viewBox="0 0 240 225" role="img" aria-label="투수 방향에서 본 KBO ABS 중간면 스트라이크존과 통과 위치">
      <defs><pattern id="track-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#7197a5" stroke-opacity=".10"/></pattern></defs>
      <rect width="240" height="225" fill="url(#track-grid)"/>
      <rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#9dbfc414" stroke="#c7e0e2" stroke-width="1.6"/>
      ${[1,2].map(i=>`<path d="M${left+width*i/3} ${top}v${height}M${left} ${top+height*i/3}h${width}" stroke="#95bdc0" stroke-opacity=".4" stroke-width=".7"/>`).join('')}
      <path d="M103 223h34v-5l-17-6-17 6z" fill="#d7e4db" opacity=".7"/>
      <circle class="track-live" cx="120" cy="225" r="5.124" fill="#f4f7ef" stroke="#263e43" stroke-width="1.2" hidden/>
      <g class="track-impact" hidden><circle cx="${x}" cy="${y}" r="10" fill="none" stroke="currentColor" stroke-opacity=".4"/><circle cx="${x}" cy="${y}" r="5.124" fill="currentColor" stroke="#f5f7ed" stroke-width="1.1"/></g>
    </svg><div class="track-verdict" aria-live="polite"><span id="track-call">존 통과 확인 중</span><small id="track-call-detail">전체 궤적을 따라가 보세요</small></div><p>KBO ABS · 중간면 위치</p>`;
}
