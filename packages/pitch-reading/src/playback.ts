/** Integrate a smooth 1x -> .5x transition around the last 100ms of flight.
 * This clock is only for the answer replay, never the timed observation.
 */
export function replayTime(elapsed:number,from:number,duration:number):number {
  const start=Math.max(0,duration-.14-from),width=.08;
  const transition=Math.max(0,Math.min(width,elapsed-start)),u=transition/width;
  // Integral of 1 - .5 * smoothstep(u); position and acceleration join continuously.
  const during=width*(u-.5*(u*u*u-.5*u*u*u*u));
  return from+Math.min(elapsed,start)+during+Math.max(0,elapsed-start-width)*.5;
}
