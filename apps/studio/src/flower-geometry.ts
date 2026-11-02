/** Geometry is in units of the common radius. The lattice has neighbour distance R.
 * All arc vertices include exact pairwise intersections, so a revealed line reaches
 * its crossing at the same analytic angle/time used by the sound timeline. */
export interface FlowerCircle { id:number; q:number; r:number; x:number; y:number; radius:number; start:number; end:number; angles:number[] }
export interface CrossingEvent { time:number; x:number; y:number; pairs:[number,number][] }
export interface FlowerTimeline { duration:number; circles:FlowerCircle[]; events:CrossingEvent[] }
const TAU=2*Math.PI;
const EPS=1e-9;
function wrap(a:number){const v=(a%TAU+TAU)%TAU;return v<TAU-EPS?v:0;}
function unique(values:number[]){return values.sort((a,b)=>a-b).filter((v,i,a)=>i===0||v-a[i-1]>EPS);}
function intersections(a:FlowerCircle,b:FlowerCircle):Array<{x:number;y:number}> {
 const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),r=a.radius;
 if(d<EPS||d>2*r+EPS)return [];
 const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,h=Math.sqrt(Math.max(0,r*r-d*d/4));
 const px=-dy/d*h,py=dx/d*h;
 return h<EPS?[{x:mx,y:my}]:[{x:mx+px,y:my+py},{x:mx-px,y:my-py}];
}
export function createFlowerTimeline(duration=89.4332732399575):FlowerTimeline {
 if(!Number.isFinite(duration)||duration<=0)throw new Error('Duration must be positive');
 const lattice:Array<{q:number;r:number;ring:number;angle:number}>=[];
 for(let q=-2;q<=2;q++)for(let r=-2;r<=2;r++){
  const ring=Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r));
  if(ring<=2)lattice.push({q,r,ring,angle:wrap(Math.atan2(Math.sqrt(3)*r/2,q+r/2))});
 }
 lattice.sort((a,b)=>a.ring-b.ring||a.angle-b.angle||a.q-b.q||a.r-b.r);
 // Ratios preserve the original 89.43 s running time, with a seed and final hold.
 const scale=duration/89.4332732399575;
 const circles:FlowerCircle[]=lattice.map(({q,r},id)=>{
  const start=id===0?2:id<=6?8+(id-1)*4:39+(id-7)*3.25;
  const end=id===0?8:id<=6?start+4:start+3.25;
  return {id,q,r,x:q+r/2,y:Math.sqrt(3)*r/2,radius:1,start:start*scale,end:end*scale,angles:[]};
 });
 const raw:CrossingEvent[]=[];
 for(let i=0;i<circles.length;i++){
  const c=circles[i],angles=Array.from({length:193},(_,n)=>TAU*n/192);
  for(let j=0;j<circles.length;j++){
   if(i===j)continue;
   for(const point of intersections(c,circles[j])){
    const angle=wrap(Math.atan2(point.y-c.y,point.x-c.x));angles.push(angle);
    // Tangencies touch but do not cross, so they produce no crossing sound.
    if(j<i && Math.hypot(c.x-circles[j].x,c.y-circles[j].y)<2-EPS)raw.push({time:c.start+(c.end-c.start)*angle/TAU,x:point.x,y:point.y,pairs:[[j,i]]});
   }
  }
  c.angles=unique(angles);if(c.angles[c.angles.length-1]<TAU-EPS)c.angles.push(TAU);
 }
 raw.sort((a,b)=>a.time-b.time||a.x-b.x||a.y-b.y);
 const events:CrossingEvent[]=[];
 // Multiple prior circles can meet the active pen at one point. Merge only events
 // at the same point AND instant; a later new arc crossing remains a new event.
 for(const event of raw){const last=events[events.length-1];if(last&&Math.abs(last.time-event.time)<EPS&&Math.hypot(last.x-event.x,last.y-event.y)<EPS)last.pairs.push(...event.pairs);else events.push(event);}
 return {duration,circles,events};
}
