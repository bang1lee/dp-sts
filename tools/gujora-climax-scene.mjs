// Deterministic extension of the preserved spatial scene; no source vertices
// are cloned. All positions are generated once and remain static during film.
import {buildScene as buildSpatialScene} from './gujora-spatial-scene.mjs';
const BASE_COUNT=221073;
export function buildScene(image,seed=20261103){
  const base=buildSpatialScene(image,seed);
  if(base.count!==BASE_COUNT)throw Error(`Expected ${BASE_COUNT} original particles; got ${base.count}.`);
  const n=BASE_COUNT*2,positions=new Float32Array(n*3),drifts=new Float32Array(n*3),data=new Float32Array(n*4);
  positions.set(base.positions);drifts.set(base.drifts);data.set(base.data);
  let s=(seed^0x97f4a7c1)>>>0;
  const random=()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return (s+.5)/4294967296;};
  const gaussian=()=>Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
  // Break source-grid coherence by subpixel, deterministic spatial jitter.
  // Water stays a plane; people, brazier and fire keep their silhouettes.
  for(let i=0;i<BASE_COUNT;i++){
    const type=data[4*i];
    if(type===0||type===8||type===9){
      positions[3*i]+=.013*gaussian();
      if(type!==8)positions[3*i+1]+=.009*gaussian();
      positions[3*i+2]+=.015*gaussian();
      data[4*i+3]*=.77;
    }
  }
  // 75% in independent 3D Gaussian neighborhoods around selected surfaces;
  // 25% in a broad volume, extending the navigable field well beyond shore.
  // Every sample has its own position, footprint and opacity: no duplicates.
  for(let j=0;j<BASE_COUNT;j++){
    const i=BASE_COUNT+j,p=3*i,d=4*i;
    if(j%4){
      const k=Math.floor(random()*BASE_COUNT),sigma=.06+Math.pow(random(),2)*.65;
      positions[p]=base.positions[3*k]+gaussian()*sigma;
      positions[p+1]=base.positions[3*k+1]+gaussian()*sigma*.7;
      positions[p+2]=base.positions[3*k+2]+gaussian()*sigma*1.7;
    }else{
      positions[p]=gaussian()*5.8;positions[p+1]=1.3+gaussian()*2.9;positions[p+2]=1+gaussian()*8.0;
    }
    drifts[p]=random()*2-1;drifts[p+1]=random()*2-1;drifts[p+2]=random()*2-1;
    data[d]=10;data[d+1]=random()*Math.PI*2;data[d+2]=.8+Math.pow(random(),2)*4.2;data[d+3]=.20+random()*.52;
  }
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(let i=0;i<n;i++)for(let k=0;k<3;k++){const v=positions[3*i+k];bounds.min[k]=Math.min(bounds.min[k],v);bounds.max[k]=Math.max(bounds.max[k],v);}
  return {...base,positions,drifts,data,count:n,linePositions:new Float32Array(0),lineDrifts:new Float32Array(0),lineData:new Float32Array(0),lineCount:0,
    groups:{...base.groups,atmosphericFog:{start:BASE_COUNT,count:BASE_COUNT}},bounds,basePointCount:BASE_COUNT,addedFogPointCount:BASE_COUNT};
}
