import * as THREE from 'three';
import type { AudioFeature } from './recipe-film-audio';
import surfaceUrl from '../../../assets/line-bulb/surface.f32?url';
import contoursUrl from '../../../assets/line-bulb/contours.f32?url';
import volumeManifest from '../../../assets/line-bulb/manifest.json';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{const a=clamp(x);return a*a*(3-2*a);};
const NONE:AudioFeature={rms:0,low:0,high:0,onset:0};
const COUNT=1400, ECHO_DELAY=.22;
/** New chapter within the same film: one sampled physical object, one clock. */
export async function createExpansionDriftRenderer(canvas:HTMLCanvasElement){
 const responses=await Promise.all([fetch(surfaceUrl),fetch(contoursUrl)]);
 if(responses.some(r=>!r.ok))throw new Error('입체 프랙탈 데이터를 읽을 수 없습니다.');
 const [surfaceBuffer,contoursBuffer]=await Promise.all(responses.map(r=>r.arrayBuffer()));
 const surfaceData=new Float32Array(surfaceBuffer),renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(1);renderer.setSize(960,540,false);renderer.setClearColor(0x060605,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,960/540,.1,100),root=new THREE.Group();scene.add(root);
 // Seven successive circles share one line buffer, carrying the earlier seed motif.
 const ringData:number[]=[],segmentsPerCircle=128;
 for(let i=0;i<7;i++){const a=(i-1)*Math.PI/3,cx=i===0?0:.58*Math.cos(a),cy=i===0?0:.58*Math.sin(a);for(let j=0;j<segmentsPerCircle;j++){const t=j*2*Math.PI/segmentsPerCircle,u=(j+1)*2*Math.PI/segmentsPerCircle;ringData.push(cx+.58*Math.cos(t),cy+.58*Math.sin(t),0,cx+.58*Math.cos(u),cy+.58*Math.sin(u),0);}}
 const ringGeometry=new THREE.BufferGeometry();ringGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ringData,3));ringGeometry.setDrawRange(0,0);
 const ringMaterial=new THREE.LineBasicMaterial({color:0xf6eee2,transparent:true,opacity:0,depthWrite:false});const rings=new THREE.LineSegments(ringGeometry,ringMaterial);root.add(rings);
 const objectRoot=new THREE.Group();root.add(objectRoot);
 const surfaceGeometry=new THREE.BufferGeometry();surfaceGeometry.setAttribute('position',new THREE.BufferAttribute(surfaceData,3));
 const surfaceMaterial=new THREE.MeshBasicMaterial({color:0x161511,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:true,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2,forceSinglePass:true});
 const surface=new THREE.Mesh(surfaceGeometry,surfaceMaterial);objectRoot.add(surface);
 const contourGeometry=new THREE.BufferGeometry();contourGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(contoursBuffer),3));
 const contourMaterial=new THREE.LineBasicMaterial({color:0xf4eadc,transparent:true,opacity:0,depthWrite:false});const contours=new THREE.LineSegments(contourGeometry,contourMaterial);contours.renderOrder=2;objectRoot.add(contours);
 // Stable, spatially deduplicated samples from actual marching-cubes surface vertices.
 const sourceCount=surfaceData.length/3,bases:number[]=[],used=new Set<string>();let step=0;
 while(bases.length<COUNT*3&&step<sourceCount*2){const idx=(Math.imul(step,7919)>>>0)%sourceCount,x=surfaceData[idx*3],y=surfaceData[idx*3+1],z=surfaceData[idx*3+2],key=`${Math.round(x*35)},${Math.round(y*35)},${Math.round(z*35)}`;if(!used.has(key)){used.add(key);bases.push(x,y,z);}step++;}
 if(bases.length<COUNT*3)throw new Error('입자에 필요한 표면 표본이 부족합니다.');
 const actual=new Float32Array(COUNT*3),ghost=new Float32Array(COUNT*3);
 const pointGeometry=new THREE.BufferGeometry();pointGeometry.setAttribute('position',new THREE.BufferAttribute(actual,3).setUsage(THREE.DynamicDrawUsage));
 const ghostGeometry=new THREE.BufferGeometry();ghostGeometry.setAttribute('position',new THREE.BufferAttribute(ghost,3).setUsage(THREE.DynamicDrawUsage));
 // Shared small round sprite softens the particle edge without another pass.
 const spriteCanvas=document.createElement('canvas');spriteCanvas.width=32;spriteCanvas.height=32;const spriteContext=spriteCanvas.getContext('2d');if(!spriteContext)throw new Error('입자 텍스처를 만들 수 없습니다.');
 const gradient=spriteContext.createRadialGradient(16,16,0,16,16,16);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.48,'rgba(255,255,255,.9)');gradient.addColorStop(1,'rgba(255,255,255,0)');spriteContext.fillStyle=gradient;spriteContext.fillRect(0,0,32,32);const sprite=new THREE.CanvasTexture(spriteCanvas);
 const pointMaterial=new THREE.PointsMaterial({color:0xf2e9dc,map:sprite,size:2.3,sizeAttenuation:false,transparent:true,opacity:0,depthTest:false,depthWrite:false});
 const ghostMaterial=new THREE.PointsMaterial({color:0xbca894,map:sprite,size:2,sizeAttenuation:false,transparent:true,opacity:0,depthTest:false,depthWrite:false});
 const points=new THREE.Points(pointGeometry,pointMaterial),echo=new THREE.Points(ghostGeometry,ghostMaterial);points.renderOrder=3;echo.renderOrder=2;objectRoot.add(echo,points);
 // Twelve fixed near-neighbour candidates chosen once, with a visible centre gap.
 const pairs:Array<[number,number]>=[];
 for(let i=0;i<COUNT&&pairs.length<12;i+=73){let best=-1,dist=Infinity;for(let k=1;k<=160;k++){const j=(i+k*37)%COUNT,dx=bases[i*3]-bases[j*3],dy=bases[i*3+1]-bases[j*3+1],dz=bases[i*3+2]-bases[j*3+2],d=Math.hypot(dx,dy,dz);if(d>.18&&d<.36&&d<dist){best=j;dist=d;}}if(best>=0)pairs.push([i,best]);}
 const threadArray=new Float32Array(pairs.length*12),threadGeometry=new THREE.BufferGeometry();threadGeometry.setAttribute('position',new THREE.BufferAttribute(threadArray,3).setUsage(THREE.DynamicDrawUsage));
 const threadMaterial=new THREE.LineBasicMaterial({color:0xc7ad94,transparent:true,opacity:0,depthWrite:false});const threads=new THREE.LineSegments(threadGeometry,threadMaterial);threads.renderOrder=4;objectRoot.add(threads);
 function pointAt(target:Float32Array,t:number){const drift=smooth((t-21)/9);for(let i=0;i<COUNT;i++){const p=i*3,x=bases[p],y=bases[p+1],z=bases[p+2],phase=i*2.399963;target[p]=x+drift*(.08+.065*x+.048*Math.sin(t*.31+phase));target[p+1]=y+drift*(.035+.065*y+.048*Math.sin(t*.27+phase*1.31));target[p+2]=z+drift*(.065*z+.048*Math.cos(t*.25+phase*.77));}}
 function draw(time:number,feature:AudioFeature=NONE){const t=Math.max(0,Math.min(30,time)),pulse=clamp(.65*feature.rms+.2*feature.low+.15*feature.onset);
  const ringProgress=smooth((t-.5)/6.5);ringGeometry.setDrawRange(0,Math.floor(ringProgress*7*segmentsPerCircle)*2);ringMaterial.opacity=.86*(1-smooth((t-9)/7));rings.visible=ringMaterial.opacity>.001;
  const appear=smooth((t-6.5)/6),dissolve=smooth((t-15)/8),pointReveal=smooth((t-15)/6);
  objectRoot.scale.setScalar(.84*(.42+.58*appear)*(1+.007*pulse));objectRoot.rotation.y=.08+.10*Math.sin(t*.11);
  surface.visible=appear>.002&&dissolve<.999;surfaceMaterial.opacity=.84*appear*(1-dissolve);
  contourMaterial.opacity=(.86+.06*pulse)*appear*(1-dissolve);contours.visible=contourMaterial.opacity>.002;
  pointMaterial.opacity=(.75+.07*pulse)*pointReveal;ghostMaterial.opacity=.075*pointReveal;points.visible=echo.visible=pointReveal>.002;
  if(points.visible){pointAt(actual,t);pointAt(ghost,Math.max(0,t-ECHO_DELAY));(pointGeometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;(ghostGeometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;}
  const linkReveal=smooth((t-23)/4);threadMaterial.opacity=.34*linkReveal;threads.visible=linkReveal>.002;
  if(threads.visible){for(let i=0;i<pairs.length;i++){const [a,b]=pairs[i],out=i*12;for(let k=0;k<3;k++){const p=actual[a*3+k],q=actual[b*3+k];threadArray[out+k]=p;threadArray[out+3+k]=p+(q-p)*.38;threadArray[out+6+k]=p+(q-p)*.62;threadArray[out+9+k]=q;}}(threadGeometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;}
  camera.position.set(.34+.18*Math.sin(t*.07),.3+.08*Math.sin(t*.1),6.05);camera.lookAt(0,0,0);
  root.rotation.set(.24+.025*Math.sin(t*.11),-.23+.10*Math.sin(t*.08),.012*Math.sin(t*.09));renderer.render(scene,camera);
 }
 function setSize(w:number,h:number){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 function dispose(){[ringGeometry,surfaceGeometry,contourGeometry,pointGeometry,ghostGeometry,threadGeometry].forEach(x=>x.dispose());[ringMaterial,surfaceMaterial,contourMaterial,pointMaterial,ghostMaterial,threadMaterial].forEach(x=>x.dispose());sprite.dispose();renderer.dispose();}
 return {draw,setSize,dispose,stats:{chapter:'drift',duration:30,stages:{seed:[0,7],object:[7,15],particleTransition:[15,23],drift:[23,30]},power8Volume:volumeManifest,particles:COUNT,particleShape:'shared soft round sprite, 2.3 px',particleSource:'spatially deduplicated vertices of the same power-8 surface',echoDelaySeconds:ECHO_DELAY,connectionCandidates:pairs.length,connectionStyle:'two segments with a centre gap; no resolved network',maxDrawCalls:7}};
}
