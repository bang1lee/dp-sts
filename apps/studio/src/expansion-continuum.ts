import * as THREE from 'three';
import type { AudioFeature } from './recipe-film-audio';
import { CONTINUUM_DURATION, CONTINUUM_EVENTS, continuumStateAt } from './expansion-continuum-score';
import surfaceUrl from '../../../assets/line-bulb/surface.f32?url';
import normalsUrl from '../../../assets/line-bulb/continuum-normals.f32?url';
import contoursUrl from '../../../assets/line-bulb/contours.f32?url';
import volumeManifest from '../../../assets/line-bulb/manifest.json';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(a:number,b:number,t:number)=>{const u=clamp((t-a)/(b-a));return u*u*(3-2*u);};
const NONE:AudioFeature={rms:0,low:0,high:0,onset:0};
const POINTS=1600, TAU=2*Math.PI;
/** Shared event locations are x/y in normalized design space, mapped here to world units. */
export const continuumEventPosition=(x:number,y:number)=>({x:x*3,y:y*1.6});
export async function createContinuumRenderer(canvas:HTMLCanvasElement){
 const responses=await Promise.all([fetch(surfaceUrl),fetch(normalsUrl),fetch(contoursUrl)]);if(responses.some(r=>!r.ok))throw new Error('프랙탈 표면 데이터를 읽을 수 없습니다.');
 const [surfaceBuf,normalBuf,contourBuf]=await Promise.all(responses.map(r=>r.arrayBuffer())),surfaceData=new Float32Array(surfaceBuf);
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(1280,720,false);renderer.setClearColor(0x060605,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-40/9,40/9,2.5,-2.5,.1,100);camera.position.set(0,0,12);camera.lookAt(0,0,0);
 const root=new THREE.Group();scene.add(root);scene.add(new THREE.AmbientLight(0xfff4e6,.68));const light=new THREE.DirectionalLight(0xffe2bd,2.05);light.position.set(-2,4,7);scene.add(light);const rim=new THREE.DirectionalLight(0xd6dcee,.34);rim.position.set(4,-2,-4);scene.add(rim);
 // Authored contact marks: each moving line/arc reaches the score point at event.time.
 const eventPositions=new Float32Array(30000),eventColors=new Float32Array(30000),eventGeometry=new THREE.BufferGeometry();
 eventGeometry.setAttribute('position',new THREE.BufferAttribute(eventPositions,3).setUsage(THREE.DynamicDrawUsage));eventGeometry.setAttribute('color',new THREE.BufferAttribute(eventColors,3).setUsage(THREE.DynamicDrawUsage));
 const eventMaterial=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.86,depthTest:false,depthWrite:false});const eventLines=new THREE.LineSegments(eventGeometry,eventMaterial);root.add(eventLines);
 const markGeometry=new THREE.BufferGeometry(),markPos=new Float32Array(3);markGeometry.setAttribute('position',new THREE.BufferAttribute(markPos,3).setUsage(THREE.DynamicDrawUsage));const markMaterial=new THREE.PointsMaterial({color:0xe8a270,size:3.5,sizeAttenuation:false,transparent:true,opacity:0,depthTest:false,depthWrite:false});const mark=new THREE.Points(markGeometry,markMaterial);root.add(mark);
 // The nested circle field keeps the 1 -> 6 -> 36 parent-child construction.
 const ringData:number[]=[];const addCircle=(cx:number,cy:number,r:number)=>{for(let j=0;j<96;j++){const a=TAU*j/96,b=TAU*(j+1)/96;ringData.push(cx+r*Math.cos(a),cy+r*Math.sin(a),0,cx+r*Math.cos(b),cy+r*Math.sin(b),0);}};
 addCircle(0,0,.67);for(let i=0;i<6;i++){const a=i*Math.PI/3,x=.938*Math.cos(a),y=.938*Math.sin(a);addCircle(x,y,.268);for(let j=0;j<6;j++){const b=j*Math.PI/3;addCircle(x+.3752*Math.cos(b),y+.3752*Math.sin(b),.1072);}}
 const ringsGeometry=new THREE.BufferGeometry();ringsGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ringData,3));ringsGeometry.setDrawRange(0,0);const ringsMaterial=new THREE.LineBasicMaterial({color:0xf2e9df,transparent:true,opacity:0,depthTest:false,depthWrite:false});const rings=new THREE.LineSegments(ringsGeometry,ringsMaterial);rings.renderOrder=1;root.add(rings);
 // Original sampled power-8 surface with averaged normals; no real-time raymarch.
 const objectRoot=new THREE.Group();root.add(objectRoot);const bodyGeometry=new THREE.BufferGeometry();bodyGeometry.setAttribute('position',new THREE.BufferAttribute(surfaceData,3));bodyGeometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(normalBuf),3));
 const bodyMaterial=new THREE.MeshStandardMaterial({color:0x827566,roughness:.74,metalness:.08,transparent:true,opacity:0,depthWrite:true,side:THREE.DoubleSide,forceSinglePass:true,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2});const body=new THREE.Mesh(bodyGeometry,bodyMaterial);objectRoot.add(body);
 const contourGeometry=new THREE.BufferGeometry();contourGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(contourBuf),3));const contourMaterial=new THREE.LineBasicMaterial({color:0xf6ebde,transparent:true,opacity:0,depthWrite:false});const contours=new THREE.LineSegments(contourGeometry,contourMaterial);contours.renderOrder=2;objectRoot.add(contours);
 // Stable, spatially distinct samples of the same surface become the later cloud.
 const base:number[]=[],used=new Set<string>(),sourceCount=surfaceData.length/3;let step=0;
 while(base.length<POINTS*3&&step<sourceCount*2){const idx=(Math.imul(step,7919)>>>0)%sourceCount,x=surfaceData[idx*3],y=surfaceData[idx*3+1],z=surfaceData[idx*3+2],k=`${Math.round(x*35)},${Math.round(y*35)},${Math.round(z*35)}`;if(!used.has(k)){used.add(k);base.push(x,y,z);}step++;}if(base.length<POINTS*3)throw new Error('입자에 필요한 표면 표본이 부족합니다.');
 const pointArray=new Float32Array(POINTS*3),pointGeometry=new THREE.BufferGeometry();pointGeometry.setAttribute('position',new THREE.BufferAttribute(pointArray,3).setUsage(THREE.DynamicDrawUsage));
 const spriteCanvas=document.createElement('canvas');spriteCanvas.width=32;spriteCanvas.height=32;const context=spriteCanvas.getContext('2d');if(!context)throw new Error('입자 텍스처를 만들 수 없습니다.');const g=context.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.5,'rgba(255,255,255,.9)');g.addColorStop(1,'rgba(255,255,255,0)');context.fillStyle=g;context.fillRect(0,0,32,32);const sprite=new THREE.CanvasTexture(spriteCanvas);
 const pointMaterial=new THREE.PointsMaterial({color:0xf5eee3,map:sprite,size:2.4,sizeAttenuation:false,transparent:true,opacity:0,depthTest:false,depthWrite:false});const particles=new THREE.Points(pointGeometry,pointMaterial);particles.renderOrder=3;objectRoot.add(particles);
 // Fine waves are a visual metaphor; they are not a simulation of particle physics.
 const wavesN=6,waveSegments=120,waveArray=new Float32Array(wavesN*waveSegments*6),waveGeometry=new THREE.BufferGeometry();waveGeometry.setAttribute('position',new THREE.BufferAttribute(waveArray,3).setUsage(THREE.DynamicDrawUsage));const waveMaterial=new THREE.LineBasicMaterial({color:0xb8a397,transparent:true,opacity:0,depthTest:false,depthWrite:false});const waves=new THREE.LineSegments(waveGeometry,waveMaterial);root.add(waves);
 function pointAt(t:number){const angle=Math.max(0,t-118)*.008,c=Math.cos(angle),s=Math.sin(angle),drift=smooth(140,175,t);for(let i=0;i<POINTS;i++){const k=i*3,x=base[k],y=base[k+1],z=base[k+2],w=-x*s,scale=3/(3-w);pointArray[k]=x*c*scale+drift*.08*Math.sin(i*2.399+t*.05);pointArray[k+1]=y*scale+drift*.06*Math.sin(i*1.79+t*.06);pointArray[k+2]=z*scale+drift*.05*Math.cos(i*2.12+t*.04);}(pointGeometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;}
 function draw(time:number,feature:AudioFeature=NONE){const t=Math.max(0,Math.min(CONTINUUM_DURATION,time)),state=continuumStateAt(t),fade=state.dissolve,energy=clamp(.65*feature.rms+.25*feature.low+.1*feature.onset);
  let cursor=0;const segment=(x1:number,y1:number,x2:number,y2:number,intensity:number)=>{const col=intensity*fade;eventPositions.set([x1,y1,.05,x2,y2,.05],cursor);eventColors.set([col,col*.92,col*.84,col,col*.92,col*.84],cursor);cursor+=6;};
  // Keep each line contact readable until the following gesture arrives.
  if(t<5.8){const intro=smooth(0,.8,t)*(1-smooth(4.8,5.8,t));segment(-.85,0,-.85+1.7*smooth(.2,3.4,t),0,intro*.72);}
  let active:typeof CONTINUUM_EVENTS[number]|undefined;for(const e of CONTINUUM_EVENTS){const dt=t-e.time,end=e.kind==='line'?(e.id==='line-06'?35:29)-e.time:2.2;if(dt< -3.4||dt>end)continue;const p=continuumEventPosition(e.x,e.y),lineHistory=(.32+.68*(1-smooth(.5,4.8,dt)))*(1-(e.id==='line-06'?smooth(34,35,t):smooth(27.5,29,t))),alpha=smooth(-3.4,-2.5,dt)*(e.kind==='line'?lineHistory:1-smooth(.8,2.2,dt));if(dt>=0&&dt<.28)active=e;
   if(e.kind==='line'){segment(p.x-.65,p.y,p.x+.65,p.y,alpha);const tip=p.y-.65+.95*clamp((dt+1.3)/1.9);segment(p.x,p.y-.65,p.x,tip,alpha);}
   else{const r=.31,cy=p.y-Math.sqrt(3)*r/2,ax=p.x-r/2,bx=p.x+r/2,aProgress=clamp((dt+3)/1.5),bProgress=clamp(dt+1);const arc=(cx:number,progress:number,max:number)=>{const segs=Math.floor(progress*48);for(let j=0;j<segs;j++){const u=max*j/48,v=max*(j+1)/48;segment(cx+r*Math.cos(u),cy+r*Math.sin(u),cx+r*Math.cos(v),cy+r*Math.sin(v),alpha);}};arc(ax,aProgress,TAU);arc(bx,bProgress,2*Math.PI/3);}
  }
  eventGeometry.setDrawRange(0,cursor/3);(eventGeometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;(eventGeometry.attributes.color as THREE.BufferAttribute).needsUpdate=true;eventLines.visible=cursor>0&&fade>.001;
  if(active){const p=continuumEventPosition(active.x,active.y);markPos.set([p.x,p.y,.1]);(markGeometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;markMaterial.opacity=.7*fade*(1-(t-active.time)/.28);mark.visible=true;}else mark.visible=false;
  const ringReveal=smooth(35,73,t),ringFade=smooth(76,91,t);ringsGeometry.setDrawRange(0,Math.floor(ringReveal*(ringData.length/6))*2);ringsMaterial.opacity=.64*fade*(1-ringFade);rings.visible=ringsMaterial.opacity>.001;
  light.intensity=1.9+.4*energy;bodyMaterial.roughness=.76-.10*energy;
  const bodyIn=smooth(71,86,t),bodyOut=smooth(119,132,t);objectRoot.scale.setScalar(.95*(.72+.28*bodyIn)*(1+.006*energy));objectRoot.rotation.set(.20+.06*Math.sin(t*.045),-.24+.38*smooth(76,160,t),.025*Math.sin(t*.04));
  bodyMaterial.opacity=.96*fade*bodyIn*(1-bodyOut);body.visible=bodyMaterial.opacity>.001;contourMaterial.opacity=.8*(.92+.16*energy)*fade*bodyIn*(1-bodyOut);contours.visible=contourMaterial.opacity>.001;
  const pIn=smooth(119,132,t);pointMaterial.opacity=.85*fade*pIn;particles.visible=pointMaterial.opacity>.001;if(particles.visible)pointAt(t);
  waveMaterial.opacity=.13*fade*smooth(132,155,t)*(1+.15*energy);waves.visible=waveMaterial.opacity>.001;if(waves.visible){for(let row=0;row<wavesN;row++)for(let j=0;j<waveSegments;j++){const i=(row*waveSegments+j)*6,x=-3.1+6.2*j/waveSegments,xx=-3.1+6.2*(j+1)/waveSegments,baseline=(row-(wavesN-1)/2)*.51,amp=.09+.025*energy;waveArray.set([x,baseline+amp*Math.sin(x*2.1+t*.045+row*.6),-.9,xx,baseline+amp*Math.sin(xx*2.1+t*.045+row*.6),-.9],i);}(waveGeometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;}
  renderer.render(scene,camera);
 }
 function setSize(w:number,h:number){renderer.setSize(w,h,false);const aspect=w/h;camera.left=-2.5*aspect;camera.right=2.5*aspect;camera.updateProjectionMatrix();}
 function dispose(){[eventGeometry,markGeometry,ringsGeometry,bodyGeometry,contourGeometry,pointGeometry,waveGeometry].forEach(v=>v.dispose());[eventMaterial,markMaterial,ringsMaterial,bodyMaterial,contourMaterial,pointMaterial,waveMaterial].forEach(v=>v.dispose());sprite.dispose();renderer.dispose();}
 return {draw,setSize,dispose,stats:{duration:180,stages:{lines:[0,40],circles:[30,81],mandelbulb:[69,132],particles:[118,180]},crossingEvents:CONTINUUM_EVENTS,sharedEventCoordinates:'world x=3*x, y=1.6*y; moving arc/line meets at event time',recursiveCircles:[1,6,36],mandelbulb:volumeManifest,audioResponse:'smoothed PCM RMS/low gently modulates key-light intensity, surface roughness and contour opacity',surfaceNormals:'area-weighted average at shared marching-cubes vertices',surfaceParticles:POINTS,particleSource:'the same power-8 surface',projection:'4D rotation of (x,y,z,0) followed by perspective projection; visual metaphor, not a physics simulation',waveMetaphor:'abstract wave lines; not a Higgs or quantum simulation',maxDrawCalls:7,endingDissolveSeconds:[168,180]}};
}
