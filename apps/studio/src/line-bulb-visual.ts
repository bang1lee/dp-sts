import * as THREE from 'three';
import surfaceUrl from '../../../assets/line-bulb/surface.f32?url';
import contoursUrl from '../../../assets/line-bulb/contours.f32?url';
import geometryManifest from '../../../assets/line-bulb/manifest.json';

export const accents=[
 {time:.75,x:-.6005,y:-.6867,z:.4057},
 {time:1.8,x:.6005,y:-.3433,z:.5928},
 {time:2.9,x:-.6005,y:.2289,z:.4775},
 {time:4.05,x:.3702,y:.6867,z:.4816},
];
export async function createLineBulbRenderer(canvas:HTMLCanvasElement){
 const responses=await Promise.all([fetch(surfaceUrl),fetch(contoursUrl)]);if(responses.some(r=>!r.ok))throw new Error('만델벌브 지오메트리를 읽을 수 없습니다.');
 const [surface,contours]=await Promise.all(responses.map(r=>r.arrayBuffer()));
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(960,540,false);renderer.setClearColor(0x050505,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,960/540,.1,40);camera.position.set(2.55,1.25,5.9);camera.lookAt(0,0,0);
 const root=new THREE.Group();scene.add(root);
 const surfaceGeometry=new THREE.BufferGeometry();surfaceGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(surface),3));
 const surfaceMaterial=new THREE.MeshBasicMaterial({color:0x10100e,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2});const mesh=new THREE.Mesh(surfaceGeometry,surfaceMaterial);root.add(mesh);
 const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(contours),3));
 const lineMaterial=new THREE.LineBasicMaterial({color:0xf6eee0,transparent:true,opacity:.88,depthTest:true,depthWrite:false});const lines=new THREE.LineSegments(lineGeometry,lineMaterial);lines.renderOrder=1;root.add(lines);
 const markGeometry=new THREE.BufferGeometry(),markArray=new Float32Array(3);markGeometry.setAttribute('position',new THREE.BufferAttribute(markArray,3).setUsage(THREE.DynamicDrawUsage));const markMaterial=new THREE.PointsMaterial({color:0xe49a5d,size:4,sizeAttenuation:false,transparent:true,depthTest:false,depthWrite:false});const mark=new THREE.Points(markGeometry,markMaterial);mark.renderOrder=2;root.add(mark);
 function draw(time:number){const t=Math.max(0,Math.min(5,time));root.rotation.y=-.1+.2*t/5;root.rotation.x=.035*Math.sin(Math.PI*t/5);
  let e:typeof accents[number]|undefined;for(const a of accents)if(t>=a.time&&t<a.time+.22)e=a;
  if(e){markArray.set([e.x,e.y,e.z]);(markGeometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;markMaterial.opacity=.8*(1-(t-e.time)/.22);mark.visible=true;}else mark.visible=false;
  renderer.render(scene,camera);
 }
 function setSize(w:number,h:number){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 function dispose(){surfaceGeometry.dispose();surfaceMaterial.dispose();lineGeometry.dispose();lineMaterial.dispose();markGeometry.dispose();markMaterial.dispose();renderer.dispose();}
 return {draw,setSize,dispose,stats:{...geometryManifest,maxDrawCalls:3,uniqueGeometryBuffers:2},geometryManifest};
}
