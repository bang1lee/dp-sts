// Seeded 3D scene construction. Categories are interpreted by the renderer's
// vertex shader; no raster image is sampled and no geography is measured.
export const CATEGORY=Object.freeze({ISLAND:0,BEACH:1,PERSON:2,BRAZIER:3,FIRE:4,SMOKE:5,SKY:6,WOOD:7,WATER:8});
export const PEOPLE=Object.freeze([
  {id:'man_1',group:'fire',x:-.19,z:1.33,height:.48,lean:.10},
  {id:'man_2',group:'fire',x:.08,z:.94,height:.48,lean:.04},
  {id:'man_3',group:'fire',x:.68,z:1.21,height:.48,lean:-.10},
  {id:'couple_man',group:'couple',x:1.40,z:1.14,height:.48,lean:.11},
  {id:'couple_woman',group:'couple',x:1.64,z:1.16,height:.45,lean:-.10},
  {id:'mother',group:'family',x:-1.48,z:1.12,height:.45,lean:.15},
  {id:'child',group:'family',x:-1.23,z:1.13,height:.31,lean:-.08},
]);
export const DESIGN=Object.freeze({islandBaseY:.20,shorelineTopY:-.80,beachY:-1.56,
  fireX:.34,fireZ:1.13,adultHeight:.48,brazierHeight:.12});
function rng(seed){let s=seed>>>0;return()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const q=clamp((x-a)/(b-a),0,1);return q*q*(3-2*q);};
function ridge(x){
  const rise=smooth(-2.95,-1.43,x);
  const descend=1-smooth(-1.33,3.05,x);
  const rugged=1+.055*Math.sin(x*4.8)+.025*Math.sin(x*12.1)+.009*Math.sin(x*29.7);
  return 1.53*rise*descend*rugged;
}
export function buildScene(image,seed=20261103){
  if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<2||image.height<2||image.pixels.length!==image.width*image.height)
    throw Error('Expected decoded cover luminance pixels.');
  const random=rng(seed),positions=[],drifts=[],data=[],linePositions=[],lineDrifts=[],lineData=[],groups={};
  const rand=(a,b)=>a+(b-a)*random();
  const add=(x,y,z,type,bright=1,size=1,phase=random()*6.283)=>{
    positions.push(x,y,z);drifts.push(rand(-1,1),rand(-1,1),rand(-1,1));data.push(type,phase,size,bright);
  };
  const line=(a,b,type,brightness=.30)=>{
    // Matching drift/phase at both ends preserves short, coherent filaments.
    const d=[rand(-1,1),rand(-1,1),rand(-1,1)],v=[type,random()*6.283,1,brightness];
    linePositions.push(...a,...b);lineDrifts.push(...d,...d);lineData.push(...v,...v);
  };
  const group=(name,fn)=>{const begin=positions.length/3;fn();groups[name]={start:begin,count:positions.length/3-begin};};
  const sampleSegment=(a,b,radius,type,count,bright=.8)=>{
    for(let i=0;i<count;i++){
      const u=random(),ang=rand(0,Math.PI*2),r=radius*Math.sqrt(random());
      add(a[0]+(b[0]-a[0])*u+Math.cos(ang)*r,a[1]+(b[1]-a[1])*u,
        a[2]+(b[2]-a[2])*u+Math.sin(ang)*r,type,bright*rand(.65,1),rand(.75,1.3));
    }
  };
  const ellipsoid=(cx,cy,cz,rx,ry,rz,type,count,brightness)=>{
    for(let i=0;i<count;i++){
      const a=rand(0,2*Math.PI),v=rand(-1,1),r=Math.cbrt(random()),h=Math.sqrt(1-v*v);
      add(cx+rx*r*h*Math.cos(a),cy+ry*r*v,cz+rz*r*h*Math.sin(a),type,brightness*rand(.7,1),rand(.75,1.3));
    }
  };
  // Each visible source pixel becomes a depth-bearing point. At t=0 the
  // inverse perspective places every point back at its original image pixel.
  const mapped=(ix,iy)=>{
    const u=(ix+.5)/image.width,v=(iy+.5)/image.height;
    const z=v<.445?-1.0+.10*Math.sin(u*4.0):-.72+2.1*smooth(.445,.76,v);
    const depth=11-z,focal=2.747477;
    return [(2*u-1)*depth/focal,(1-2*v)*depth/focal-.40,z];
  };
  const threshold=80;
  const sourceChains=(island)=>{
    for(let iy=0;iy<image.height;iy++){
      const v=(iy+.5)/image.height;if((v<.445)!==island)continue;
      for(let ix=0;ix<image.width;ix++){
        const lum=image.pixels[iy*image.width+ix];if(lum<threshold)continue;
        const p=mapped(ix,iy),type=island?CATEGORY.ISLAND:CATEGORY.WATER;
        // Region-derived time slice is shared by adjacent source pixels.
        const slice=2*(Math.floor(iy/5)%3);
        add(...p,type,.55+.45*(lum-threshold)/(255-threshold),rand(.50,.85),island?0:slice);
        if(ix+1<image.width&&image.pixels[iy*image.width+ix+1]>=threshold&&random()<.025)
          line(p,mapped(ix+1,iy),type,.055);
      }
    }
  };
  group('island',()=>sourceChains(true));
  group('water',()=>sourceChains(false));
  group('people',()=>{
    for(let n=0;n<PEOPLE.length;n++){
      const person=PEOPLE[n],x=person.x,z=person.z,y=DESIGN.beachY,h=person.height;
      const type=CATEGORY.PERSON,b=.55,lean=person.lean*h;
      const torsoX=x+lean,torsoY=y+h*.37,headX=x+lean*1.35,headY=y+h*.65;
      ellipsoid(headX,headY,z,h*.075,h*.078,h*.064,type,65,b);
      ellipsoid(torsoX,torsoY,z,h*(n===4||n===5?.13:.115),h*.145,h*.072,type,150,b*.85);
      ellipsoid(x,y+h*.19,z,h*.125,h*.075,h*.075,type,90,b*.75);
      // Bent thighs, folded legs and curved arms form different sitting poses.
      const turn=(person.group==='fire'?Math.sign(DESIGN.fireX-x):person.group==='family'?1:-1);
      const kneeX=x+turn*h*(.15+.025*(n%3));
      sampleSegment([x,y+h*.19,z],[kneeX,y+h*.12,z+.02],h*.045,type,55,b*.7);
      sampleSegment([kneeX,y+h*.12,z+.02],[kneeX+turn*h*.10,y+h*.025,z+.03],h*.030,type,45,b*.65);
      sampleSegment([torsoX-turn*h*.06,y+h*.49,z],[torsoX+turn*h*.10,y+h*.30,z+.015],h*.029,type,45,b*.7);
      sampleSegment([torsoX+turn*h*.10,y+h*.30,z+.015],[torsoX+turn*h*.18,y+h*.22,z+.025],h*.025,type,35,b*.7);
      line([torsoX-h*.07,y+h*.46,z],[torsoX+h*.06,y+h*.46,z],type,.045);
    }
  });
  group('brazier',()=>{
    const x=DESIGN.fireX,z=DESIGN.fireZ,y=DESIGN.beachY,r=.065,h=DESIGN.brazierHeight;
    for(let i=0;i<320;i++){
      const a=rand(0,2*Math.PI),u=random();
      add(x+Math.cos(a)*r,y+u*h,z+Math.sin(a)*r,CATEGORY.BRAZIER,rand(.16,.42),rand(.45,.85));
    }
    for(let j=0;j<24;j++){
      const a=j*Math.PI*2/24,b=(j+1)*Math.PI*2/24;
      line([x+Math.cos(a)*r,y+h,z+Math.sin(a)*r],[x+Math.cos(b)*r,y+h,z+Math.sin(b)*r],CATEGORY.BRAZIER,.22);
    }
  });
  group('fire',()=>{
    for(let i=0;i<600;i++){
      const u=random(),radius=(.046*(1-u)+.005)*Math.sqrt(random()),a=rand(0,2*Math.PI);
      add(DESIGN.fireX+radius*Math.cos(a)+.012*Math.sin(u*7),DESIGN.beachY+DESIGN.brazierHeight+u*.22,
        DESIGN.fireZ+radius*Math.sin(a),CATEGORY.FIRE,rand(.22,.75),rand(.45,1.05),u*6.283);
    }
  });
  group('smoke',()=>{
    // a_position.y holds path phase, a_position.x/z the seed's local cross-section.
    for(let i=0;i<15000;i++)add(rand(-1,1),random(),rand(-1,1),CATEGORY.SMOKE,rand(.16,.65),rand(.5,1.45));
  });
  group('sky',()=>{
    for(let i=0;i<12500;i++){
      const x=rand(-3.8,3.8),y=rand(1.15,4.1),z=rand(-1.7,-.3);
      const bright=i<1300,glow=bright?rand(.68,1.20):rand(.10,.35);
      add(x,y,z,CATEGORY.SKY,glow,bright?rand(.9,1.6):rand(.4,.85));
    }
  });
  group('wood',()=>{
    // Irregular, partly buried driftwood clusters on dry landward sand.
    const branches=[[-2.48,2.00,.33,-1.90,.05],[1.04,2.12,.24,-2.03,-.09],[2.50,2.08,.38,-1.88,.11]];
    for(let j=0;j<branches.length;j++){
      const [x,z,len,y,slope]=branches[j];
      for(let k=0;k<3+j%2;k++){
        const start=rand(.10,.65),span=rand(.10,.34),side=k%2?1:-1;
        for(let i=0;i<95;i++){
          const u=random(),q=start+span*u;
          const px=x+len*(q-.5)+side*.018*u+rand(-.006,.006);
          const py=y+slope*(q-.5)+.025*Math.sin(q*5.+j)+side*.023*u+rand(-.006,.006);
          add(px,py,z+.03*q+rand(-.018,.018),CATEGORY.WOOD,rand(.08,.26),rand(.38,.68));
        }
      }
    }
  });
  // Transform source rays into an actual spatial composition. The initial
  // camera projects each source-derived island/water point to the same pixel.
  // Water is a horizontal y=0 plane. Island chains are layered along rays in
  // front of that plane with smoothly varying depth, revealing substantial
  // thickness as the camera moves sideways.
  const eye=[0,5.5,14],focal=2.747477,inv=Math.hypot(5.5,14);
  const forward=[0,-5.5/inv,-14/inv],up=[0,14/inv,-5.5/inv];
  const oldUV=p=>{const depth=11-p[2];return [(p[0]*focal/depth+1)/2,(1-(p[1]+.40)*focal/depth)/2];};
  const ray=(u,v)=>[ (2*u-1)/focal,forward[1]+up[1]*(1-2*v)/focal,forward[2]+up[2]*(1-2*v)/focal ];
  const atZ=(d,z)=>{const t=(z-eye[2])/d[2];return [eye[0]+t*d[0],eye[1]+t*d[1],z];};
  const onWater=d=>{const t=-eye[1]/d[1];return [eye[0]+t*d[0],0,eye[2]+t*d[2]];};
  const projectedDepth=p=>(p[0]-eye[0])*forward[0]+(p[1]-eye[1])*forward[1]+(p[2]-eye[2])*forward[2];
  const anchorCache=new Map();
  const anchorFor=(x,z)=>{
    const key=`${x},${z}`;if(anchorCache.has(key))return anchorCache.get(key);
    const uv=oldUV([x,DESIGN.beachY,z]),ground=onWater(ray(...uv));
    const scale=projectedDepth(ground)/(11-z);const a={ground,scale};anchorCache.set(key,a);return a;
  };
  const fireAnchor=anchorFor(DESIGN.fireX,DESIGN.fireZ);
  function transform(p,type){
    const [u,v]=oldUV(p),d=ray(u,v);
    if(type===CATEGORY.ISLAND){
      const sea=onWater(d),depth=-1.0+1.1*Math.sin(u*4.1+v*3.2)+.12*Math.sin(u*12.+v*7.);
      return atZ(d,Math.max(sea[2]+.025,depth));
    }
    if(type===CATEGORY.WATER)return onWater(d);
    if(type===CATEGORY.SMOKE){
      const a=fireAnchor.ground,w=p[1],spread=.06+.75*w*w;
      return [a[0]+p[0]*spread+w*.40+Math.sin(w*6.)*w*.5,
        .15+w*5.0,a[2]+p[2]*(.08+w*2.3)+w*.55];
    }
    if(type===CATEGORY.SKY){
      const depth=-5.0-3.5*(.5+.5*Math.sin(p[0]*4.1+p[1]*2.7+p[2]));
      return atZ(d,depth);
    }
    if(type===CATEGORY.WOOD){
      const q=onWater(d);return [q[0],.015,q[2]];
    }
    if(type===CATEGORY.PERSON||type===CATEGORY.BRAZIER||type===CATEGORY.FIRE){
      const person=type===CATEGORY.PERSON?PEOPLE.reduce((best,q)=>Math.abs(q.x-p[0])<Math.abs(best.x-p[0])?q:best,PEOPLE[0]):null;
      const x=person?person.x:DESIGN.fireX,z=person?person.z:DESIGN.fireZ;
      const {ground,scale}=anchorFor(x,z);
      return [ground[0]+(p[0]-x)*scale,ground[1]+(p[1]-DESIGN.beachY)*scale/(14/inv),ground[2]+(p[2]-z)*scale];
    }
    return onWater(d);
  }
  for(let i=0;i<positions.length/3;i++){
    const j=i*3,p=transform([positions[j],positions[j+1],positions[j+2]],data[i*4]);
    positions[j]=p[0];positions[j+1]=p[1];positions[j+2]=p[2];
  }
  for(let i=0;i<linePositions.length/3;i++){
    const j=i*3,p=transform([linePositions[j],linePositions[j+1],linePositions[j+2]],lineData[i*4]);
    linePositions[j]=p[0];linePositions[j+1]=p[1];linePositions[j+2]=p[2];
  }
  // Sparse interior material occupies additional depths along the same rays.
  // Its initial projected location matches the source stroke, while the
  // moving camera reveals layers behind and in front of the outer surface.
  const volumeStart=positions.length/3;
  for(let iy=0;iy<image.height;iy++){
    const v=(iy+.5)/image.height;if(v>=.445)continue;
    for(let ix=0;ix<image.width;ix++){
      const lum=image.pixels[iy*image.width+ix];
      if(lum<80||random()>.12)continue;
      const u=(ix+.5)/image.width,d=ray(u,v),sea=onWater(d);
      const z=Math.max(sea[2]+.025,-3.7+7.8*random());
      const p=atZ(d,z);
      add(...p,CATEGORY.ISLAND,rand(.06,.17),rand(.40,.72));
    }
  }
  groups.islandVolume={start:volumeStart,count:positions.length/3-volumeStart};
  // Independent rounded terrain gives the island a back slope and depth;
  // it is held dim from the reference view and revealed by angle-based light.
  const bodyStart=positions.length/3;
  for(let layer=0;layer<32;layer++){
    const z=-3.2+layer*5.5/31;
    const breadth=Math.sqrt(Math.max(0,1-Math.pow((z+.45)/3.3,2)));
    for(let band=0;band<26;band++){
      const height=(band+.5)/26;
      for(let i=0;i<150;i++){
        const x=-2.9+5.8*(i+random()*.4)/150;
        const y=ridge(x)*1.75*breadth*height;
        if(y<.06||random()>.54)continue;
        const rough=.020*Math.sin(x*7.5+z*2.1+band*.4)+.008*Math.sin(x*17.+band);
        add(x,y+rough,z+.035*Math.sin(x*3.+band*.2),9,rand(.28,.62),rand(.5,.9));
      }
    }
  }
  groups.islandBody={start:bodyStart,count:positions.length/3-bodyStart};
  // Sparse suspended foreground filaments provide a close pass without
  // moving the coastline or placing driftwood in the water.
  const foregroundStart=positions.length/3;
  for(let c=0;c<6;c++)for(let i=0;i<320;i++){
    const u=i/319,x=-3.8+u*3.1+.08*Math.sin(u*7+c),
      y=1.35+c*.25+.16*Math.sin(u*3.1+c*.6),z=9.0+c*.34+.15*Math.cos(u*5+c);
    add(x,y,z,CATEGORY.SMOKE,rand(.05,.16),rand(.4,.8));
  }
  groups.foregroundFilaments={start:foregroundStart,count:positions.length/3-foregroundStart};
  // A few sparse organic paths link the foreground and the smoke volume.
  // These are spatial curves rather than a network connecting every star.
  const connectorStart=positions.length/3;
  for(let c=0;c<9;c++){
    const base=fireAnchor.ground,side=(c%2?1:-1),depthOffset=(c-4)*.12;
    for(let i=0;i<420;i++){
      const u=(i+random()*.35)/420;
      const p=[base[0]+side*(.10+.42*u)*Math.sin(u*5.1+c*.7),
        .10+u*4.2+.08*Math.sin(u*8.+c),
        base[2]+depthOffset+u*.55+.28*u*Math.cos(u*4.3+c)];
      add(...p,CATEGORY.SMOKE,rand(.12,.35),rand(.40,.85));
      if(i>0&&i%26===0){
        const before=[p[0]-.025*side,p[1]-.025,p[2]-.018];
        line(before,p,CATEGORY.SMOKE,.06);
      }
    }
  }
  groups.connections={start:connectorStart,count:positions.length/3-connectorStart};
  return {positions:new Float32Array(positions),drifts:new Float32Array(drifts),data:new Float32Array(data),
    linePositions:new Float32Array(linePositions),lineDrifts:new Float32Array(lineDrifts),lineData:new Float32Array(lineData),
    count:positions.length/3,lineCount:linePositions.length/3,groups,people:PEOPLE,design:DESIGN,seed,staticParticlePositions:true,initialCamera:{eye,target:[0,0,0],fovDegrees:40},waterPlaneY:0};
}
