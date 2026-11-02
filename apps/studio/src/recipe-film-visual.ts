import * as THREE from 'three';
import type { VisualConfig } from './workbench-engine';
export interface FilmFeature { rms:number; low:number; high:number; onset:number }
const vertex = `precision highp float;
in vec3 position;void main(){gl_Position=vec4(position.xy,1.,1.);}`;
const fragment = `precision highp float;
out vec4 color;
uniform vec2 resolution;
uniform mat4 filmCameraWorld, filmViewProjection;
uniform float time, duration, rms, low, high, onset, depth, density, bloom, connection, scale, motion, response;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec2 bulb(vec3 p){
 vec3 z=p;float dr=1.,r=0.,trap=4.;float power=6.+floor(density*4.+.5);
 for(int i=0;i<8;i++) {if(float(i)>=3.+depth*5.)break;r=length(z);trap=min(trap,abs(r-.52));if(r>2.5)break;
  float th=acos(clamp(z.z/max(r,.0001),-1.,1.)),ph=atan(z.y,z.x);
  dr=pow(max(r,.0001),power-1.)*power*dr+1.;float zr=pow(r,power);th*=power;ph*=power;
  z=zr*vec3(sin(th)*cos(ph),sin(th)*sin(ph),cos(th))+p;
 }
 return vec2(.5*log(max(r,.0001))*r/max(dr,.0001),trap);
}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*resolution)/resolution.y;
 float phase=clamp(time/duration,0.,1.);float reveal=smoothstep(0.,.12,phase);float settle=smoothstep(.77,1.,phase);float passage=smoothstep(.58,.69,phase)*(1.-smoothstep(.75,.86,phase));
 float pulse=clamp(low*response,0.,1.);
 vec3 ro=(filmCameraWorld*vec4(0.,0.,0.,1.)).xyz;
 vec3 rd=normalize((filmCameraWorld*vec4(uv,-1.64,0.)).xyz);
 vec3 bg=mix(vec3(.003,.007,.016),vec3(.010,.022,.039),clamp(.48+uv.y*.30,0.,1.));
 bg+=vec3(.01,.018,.035)*exp(-length(uv)*1.6);
 float b=dot(ro,rd),c=dot(ro,ro)-2.7,disc=b*b-c;bool hit=false;float t=max(0.,-b-sqrt(max(disc,0.))),d=0.,trap=1.;int stepCount=0;
 if(disc>0.)for(int i=0;i<92;i++){vec3 pos=ro+rd*t;vec2 de=bulb(pos);d=de.x;trap=de.y;stepCount=i;if(d<.0015){hit=true;break;}t+=clamp(d,.003,.25);if(t> -b+sqrt(disc))break;}
 if(!hit){gl_FragDepth=1.;color=vec4(bg,1.);return;}
 vec3 p=ro+rd*t;vec4 clip=filmViewProjection*vec4(p,1.);gl_FragDepth=clamp((clip.z/clip.w)*.5+.5,0.,1.);float eps=.0022;float base=bulb(p).x;
 vec3 n=normalize(vec3(bulb(p+vec3(eps,0,0)).x-base,bulb(p+vec3(0,eps,0)).x-base,bulb(p+vec3(0,0,eps)).x-base));
 vec3 l=normalize(vec3(-.5,.75,1.));float diffuse=max(dot(n,l),0.), rim=pow(1.-max(dot(n,-rd),0.),2.1);
 // Spatial zones use the actual hit position and orbit trap, including when audio response is off.
 float strata=clamp(.5+.32*p.y+.26*sin(p.x*2.8+p.z*2.2)+.10*sin(trap*12.),0.,1.);
 float zone=sin(p.x*2.7+p.z*1.8)+p.y*1.3+trap*.35;
 float violetZone=smoothstep(-.35,.50,zone),warmZone=smoothstep(.10,.85,-zone);
 vec3 teal=vec3(.035,.35,.31),blue=vec3(.055,.16,.43),violet=vec3(.38,.09,.48),amber=vec3(.65,.24,.07);
 vec3 surface=mix(blue,teal,smoothstep(.25,.72,strata));
 surface=mix(surface,violet,.68*violetZone);surface=mix(surface,amber,.64*warmZone);
 // Scale against measured p95 values (~0.094 high, ~0.80 onset), clamped before applying response.
 float treble=clamp(high/.10,0.,1.)*response,transient=clamp(onset/.80,0.,1.)*response;
 surface=mix(surface,vec3(.64,.12,.52),violetZone*treble*.72);
 surface=mix(surface,vec3(.86,.34,.09),warmZone*transient*.38);
 float light=.16+.72*diffuse+rim*(.13+connection*.11);float detail=exp(-trap*(10.+7.*density));
 vec3 glow=vec3(.11,.28,.35)*rim*(.25+bloom*.20);float ember=pow(max(dot(reflect(-l,n),-rd),0.),22.)*(.30+.22*transient);
 vec3 localColor=vec3(.42,.08,.28)*treble*violetZone*(.10+.20*rim)+vec3(.40,.15,.025)*transient*warmZone*rim*.16;
 vec3 result=bg+surface*light*(.82+.12*pulse+.10*clamp(rms*response,0.,1.))+glow+vec3(.75,.38,.12)*ember+vec3(.11,.20,.25)*detail*(.07+.06*treble)+localColor;
 float visibility=mix(.48,1.,reveal)*(1.-.11*passage);result=bg+(result-bg)*visibility;
 result=1.-exp(-max(result,vec3(0.))*1.35);result=pow(result,vec3(.90));color=vec4(result,1.);
}`;
const post = `precision highp float;out vec4 color;uniform sampler2D image;uniform vec2 resolution;uniform float bloom;
void main(){vec2 uv=gl_FragCoord.xy/resolution;vec2 d=(2.5+4.*bloom)/resolution;vec3 base=texture(image,uv).rgb;vec3 blur=vec3(0.);
 blur+=texture(image,uv+vec2(d.x,0.)).rgb+texture(image,uv-vec2(d.x,0.)).rgb+texture(image,uv+vec2(0.,d.y)).rgb+texture(image,uv-vec2(0.,d.y)).rgb;
 blur+=texture(image,uv+d).rgb+texture(image,uv-d).rgb+texture(image,uv+vec2(d.x,-d.y)).rgb+texture(image,uv+vec2(-d.x,d.y)).rgb;
 color=vec4(min(base+max(blur/8.-.08,vec3(0.))*bloom*.28,vec3(1.)),1.);}`;
/** Scene and perspective camera are public so ordinary meshes/lights can be added later.
 * The raymarched hit writes depth, allowing those meshes to occlude and be occluded. */
export function createFilmRenderer(canvas:HTMLCanvasElement,visual:VisualConfig,duration:number){
 const renderer = new THREE.WebGLRenderer({canvas,preserveDrawingBuffer:true,antialias:false,alpha:false});
 renderer.setPixelRatio(1);renderer.setSize(960,540,false);
 const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34,960/540,.1,30);
 const postScene = new THREE.Scene(), postCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 const target = new THREE.WebGLRenderTarget(960,540,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,depthBuffer:true});
 const resolution = new THREE.Vector2(960,540), viewProjection = new THREE.Matrix4();let response=visual.response;
 const uniforms:Record<string,THREE.IUniform> = Object.fromEntries(['time','duration','rms','low','high','onset','depth','density','bloom','connection','scale','motion','response'].map(key=>[key,{value:0}]));
 uniforms.resolution={value:resolution};uniforms.filmCameraWorld={value:camera.matrixWorld};uniforms.filmViewProjection={value:viewProjection};
 const material = new THREE.RawShaderMaterial({vertexShader:vertex,fragmentShader:fragment,glslVersion:THREE.GLSL3,uniforms,depthTest:true,depthWrite:true});
 const quadGeometry = new THREE.PlaneGeometry(2,2), quad = new THREE.Mesh(quadGeometry,material);quad.frustumCulled=false;quad.renderOrder=-100;scene.add(quad);
 scene.add(new THREE.AmbientLight(0xffffff,.3));const light=new THREE.DirectionalLight(0xd5eeff,1.5);light.position.set(-3,4,5);scene.add(light);
 const postMaterial = new THREE.RawShaderMaterial({vertexShader:vertex,fragmentShader:post,glslVersion:THREE.GLSL3,uniforms:{image:{value:target.texture},resolution:{value:resolution},bloom:{value:visual.bloom}},depthTest:false,depthWrite:false});
 const postQuad = new THREE.Mesh(quadGeometry,postMaterial);postQuad.frustumCulled=false;postScene.add(postQuad);
 const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 const setSize=(width:number,height:number)=>{renderer.setSize(width,height,false);target.setSize(width,height);resolution.set(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();};
 return {scene,camera,renderer,setSize,setResponse(enabled:boolean){response=enabled?visual.response:0;},addObject(object:THREE.Object3D){scene.add(object);},draw(t:number,feature:FilmFeature){
   const phase=Math.max(0,Math.min(1,t/duration)), reveal=smooth(0,.12,phase),settle=smooth(.77,1,phase),passage=smooth(.58,.69,phase)*(1-smooth(.75,.86,phase));
   const radius=4.25/(.70+visual.scale*.78)+.80*(1-reveal)+.50*passage+.25*settle, angle=t*visual.motion*.033;
   camera.position.set(Math.sin(angle)*radius,.09,Math.cos(angle)*radius);camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.matrixWorldInverse.copy(camera.matrixWorld).invert();viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
   for(const [key,value] of Object.entries({time:t,duration,...feature,depth:visual.depth,density:visual.density,bloom:visual.bloom,connection:visual.connection,scale:visual.scale,motion:visual.motion,response})) uniforms[key].value=value;
   renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(postScene,postCamera);
 },dispose(){target.dispose();quadGeometry.dispose();material.dispose();postMaterial.dispose();renderer.dispose();}};
}
