// New deterministic surroundings are sampled in 3D around the preserved climax scene.
import {buildScene as buildClimaxScene} from './gujora-climax-scene.mjs';
const EXISTING=442146, EXTRA=442146, SAND=250000, WATER=150000, HAZE=42146;
export function buildScene(image,seed=20261103){
  const base=buildClimaxScene(image,seed);
  if(base.count!==EXISTING||SAND+WATER+HAZE!==EXTRA)throw Error('Continuum particle count invariant failed.');
  const n=EXISTING+EXTRA,positions=new Float32Array(n*3),drifts=new Float32Array(n*3),data=new Float32Array(n*4);
  positions.set(base.positions);drifts.set(base.drifts);data.set(base.data);
  let state=(seed^0xb5297a4d)>>>0;
  const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return (state+.5)/4294967296;};
  const gaussian=()=>Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const smooth=(a,b,x)=>{let t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  // Former image-derived water becomes a feathered foreshore in the beach
  // zone; keep its point count and plane and never move people or driftwood.
  const water=base.groups.water;
  for(let i=water.start;i<water.start+water.count;i++){
    const x=positions[i*3],z=positions[i*3+2];
    const shore=1-.86*smooth(2.1,3.5,z);
    const edge=1-.86*smooth(3.2,5.0,Math.abs(x));
    data[i*4+3]*=shore*edge;
  }
  const add=(index,x,y,z,type,size,lum)=>{
    const p=3*index,d=4*index;
    positions[p]=x;positions[p+1]=y;positions[p+2]=z;
    drifts[p]=random()*2-1;drifts[p+1]=random()*2-1;drifts[p+2]=random()*2-1;
    data[d]=type;data[d+1]=random()*Math.PI*2;data[d+2]=size;data[d+3]=lum;
  };
  // A tapered, irregular beach rather than a rectangular raster. Dunes rise
  // only landward of the people/wood; jitter produces fine, uneven grains.
  for(let j=0;j<SAND;j++){
    const z=2.05+Math.abs(gaussian())*4.5;
    const width=4.1+Math.max(0,z-3)*.62;
    const x=gaussian()*width*.69;
    const land=smooth(4.2,8.5,z);
    const shoreZ=2.72+.17*Math.sin(x*.70)+.07*Math.sin(x*1.9);
    const wet=z<shoreZ+.30;
    const dunes=land*(.07+.15*Math.pow(.5+.5*Math.sin(x*.46+z*.33),2));
    const phase=z*4.4+x*.36+.42*Math.sin(x*.72)+.16*Math.sin(z*.8);
    const ripple=land*.020*Math.sin(phase);
    const y=.006+dunes+ripple+gaussian()*.006;
    const fade=Math.exp(-Math.pow(x/(width*2.3),2))*(.66+.34*smooth(2.05,3.1,z));
    const grain=.55+.45*Math.pow(.5+.5*Math.sin(phase),2);
    const lum=(.60+random()*.66)*fade*(wet?.78:grain);
    add(EXISTING+j,x,y,z,wet?14:11,.45+random()*.70,lum);
  }
  // Stochastic offshore sheet broadens the sea, with gradual radial falloff.
  for(let j=0;j<WATER;j++){
    const z=1.25+gaussian()*5.4,x=gaussian()*7.8;
    const shore=1-smooth(2.0,3.15,z),fade=Math.exp(-((x*x)/(17*17)+((z-.5)*(z-.5))/(13*13)));
    const y=-.006+gaussian()*.004;
    add(EXISTING+SAND+j,x,y,z,12,.34+random()*.60,(.36+random()*.58)*fade*shore);
  }
  for(let j=0;j<HAZE;j++){
    const x=gaussian()*8,y=.5+Math.abs(gaussian())*3.8,z=gaussian()*9;
    const fade=Math.exp(-(x*x/400+z*z/500));
    add(EXISTING+SAND+WATER+j,x,y,z,13,.65+random()*2.5,(.12+random()*.34)*fade);
  }
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(let i=0;i<n;i++)for(let k=0;k<3;k++){const v=positions[3*i+k];bounds.min[k]=Math.min(bounds.min[k],v);bounds.max[k]=Math.max(bounds.max[k],v);}
  return {...base,positions,drifts,data,count:n,bounds,basePointCount:EXISTING,addedContinuumPointCount:EXTRA,
    groups:{...base.groups,beachSand:{start:EXISTING,count:SAND},offshoreWater:{start:EXISTING+SAND,count:WATER},ambientHaze:{start:EXISTING+SAND+WATER,count:HAZE}}};
}
