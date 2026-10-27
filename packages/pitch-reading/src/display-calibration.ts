/** Physical screen scale. No camera controls or user-controlled eye position. */
export const DISPLAY_VERSION='physical-window-1';
export type DisplayCalibration={cssPixelsPerCm:number;viewDistanceCm:number;source:'device'|'card'|'estimated';version:string};
export const CARD_SHORT_EDGE_CM=5.398;
export function validCalibration(value:unknown):value is DisplayCalibration{
  if(!value||typeof value!=='object')return false;const p=value as DisplayCalibration;
  return Number.isFinite(p.cssPixelsPerCm)&&p.cssPixelsPerCm>=10&&p.cssPixelsPerCm<=200&&Number.isFinite(p.viewDistanceCm)&&p.viewDistanceCm>=25&&p.viewDistanceCm<=100&&['device','card','estimated'].includes(p.source)&&p.version===DISPLAY_VERSION;
}
export function physicalFov(widthCssPx:number,calibration:DisplayCalibration){
  return 2*Math.atan(widthCssPx/calibration.cssPixelsPerCm/(2*calibration.viewDistanceCm))*180/Math.PI;
}
export function estimateDisplay(touch:boolean,screenShortCssPx:number):DisplayCalibration{
  const phone=touch&&screenShortCssPx<600;
  return {cssPixelsPerCm:phone?screenShortCssPx/6.5:touch?screenShortCssPx/17.5:96/2.54,viewDistanceCm:phone?35:touch?45:60,source:'estimated',version:DISPLAY_VERSION};
}
export function cardCalibration(cardShortEdgeCssPx:number,viewDistanceCm:number):DisplayCalibration{
  const result={cssPixelsPerCm:cardShortEdgeCssPx/CARD_SHORT_EDGE_CM,viewDistanceCm,source:'card' as const,version:DISPLAY_VERSION};
  if(!validCalibration(result))throw new Error('화면 크기 보정 범위를 벗어났습니다.');return result;
}
