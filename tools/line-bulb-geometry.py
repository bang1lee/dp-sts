#!/usr/bin/env -S uv run --with numpy --with scikit-image python
"""Generate a true power-8 Mandelbulb triangle surface and its planar intersections.
The distance estimator is sampled on a regular grid; marching cubes approximates
its isosurface. Contours are intersections of that very mesh with horizontal planes.
"""
from pathlib import Path
import json
import numpy as np
from skimage.measure import marching_cubes

N=100
EXTENT=1.45
ITER=12
LEVEL=.006
out=Path('assets/line-bulb');out.mkdir(parents=True,exist_ok=True)
axis=np.linspace(-EXTENT,EXTENT,N,dtype=np.float32)
x,y,z=np.meshgrid(axis,axis,axis,indexing='ij')
c=np.stack((x,y,z),axis=-1); v=c.copy(); dr=np.ones_like(x); active=np.ones_like(x,dtype=bool)
for _ in range(ITER):
    rad=np.linalg.norm(v,axis=-1); active &= rad<4
    safe=np.maximum(rad,1e-20)
    theta=np.arccos(np.clip(v[...,2]/safe,-1,1)); phi=np.arctan2(v[...,1],v[...,0]);
    dr=np.where(active,8*np.power(safe,7)*dr+1,dr)
    zr=np.where(active,np.power(safe,8),0)
    nv=np.stack((np.sin(theta*8)*np.cos(phi*8),np.sin(theta*8)*np.sin(phi*8),np.cos(theta*8)),axis=-1)*zr[...,None]+c
    v=np.where(active[...,None],nv,v)
rad=np.maximum(np.linalg.norm(v,axis=-1),1e-20)
field=np.where(active,0,.5*np.log(rad)*rad/np.maximum(dr,1e-20)).astype(np.float32)
field=np.nan_to_num(field,nan=0,posinf=2,neginf=0)
step=2*EXTENT/(N-1)
vertices,faces,_,_=marching_cubes(field,level=LEVEL,spacing=(step,step,step));vertices-=EXTENT
triangles=vertices[faces].astype(np.float32)
# Intersect the surface mesh with planes perpendicular to its Y axis.
contours=[]
for height in np.linspace(-1.03,1.03,19):
    hits=[]
    for a,b in ((0,1),(1,2),(2,0)):
        p,q=triangles[:,a],triangles[:,b]
        mask=((p[:,1]<=height)&(q[:,1]>height))|((q[:,1]<=height)&(p[:,1]>height))
        idx=np.nonzero(mask)[0];f=((height-p[idx,1])/(q[idx,1]-p[idx,1]))[:,None]
        hits.append((idx,p[idx]+f*(q[idx]-p[idx])))
    points=np.full((len(triangles),2,3),np.nan,dtype=np.float32);counts=np.zeros(len(triangles),dtype=np.int8)
    for idx,pts in hits:
        points[idx,counts[idx]]=pts;counts[idx]+=1
    contours.append(points[counts==2])
lines=np.concatenate(contours,axis=0).astype('<f4')
triangles.astype('<f4').tofile(out/'surface.f32');lines.tofile(out/'contours.f32')
metadata={'formula':'z_0=c; z_(n+1)=z_n^8+c using spherical power (r^8, 8θ, 8φ); 12 iterations, escape radius 4','surface':'distance estimator 0.5 log(r) r / derivative; isovalue 0.006; marching cubes','grid':N,'extent':EXTENT,'sectionPlanes':19,'surfaceTriangles':len(triangles),'surfaceVertices':int(triangles.size/3),'lineSegments':len(lines),'lineVertices':int(lines.size/3)}
(out/'manifest.json').write_text(json.dumps(metadata,indent=2)+'\n');print(json.dumps(metadata,indent=2))
