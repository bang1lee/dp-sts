/** One shared score drives the image and the sound, in seconds and normalized coordinates. */
export const CONTINUUM_DURATION=180;
export type ContinuumKind='line'|'circle';
export interface ContinuumEvent {id:string;time:number;x:number;y:number;kind:ContinuumKind}
export const CONTINUUM_EVENTS:ReadonlyArray<ContinuumEvent>=[
  {id:'line-01',time:5,x:-.50,y:-.15,kind:'line'},
  {id:'line-02',time:10.25,x:.16,y:.32,kind:'line'},
  {id:'line-03',time:15.5,x:.46,y:-.24,kind:'line'},
  {id:'line-04',time:21.25,x:-.26,y:.26,kind:'line'},
  {id:'line-05',time:27,x:.03,y:-.36,kind:'line'},
  {id:'line-06',time:32,x:.35,y:.12,kind:'line'},
  {id:'circle-01',time:40.5,x:-.40,y:.06,kind:'circle'},
  {id:'circle-02',time:46,x:.20,y:-.30,kind:'circle'},
  {id:'circle-03',time:52.5,x:.45,y:.17,kind:'circle'},
  {id:'circle-04',time:59,x:-.14,y:.32,kind:'circle'},
  {id:'circle-05',time:66,x:-.35,y:-.23,kind:'circle'},
  {id:'circle-06',time:72,x:.24,y:.03,kind:'circle'},
];
const clamp01=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(a:number,b:number,t:number)=>{const x=clamp01((t-a)/(b-a));return x*x*(3-2*x);};
export interface ContinuumState {time:number;weights:{lines:number;circles:number;mandelbulb:number;particles:number};progress:{lines:number;circles:number;mandelbulb:number;particles:number};dissolve:number}
/** Smoothly overlapping phases; weights sum to one and final dissolve reaches zero at 180. */
export function continuumStateAt(seconds:number):ContinuumState {
  if(!Number.isFinite(seconds))throw new Error('Invalid continuum time');
  const time=Math.max(0,Math.min(CONTINUUM_DURATION,seconds));
  const a=smooth(30,40,time),b=smooth(69,81,time),c=smooth(118,132,time);
  return {time,weights:{lines:1-a,circles:a*(1-b),mandelbulb:b*(1-c),particles:c},
    progress:{lines:clamp01(time/35),circles:clamp01((time-35)/40),mandelbulb:clamp01((time-75)/50),particles:clamp01((time-125)/55)},
    dissolve:1-smooth(168,180,time)};
}
