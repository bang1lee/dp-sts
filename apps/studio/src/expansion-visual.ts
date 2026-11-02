import * as THREE from 'three';
import { EXPANSION_BEAT_SECONDS } from './expansion-audio';
import type { AudioFeature as ExpansionFeature } from './recipe-film-audio';
import surfaceUrl from '../../../assets/line-bulb/surface.f32?url';
import contoursUrl from '../../../assets/line-bulb/contours.f32?url';
import volumeManifest from '../../../assets/line-bulb/manifest.json';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{const t=clamp(x);return t*t*(3-2*t);};
interface Circle { x:number;y:number;z:number;radius:number;start:number;tiltX:number;tiltY:number;level:number;parent:number|null }
const circles:Circle[]=[];
const beat=(t:number)=>Math.round(t/EXPANSION_BEAT_SECONDS)*EXPANSION_BEAT_SECONDS;
// Bounded branching rule: each parent has six children of radius 0.4R.
// Their x/y projected centres are R+0.4R from the parent at six 60° angles; z offsets add depth.
// Stop at depth two: 1 + 6 + 36 = 43 circles; equal line thickness is
// preserved with three shared torus geometries, one per radius.
circles.push({x:0,y:0,z:0,radius:1,start:beat(.55),tiltX:0,tiltY:0,level:0,parent:null});
for(let i=0;i<6;i++){
 const a=i*Math.PI/3,child:Circle={x:1.4*Math.cos(a),y:1.4*Math.sin(a),z:-.58+.10*Math.sin(a),radius:.4,start:beat(4+i*.85),tiltX:.19*Math.sin(a),tiltY:.19*Math.cos(a),level:1,parent:0};
 const childIndex=circles.length;circles.push(child);
 for(let j=0;j<6;j++){
  const b=j*Math.PI/3,grand:Circle={x:child.x+.56*Math.cos(b),y:child.y+.56*Math.sin(b),z:-1.13+.12*Math.cos(a+b),radius:.16,start:beat(13+i*1.85+j*.55),tiltX:.21*Math.sin(b+a*.3),tiltY:.21*Math.cos(b+a*.3),level:2,parent:childIndex};circles.push(grand);
 }
}
const NONE:ExpansionFeature={rms:0,low:0,high:0,onset:0};
/** 43 bounded recursive torus instances and one 0.22 s delayed copy. */
export async function createExpansionRenderer(canvas:HTMLCanvasElement){
 const responses=await Promise.all([fetch(surfaceUrl),fetch(contoursUrl)]);
 if(responses.some(response=>!response.ok))throw new Error('입체 프랙탈 데이터를 읽을 수 없습니다.');
 const [surfaceBuffer,contoursBuffer]=await Promise.all(responses.map(response=>response.arrayBuffer()));
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(960,540,false);renderer.setClearColor(0x060605,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,960/540,.1,100),root=new THREE.Group();scene.add(root);
 scene.add(new THREE.AmbientLight(0xfff5e8,.7));const light=new THREE.DirectionalLight(0xfff5e7,2.1);light.position.set(3,5,8);scene.add(light);
 const mainMaterial=new THREE.MeshLambertMaterial({color:0xeee7db}),echoMaterial=new THREE.MeshLambertMaterial({color:0xb6a795,transparent:true,opacity:.09,depthWrite:false});
 const levels=[0,1,2].map(level=>{const members=circles.filter(c=>c.level===level);const geometry=new THREE.TorusGeometry(members[0].radius,.01,6,96);
  const main=new THREE.InstancedMesh(geometry,mainMaterial,members.length),echo=new THREE.InstancedMesh(geometry,echoMaterial,members.length);main.instanceMatrix.setUsage(THREE.DynamicDrawUsage);echo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);main.frustumCulled=false;echo.frustumCulled=false;root.add(echo,main);return {members,geometry,main,echo};});
 // The original power-8 isosurface and its surface-section lines live inside
 // the centre ring, sharing the artwork's camera, transform and audio clock.
 const volumeRoot=new THREE.Group();volumeRoot.position.z=.08;volumeRoot.scale.setScalar(.68);root.add(volumeRoot);
 const volumeGeometry=new THREE.BufferGeometry();volumeGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(surfaceBuffer),3));
 const volumeMaterial=new THREE.MeshBasicMaterial({color:0x151411,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:true,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2,forceSinglePass:true});
 const volumeMesh=new THREE.Mesh(volumeGeometry,volumeMaterial);volumeMesh.visible=false;volumeRoot.add(volumeMesh);
 const contourGeometry=new THREE.BufferGeometry();contourGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(contoursBuffer),3));
 const contourMaterial=new THREE.LineBasicMaterial({color:0xece4d8,transparent:true,opacity:0,depthTest:true,depthWrite:false});
 const contourLines=new THREE.LineSegments(contourGeometry,contourMaterial);contourLines.visible=false;contourLines.renderOrder=2;volumeRoot.add(contourLines);
 const object=new THREE.Object3D();
 function update(mesh:THREE.InstancedMesh,members:Circle[],t:number,pulse:number,ghost:boolean){for(let i=0;i<members.length;i++){
  const c=members[i],growth=smooth((t-c.start)/1.25),breath=1+.008*pulse;
  object.position.set(c.x,c.y,c.z+(ghost?-.06:0));object.rotation.set(c.tiltX,c.tiltY,0);object.scale.setScalar(Math.max(.00001,growth*breath*(ghost?1.008:1)));object.updateMatrix();mesh.setMatrixAt(i,object.matrix);
 }mesh.instanceMatrix.needsUpdate=true;}
 function draw(time:number,feature:ExpansionFeature=NONE){const t=Math.max(0,Math.min(30,time)),phase=(t/EXPANSION_BEAT_SECONDS)%1,clockPulse=Math.exp(-phase*10),pulse=clamp(.55*feature.rms+.25*feature.onset+.2*clockPulse);
  for(const layer of levels){update(layer.main,layer.members,t,pulse,false);update(layer.echo,layer.members,t-.22,pulse,true);}
  const emergence=smooth((t-20)/4.4);volumeMesh.visible=contourLines.visible=emergence>.003;volumeMaterial.opacity=.76*emergence;contourMaterial.opacity=(.68+.08*pulse)*emergence;volumeRoot.rotation.y=.08+.05*Math.sin(t*.15);
  const pull=smooth((t-2)/8);camera.position.set(.22+.22*pull,.18+.18*pull,4.9+3.3*pull);camera.lookAt(0,0,-.35);
  root.rotation.set(.39+.025*Math.sin(t*.18),-.28+.055*Math.sin(t*.13),.012*Math.sin(t*.11));
  const brightness=.83+.12*pulse;mainMaterial.color.setRGB(brightness,brightness*.96,brightness*.91,THREE.SRGBColorSpace);
  renderer.render(scene,camera);
 }
 function setSize(w:number,h:number){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 function dispose(){levels.forEach(layer=>layer.geometry.dispose());volumeGeometry.dispose();contourGeometry.dispose();volumeMaterial.dispose();contourMaterial.dispose();mainMaterial.dispose();echoMaterial.dispose();renderer.dispose();}
 const torusVertices=levels[0].geometry.attributes.position.count,torusTriangles=(levels[0].geometry.index?.count??0)/3;
 return {draw,setSize,dispose,stats:{circleInstances:circles.length,levels:[1,6,36],recursion:{maxDepth:2,childrenPerParent:6,radiusRatio:.4,childCentreOffsetXY:'parent radius + child radius; z is offset independently',angleDegrees:[0,60,120,180,240,300]},torusRadialSegments:6,torusTubularSegments:96,torusTubeRadius:.01,torusVertices,torusTriangles,visibleInstancesMax:circles.length*2,drawnVerticesMax:torusVertices*circles.length*2,beatAlignedStarts:circles.map(c=>({level:c.level,parent:c.parent,time:c.start})),echoDelaySeconds:.22,maxDrawCalls:8,integratedVolume:{...volumeManifest,emergenceSeconds:[20,24.4],scale:.68,description:'power-8 volume and contours within the central circle; additive evolution, not a literal morph'},geometry:'three radius-specific shared torus geometries, perspective camera, one bounded delayed instance layer; ambient and directional light, no shadows'}};
}
