// Seven independent fields; no footage, image textures, or external model output.
export const works = [
  {id:'01-canopy-melt',title:'Canopy Melt',ko:'녹아 흐르는 숲',seed:17,start:0,psy:false},
  {id:'02-coral-vortex',title:'Coral Vortex',ko:'산호의 소용돌이',seed:31,start:70,psy:false},
  {id:'03-glacier-veins',title:'Glacier Veins',ko:'빙하의 혈관',seed:53,start:180,psy:false},
  {id:'04-mycelium-choir',title:'Mycelium Choir',ko:'균사의 합창',seed:79,start:275,psy:false},
  {id:'05-mineral-memory',title:'Mineral Memory',ko:'광물의 기억',seed:101,start:420,psy:false},
  {id:'06-neon-abyss',title:'Neon Abyss',ko:'네온 심연',seed:137,start:180,psy:true},
  {id:'07-acid-bloom',title:'Acid Bloom',ko:'애시드 개화',seed:163,start:360,psy:true},
];

const prelude=`
  vec2 p=(_st-.5)*vec2(1.7777778,1.0)*2.0;
  float t=time;
  float arc=pow(sin(3.14159265*clamp(t/180.,0.,1.)),2.);
  // Slow, overlapping chapter curves keep the three-minute arc continuous.
  float opening=smoothstep(8.,52.,t);
  float emergence=smoothstep(48.,112.,t);
  float release=smoothstep(118.,174.,t);
  float breathe=.5+.5*sin(t*.075);
  // Features are measured and smoothed by the offline audio analysis.
  float bass=clamp(low,0.,1.);
  float body=clamp(mid,0.,1.);
  float air=clamp(high,0.,1.);
  float sd=seed*.071;
  vec3 col=vec3(0.);
`;
const postlude=`
  float vignette=1.-.18*smoothstep(.3,2.15,length(p));
  float fade=smoothstep(0.,3.,t)*(1.-smoothstep(173.,180.,t));
  col=vec3(1.)-exp(-max(col,vec3(0.))*1.22);
  col=pow(col,vec3(.94))*vignette*fade;
  return vec4(col,1.);
`;

// Domain-warped, recursively layered fluid. Separate coordinate maps below
// produce folds, cyclonic shells, glacial veins and sediment contours.
const field=`
  vec2 q=p;
  float n=0.,amp=.5;
  for(int j=0;j<4;j++){
    float k=float(j);
    float a=_noise(vec3(q*1.13+sd,t*.027+k*8.));
    float b=_noise(vec3(q*1.13-sd+18.7,t*.023+k*5.));
    q+=vec2(a,b)*(.5+.2*arc)/(1.+k*.5);
    n+=amp*a;
    q=mat2(.8,-.6,.6,.8)*q*1.85+vec2(3.2,1.7);
    amp*=.44;
  }
`;

const bodies=[
  // Dense pigment ridges; green/lichen/ivory emerge from the same fluid field.
  `p*=1.12+.16*sin(t*.018)+.08*emergence-.05*release;
  p+=vec2(.14*sin(t*.021),t*.009);
  ${field}
  float fold=n*4.+p.y*.75+sin(p.x*1.8+t*.04)*.55;
  float veins=.5+.5*sin(fold*6.+.5*sin(fold*13.));
  float shade=.36+.64*smoothstep(-.6,.6,sin(fold*3.));
  float pool=.5+.5*sin(p.x*.9-p.y*.6+t*.018+n*2.);
  float glint=pow(max(0.,cos(fold*6.+.5)),12.)*(.15+.20*air);
  vec3 deep=vec3(.012,.10,.078),leaf=vec3(.17,.39,.12),gold=vec3(.72,.52,.16),milk=vec3(.86,.91,.64);
  col=mix(deep,leaf,smoothstep(-.5,.32,n));
  col=mix(col,gold,smoothstep(.03,.48,n+.2*sin(p.x))*.8);
  col=mix(col,milk,pow(veins,18.)*(.35+.3*high));
  col*=shade*(1.43+.25*pool);
  col+=vec3(.13,.20,.10)*pow(veins,3.)*(.24+.12*body);
  col+=vec3(.45,.53,.25)*glint*(.55+.45*pool);`,
  // Spiral shells with recursive scalloping, not a recolored fluid rectangle.
  `p-=vec2(.25*sin(t*.02),.12*cos(t*.027));
  float r=length(p),a=atan(p.y,p.x);
  float twist=a+r*1.2-t*.025;
  vec2 q=vec2(cos(twist),sin(twist))*(r+.3)*1.5;float f=0.,amp=.5;
  for(int j=0;j<6;j++){
    q+=.35*vec2(sin(q.y*2.+t*.04),cos(q.x*2.-t*.03));
    f+=amp*_noise(vec3(q,sd+float(j)*7.));q=q*1.92+3.2;amp*=.53;
  }
  float shell=sin(12.*r-4.*a+f*(7.5+emergence)-t*.11);
  float rib=.5+.5*sin(44.*r-12.*a+f*16.);
  float pearl=pow(max(0.,cos(12.*r-4.*a+f*7.5-t*.11-.55)),8.);
  float depth=.5+.5*sin(3.*r+2.*a+f*2.-t*.025);
  col=mix(vec3(.16,.022,.068),vec3(1.,.28,.12),.5+.5*shell);
  col=mix(col,vec3(1.1,.79,.57),pow(rib,12.)*.65);
  col*=.38+.75*smoothstep(-.9,.8,shell);
  col*=.82+.25*depth;
  col+=vec3(.62,.32,.17)*pearl*(.12+.15*air);
  col+=vec3(.02,.18,.21)*pow(1.-rib,4.)*(1.-smoothstep(.1,1.2,r));
  col*=.4+.6*smoothstep(.02,.4,r);`,
  // Long, oblique glacial shear with large dark channels and thin ice edges.
  `p=mat2(.94,-.34,.34,.94)*p;p.y*=1.35;p.x+=t*.014;
  float n=_noise(vec3(p*1.2,t*.025+sd));
  float river=p.y+(.43+.10*emergence)*sin(p.x*1.4+t*.03)+.16*sin(p.x*3.7-t*.045)+n*.14;
  river+=.045*bass*sin(p.x*2.1+t*.04);
  float boundary=river*12.+.5*sin(river*7.);
  float layer=.5+.5*sin(boundary);
  // Short asymmetric offshoots appear only on selected lengths of the shear.
  float branchMask=smoothstep(.58,.94,sin(p.x*1.42+.45*sin(p.x*.57)+.45));
  float bend=.5+.5*sin(p.x*1.4+t*.03);
  float fork1=pow(.5+.5*cos(boundary+branchMask*(.40+1.15*bend)),38.);
  float fork2=pow(.5+.5*cos(boundary*2.+branchMask*(.8+1.2*(1.-bend))),48.);
  float shelf=.5+.5*sin(river*3.1+n*.7-t*.02);
  float rim=pow(max(0.,cos(river*12.+.5*sin(river*7.)-.5)),10.);
  float curvature=sin(p.x*1.4+t*.03)+.42*sin(p.x*3.7-t*.045);
  float thin=pow(.5+.5*sin(river*92.+n*2.+.8*curvature),19.+5.*bend);
  col=mix(vec3(.005,.045,.11),vec3(.04,.52,.65),smoothstep(.15,.85,layer));
  col=mix(col,vec3(.73,.96,1.05),pow(layer,8.)*.8);
  col+=thin*vec3(.22,.42,.48)*(.5+.5*mid);
  col*=.55+.38*smoothstep(-.3,.4,n)+.15*shelf;
  col+=vec3(.21,.42,.45)*rim*(.15+.16*air);
  col+=branchMask*(fork1*vec3(.17,.34,.36)+fork2*vec3(.055,.16,.18))*(.65+.20*body);
  col+=vec3(.015,.045,.065)*(1.-layer);`,
  // Analytic bundles of filaments; depth comes from width, light and occlusion.
  `p*=1.05+.15*sin(t*.025);float energy=0.;
  for(int j=0;j<64;j++){
    float k=float(j),u=(k-31.5)/31.5;
    float y=u*.82 + .28*sin(p.x*(1.3+.3*sin(k*.07))+t*.035+k*.032);
    y+=.19*sin(p.x*2.7-t*.026+k*.11)*sin(k*.13+t*.015);
    y+=.10*sin(p.x*5.1+t*.05+k*.09);
    float d=abs(p.y-y);
    float width=(.0015+.0025*(.5+.5*sin(k*.37)))*(.92+.18*body);
    float line=exp(-d*d/(width*width));
    float halo=exp(-d*d/.0008)*.075;
    float pulse=.35+.65*pow(.5+.5*sin(p.x*2.2-t*.20+k*.12),3.);
    vec3 c=mix(vec3(.02,.28,.22),vec3(.89,.65,.21),.5+.5*sin(k*.14+t*.01));
    col+=c*(line+halo)*pulse*(.65+.35*body);
    energy+=halo;
  }
  col+=vec3(.008,.027,.025)+vec3(.02,.04,.025)*energy;`,
  // Sedimentary contours: wide material bands with hairline contours.
  `p=mat2(.98,.2,-.2,.98)*p;p+=vec2(.08*sin(t*.04),t*.006);
  float n=_noise(vec3(p*.7+sd,t*.018));
  n+=.16*_noise(vec3(p*2.1+n,t*.025));
  float elevation=n*.45+p.y*.45+(.19+.05*emergence)*sin(p.x*1.3+t*.018);
  elevation+=.018*bass*sin(p.x*1.9+t*.03);
  // Confine edge erosion to occasional stretches of the existing layers.
  float erosionWindow=smoothstep(.58,.94,sin(p.x*1.55+.65*sin(p.y*1.3)+.3));
  float edgeWindow=1.-smoothstep(.12,.62,abs(sin(elevation*9.+.6)));
  elevation+=.022*erosionWindow*edgeWindow*sin(p.x*8.1+p.y*2.8+t*.025);
  float strata=.5+.5*sin(elevation*24.);
  float relief=.5+.5*cos(elevation*24.-.7);
  float basin=.5+.5*sin(p.x*.7-p.y*.4+n*1.5+t*.012);
  float fine=.5+.5*sin(elevation*145.);
  vec3 rust=vec3(.67,.22,.10),sand=vec3(.96,.72,.39),slate=vec3(.035,.22,.27);
  col=mix(rust,sand,smoothstep(.15,.8,strata));
  col=mix(col,slate,smoothstep(.05,.28,sin(elevation*9.+.6))*.85);
  col*=.38+.52*smoothstep(.0,.75,strata)+.13*basin;
  col+=vec3(.30,.20,.11)*pow(relief,10.)*(.22+.15*air);
  col+=pow(fine,22.)*vec3(.32,.24,.14)*(.5+.3*air);
  // A few enclosed mineral inclusions embedded in the moving material.
  vec2 c1=(p-vec2(-.78,.35))/vec2(.145,.060);
  vec2 c2=(p-vec2(.40,.60))/vec2(.075,.039);
  vec2 c3=(p-vec2(1.12,.12))/vec2(.105,.045);
  float d1=length(c1),d2=length(c2),d3=length(c3);
  float core=(1.-smoothstep(.52,.92,d1))*.32+(1.-smoothstep(.52,.92,d2))*.24+(1.-smoothstep(.52,.92,d3))*.28;
  float mineral=exp(-abs(d1-1.)*16.)+exp(-abs(d2-1.)*16.)+exp(-abs(d3-1.)*16.);
  col=mix(col,vec3(.055,.19,.18),clamp(core,0.,.34));
  col+=vec3(.39,.26,.12)*mineral*(.25+.10*air);`,
  // Seamless sixfold tunnel with five scales of folded luminous geometry.
  // A bounded radial coordinate keeps the recursion legible and inexpensive.
  `vec2 center=vec2(.10*sin(t*.035),.06*cos(t*.028));p-=center;
  float r=length(p),a=atan(p.y,p.x);
  float radial=log(r+.23);
  float phase=5.2*radial-6.*a-t*(.075+.012*emergence);
  float fold=phase+.42*sin(3.*a+radial*2.+t*.04);
  float band=.5+.5*cos(fold);
  float edge=pow(max(0.,cos(fold-.50)),10.);
  float depths=.5+.5*cos(radial*3.4-3.*a-t*.045);
  float portal=1.-smoothstep(.10,.37,r);
  float halo=exp(-abs(r-(.28+.025*sin(t*.035)))*8.);
  vec3 shadow=vec3(.008,.004,.045),violet=vec3(.24,.012,.43);
  vec3 cyan=vec3(.015,.83,.98),magenta=vec3(.95,.025,.61),lime=vec3(.64,.95,.035);
  col=mix(shadow,violet,pow(band,2.)*(.45+.18*depths));
  col+=mix(cyan,magenta,depths)*edge*(.14+.08*body);

  // The sin/cos mapping is periodic at the atan branch. Folded circle and
  // axis traps reveal nested cells, instead of high-frequency inversion noise.
  float radialPulse=radial*4.1-t*.085;
  float petal=6.*a+.30*sin(radial*1.7-t*.025);
  vec2 z=vec2(cos(petal),sin(petal))*(.90+.34*sin(radialPulse));
  z+=.10*vec2(cos(radialPulse),sin(radialPulse));
  vec3 filigree=vec3(0.);
  for(int j=0;j<5;j++){
    float k=float(j);
    z=abs(z)-vec2(.57+.025*sin(t*.03),.37);
    z=mat2(.83,-.558,.558,.83)*z*1.68;
    float circle=abs(length(z)-(.48+.05*sin(radialPulse*.5)));
    float crossing=min(abs(z.x),abs(z.y));
    float line=exp(-circle*(18.+k*1.2));
    float spoke=exp(-crossing*20.)*exp(-abs(length(z)-.54)*2.5);
    vec3 ink=mix(cyan,magenta,.5+.5*cos(k*2.1+radial*.7));
    ink=mix(ink,lime,.42*pow(.5+.5*cos(k*2.5+radial*1.3),4.));
    float weight=exp(-k*.27)*(1.-.25*smoothstep(2.,4.,k));
    filigree+=ink*(line*.50+spoke*.17)*weight;
  }
  // Emphasize the large spiral and dark core to preserve depth beneath detail.
  float structure=.38+.62*smoothstep(.05,.8,band);
  col+=filigree*structure*(.65+.14*air);
  col+=lime*pow(max(0.,cos(fold*2.+1.3)),16.)*(.10+.08*bass);
  col+=mix(cyan,magenta,depths)*halo*.19;
  col*=1.-.88*portal;
  col*=1.-.18*smoothstep(.9,2.,r);`,
  // Angularly folded recursive flower; changing scale and internal braiding.
  `float r=length(p),a=atan(p.y,p.x)+t*.045;
  float sector=3.14159265/6.;a=abs(mod(a+sector,2.*sector)-sector);
  vec2 z=vec2(cos(a),sin(a))*r*(1.1+.18*sin(t*.035)+.035*emergence+.025*bass);
  float acc=0.,trap=10.;
  for(int j=0;j<8;j++){
    z=abs(z)-vec2(.49+.06*sin(t*.06),.32);
    z=mat2(.77,-.638,.638,.77)*z*1.53;
    z+=.11*sin(z.yx*3.+t*.17+float(j));
    float d=abs(length(z)-.42);
    acc+=exp(-d*(16.+float(j)*2.))*exp(-float(j)*.17);
    trap=min(trap,d);
  }
  vec3 pal=.5+.5*cos(vec3(.2,2.7,4.8)+r*5.+acc*2.-t*.095);
  col=pal*acc*.9+vec3(.20,.035,.28)*exp(-trap*18.);
  col+=vec3(.40,.75,.08)*exp(-trap*120.)*(.4+.35*air);
  col*=.55+.45*smoothstep(.02,.25,r);`,
];

export function shader(index){return prelude+bodies[index]+postlude;}
