import { coverageText, measurementText, prescriptionMessage, REPORT_CRITERIA, REPORT_STATUS_TEXT, type PitchReport } from '@/lib/pitch-3d/v2/report';

/** A portable, self-contained copy of what the viewer is allowed to see. No signed URLs or personal identifiers. */
export function reportExportHtml(report: PitchReport, title: string, when: string, scene?: string | null): string {
  const e = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const p = (value: string | null | undefined, cls = '') => value ? `<p${cls ? ` class="${cls}"` : ''}>${e(value)}</p>` : '';
  const items = report.items.map((item, index) => {
    const status = REPORT_STATUS_TEXT[item.status] ?? '확인 필요';
    const value = item.status !== 'unsure' && item.value ? `<div class="metric"><strong>${e(item.value)}</strong> ${e(item.valueLabel)}</div>` : '';
    const foot = item.status === 'good' || item.status === 'fair' ? '' : p(item.foot, 'muted');
    const quality = item.status === 'unsure' ? p(measurementText(item), 'muted') : '';
    return `<section class="item"><div class="row"><span class="number">${String(index + 1).padStart(2, '0')}</span><h3>${e(item.element)}</h3><span class="status">${e(status)}</span></div>${p(item.obs ?? item.line, 'observation')}${value}${p(item.metricNote, 'muted')}${foot}${quality}</section>`;
  }).join('');
  const rx = report.criteria === REPORT_CRITERIA && report.rx.length > 0
    ? report.rx.map((item) => `<section class="item"><h3>${e(item.element)}</h3>${p(item.cue)}${item.weeks.map((stage) => `<p><b>${e(stage.stage)}</b> · ${stage.drills.map((drill) => `${e(drill.title)} (${e(drill.dose)})`).join(' · ')}</p>`).join('')}</section>`).join('')
    : p(prescriptionMessage(report), 'muted');
  const image = scene && scene.length <= 2_000_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(scene) ? `<figure><img src="${scene}" alt="선택한 3D 장면"><figcaption>저장할 때 선택한 3D 장면</figcaption></figure>` : '';
  const meta = [title, when, report.ground === 'flat' ? '평지' : '마운드', report.hand === 'L' ? '왼손' : '오른손', '이번 한 구 기준'].filter(Boolean).map(e).join(' · ');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>투구 분석 리포트</title><style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#18202e;margin:0;font-size:10pt;line-height:1.4}header{border-bottom:2px solid #192334;padding-bottom:12px}h1{font-size:23pt;letter-spacing:-.035em;margin:0 0 4px}h2{font-size:15pt;margin:20px 0 8px;break-after:avoid}h3{font-size:11pt;margin:0}p{margin:3px 0;white-space:pre-line}.muted,.meta,.number,figcaption{color:#5d6877;font-size:9pt}.summary{padding:12px 0;border-bottom:1px solid #dce2e9}.headline{font-size:14pt;font-weight:700}figure{margin:14px 0 0;break-inside:avoid}figure img{display:block;width:auto;max-width:100%;max-height:220px;background:#151722}figcaption{margin-top:4px}.item{padding:9px 0;border-bottom:1px solid #e2e7ed;break-inside:avoid}.row{display:flex;align-items:baseline;gap:12px}.number{min-width:20px}.status{margin-left:auto;color:#415b75;font-size:9pt}.observation{margin-top:5px}.metric{margin:4px 0;color:#526071;font-size:9pt}.metric strong{font-size:14pt;color:#18202e}footer{margin-top:18px;padding-top:10px;border-top:1px solid #dce2e9;color:#5d6877;font-size:9pt}@media screen{body{max-width:720px;margin:32px auto;padding:0 24px}}@media print{button{display:none}}
</style></head><body><header><h1>투구 분석 리포트</h1><p class="meta">${meta}</p></header><div class="summary"><p class="headline">${e(report.headline.title)}</p>${p(report.headline.why, 'muted')}${p(coverageText(report.coverage), 'meta')}${image}</div><h2>투구의 흐름</h2>${items}<h2>${report.rx.length && report.criteria === REPORT_CRITERIA ? '개선 드릴' : '다음 확인'}</h2>${rx}<footer>이 리포트는 이 한 구의 분석 결과입니다. 원본 영상은 포함되지 않습니다.</footer></body></html>`;
}
