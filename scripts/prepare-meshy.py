from pathlib import Path
import argparse, trimesh, numpy as np, json, hashlib
from PIL import Image
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description='Import downloaded Meshy web GLBs into Unity with normalized bounds and original UVs.')
parser.add_argument('--input', type=Path, required=True)
keys=['truck-cab','container-shell','carton','wood-pallet','plastic-pallet','corner-guard','dunnage-block','dunnage-airbag']
parser.add_argument('--keys', nargs='+', choices=keys, help='Replace only these models, retaining other assets and provenance.')
parser.add_argument('--project-url', help='Generation project for the replaced models.')
parser.add_argument('--date', help='Generation date for the replaced models (YYYY-MM-DD).')
args=parser.parse_args()
out=root/'unity/Assets/Resources/Meshy'
manifest=[]
selected=[key for key in keys if not args.keys or key in args.keys]
manifest_path=root/'docs/meshy-models.json'
previous=json.loads(manifest_path.read_text(encoding='utf-8')) if args.keys else None
files=[args.input/f'{keys.index(key)+1:02d}-{key}-web.glb' for key in selected]
missing=[str(p) for p in files if not p.is_file()]
if missing: raise FileNotFoundError('Missing Meshy web models: '+', '.join(missing))
for key,src in zip(selected,files):
 scene=trimesh.load(src,force='scene',process=False)
 total=sum(len(g.faces) for g in scene.geometry.values())
 meshes=[]
 for node in scene.graph.nodes_geometry:
  matrix,name=scene.graph[node];g=scene.geometry[name].copy();g.apply_transform(matrix);meshes.append(g)
 assert len(meshes)==1
 mesh=meshes[0]
 mesh.remove_unreferenced_vertices()
 if not np.isfinite(mesh.vertices).all() or np.any(mesh.extents <= 0):
  raise ValueError(f'Invalid or degenerate mesh: {key}')
 if key=='truck-cab':
  # Retain the cab/front axle; rear chassis is not part of the loading volume.
  split=mesh.bounds[0,0]+mesh.extents[0]*.49
  mesh.update_faces(np.all(mesh.vertices[mesh.faces][:,:,0]<=split,axis=1))
  mesh.remove_unreferenced_vertices()
  mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi,[0,1,0]))
 # Common generated convention is Y-up. Unit bounds let the engine set exact visual dimensions.
 if key in ['carton','wood-pallet','plastic-pallet']:
  mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[0,1,0]))
 mesh.apply_translation(-mesh.bounds.mean(axis=0));mesh.apply_scale(1/mesh.extents)
 if key=='container-shell':
  triangles=mesh.vertices[mesh.faces]
  floor=np.all(triangles[:,:,1]<-.38,axis=1)
  door=np.all(triangles[:,:,0]<-.46,axis=1)
  near=np.all(triangles[:,:,2]>.46,axis=1)
  mesh.update_faces(~(floor|door|near));mesh.remove_unreferenced_vertices()
  mesh.apply_translation(-mesh.bounds.mean(axis=0));mesh.apply_scale(1/mesh.extents)
 material=mesh.visual.material
 image=material.baseColorTexture.convert('RGB');image.thumbnail((1024,1024),Image.Resampling.LANCZOS)
 folder=out/key;folder.mkdir(parents=True,exist_ok=True)
 image.save(folder/'basecolor.jpg',quality=90)
 # Export UV-preserving OBJ; Unity imports the MTL with its native importer.
 uv=mesh.visual.uv;normals=mesh.vertex_normals
 with (folder/'model.obj').open('w',encoding='utf-8',newline='\n') as f:
  f.write('mtllib model.mtl\no '+key+'\n')
  for v in mesh.vertices:f.write('v %.7f %.7f %.7f\n'%tuple(v))
  for v in uv:f.write('vt %.7f %.7f\n'%tuple(v))
  for v in normals:f.write('vn %.7f %.7f %.7f\n'%tuple(v))
  f.write('usemtl meshy\n')
  for face in mesh.faces+1:f.write('f '+' '.join(f'{i}/{i}/{i}' for i in face)+'\n')
 (folder/'model.mtl').write_text('newmtl meshy\nKd 1 1 1\nKa 1 1 1\nmap_Kd basecolor.jpg\n',encoding='utf-8')
 item={'key':key,'source':'web/'+src.name,'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'remeshedTriangles':total,'triangles':len(mesh.faces),'bounds':mesh.bounds.tolist(),'texture':[image.width,image.height]}
 if args.project_url:item['projectUrl']=args.project_url
 if args.date:item['date']=args.date
 manifest.append(item);print(json.dumps(item),flush=True)
(root/'docs').mkdir(exist_ok=True)
if previous is not None:
 updates={item['key']:item for item in manifest}
 previous['models']=[updates.pop(item['key'],item) for item in previous['models']]
 previous['models'].extend(updates.values())
else:
 previous={'provider':'Meshy','projectUrl':'https://www.meshy.ai/ko/agent/Tsl1JIvwlAmalMl-F4NJe','date':'2026-09-22','credits':312,'limit':600,'models':manifest}
manifest_path.write_text(json.dumps(previous,indent=2),encoding='utf-8')
