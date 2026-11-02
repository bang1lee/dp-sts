import * as THREE from 'three';
import { type FlowerTimeline } from './flower-geometry';

/** Four bounded time-offset views share one immutable position buffer; no feedback target. */
export function createFlowerRenderer(canvas:HTMLCanvasElement,timeline:FlowerTimeline) {
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
 renderer.setPixelRatio(1);renderer.setSize(960,540,false);renderer.setClearColor(0x080807,1);
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-5.5,5.5,3.09375,-3.09375,.1,20);camera.position.z=10;
 const root=new THREE.Group();scene.add(root);
 const data:number[]=[],segments:Array<{from:number;to:number;x0:number;y0:number;x1:number;y1:number}>=[];
 for(const c of timeline.circles)for(let i=0;i<c.angles.length-1;i++){
  const a=c.angles[i],b=c.angles[i+1],x0=c.x+Math.cos(a),y0=c.y+Math.sin(a),x1=c.x+Math.cos(b),y1=c.y+Math.sin(b);
  data.push(x0,y0,0,x1,y1,0);segments.push({from:c.start+(c.end-c.start)*a/(2*Math.PI),to:c.start+(c.end-c.start)*b/(2*Math.PI),x0,y0,x1,y1});
 }
 const positions=new THREE.Float32BufferAttribute(data,3);
 // Separate draw ranges over the same attribute allow seek-safe temporal echoes.
 const copies=[{delay:.65,opacity:.035,scale:1.012,rotation:.012},{delay:.36,opacity:.05,scale:.991,rotation:-.009},{delay:.18,opacity:.075,scale:1.004,rotation:.004},{delay:0,opacity:.88,scale:1,rotation:0}];
 const layers=copies.map(copy=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',positions);geometry.setDrawRange(0,0);
  const partial=new THREE.BufferGeometry(),partialArray=new Float32Array(6);partial.setAttribute('position',new THREE.BufferAttribute(partialArray,3).setUsage(THREE.DynamicDrawUsage));partial.setDrawRange(0,0);
  const material=new THREE.LineBasicMaterial({color:0xf8f2e7,transparent:true,opacity:copy.opacity,depthTest:false,depthWrite:false});
  const group=new THREE.Group();group.scale.setScalar(copy.scale);group.rotation.z=copy.rotation;group.add(new THREE.LineSegments(geometry,material),new THREE.LineSegments(partial,material));root.add(group);
  return {delay:copy.delay,geometry,partial,partialArray,material};
 });
 const emberGeometry=new THREE.BufferGeometry();const emberData=new Float32Array(3);emberGeometry.setAttribute('position',new THREE.BufferAttribute(emberData,3).setUsage(THREE.DynamicDrawUsage));
 const emberMaterial=new THREE.PointsMaterial({color:0xe88c4f,size:3,sizeAttenuation:false,transparent:true,opacity:0,depthTest:false,depthWrite:false});const ember=new THREE.Points(emberGeometry,emberMaterial);root.add(ember);
 function draw(time:number){
  const t=Math.max(0,Math.min(timeline.duration,time));
  for(const layer of layers){const layerTime=t-layer.delay;let lo=0,hi=segments.length;
   while(lo<hi){const mid=(lo+hi)>>1;if(segments[mid].to<=layerTime+1e-10)lo=mid+1;else hi=mid;}
   layer.geometry.setDrawRange(0,lo*2);const seg=segments[lo];
   if(seg&&layerTime>=seg.from&&layerTime<seg.to){const f=Math.max(0,Math.min(1,(layerTime-seg.from)/(seg.to-seg.from)));layer.partialArray.set([seg.x0,seg.y0,0,seg.x0+(seg.x1-seg.x0)*f,seg.y0+(seg.y1-seg.y0)*f,0]);(layer.partial.attributes.position as THREE.BufferAttribute).needsUpdate=true;layer.partial.setDrawRange(0,2);}else layer.partial.setDrawRange(0,0);
  }
  let l=0,h=timeline.events.length;while(l<h){const m=(l+h)>>1;if(timeline.events[m].time<=t)l=m+1;else h=m;}const e=timeline.events[l-1],age=e?t-e.time:Infinity;
  if(e&&age>=0&&age<.24){emberData.set([e.x,e.y,.01]);(emberGeometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;emberMaterial.opacity=.65*(1-age/.24);ember.visible=true;}else ember.visible=false;
  root.scale.setScalar(1+.008*Math.sin(2*Math.PI*t/timeline.duration));renderer.render(scene,camera);
 }
 function setSize(width:number,height:number){renderer.setSize(width,height,false);const aspect=width/height;camera.left=-3.09375*aspect;camera.right=3.09375*aspect;camera.updateProjectionMatrix();}
 function dispose(){layers.forEach(layer=>{layer.geometry.dispose();layer.partial.dispose();layer.material.dispose();});emberGeometry.dispose();emberMaterial.dispose();renderer.dispose();}
 return {draw,setSize,dispose,stats:{segments:segments.length,vertices:segments.length*2,copies:copies.length,maxDrawCalls:9,echoDelaysSeconds:copies.slice(0,3).map(c=>c.delay)}};
}
