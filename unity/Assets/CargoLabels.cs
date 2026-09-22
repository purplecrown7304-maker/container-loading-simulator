using System;
using System.Collections.Generic;
using UnityEngine;

[Serializable] public class CargoLabelImage { public string cargoId,png; }
[Serializable] public class CargoLabelBatch { public int revision; public CargoLabelImage[] labels; }

public sealed class CargoLabels {
 readonly List<Material> materials=new List<Material>();
 readonly List<Texture2D> textures=new List<Texture2D>();
 readonly List<GameObject> roots=new List<GameObject>();
 Mesh quad;
 public int faces {get;private set;}
 public void Clear(){foreach(var root in roots)if(root)UnityEngine.Object.Destroy(root);foreach(var mat in materials)UnityEngine.Object.Destroy(mat);foreach(var tex in textures)UnityEngine.Object.Destroy(tex);roots.Clear();materials.Clear();textures.Clear();faces=0;}
 public void Show(bool visible){foreach(var root in roots)if(root)root.SetActive(visible);}
 public void Apply(CargoPlan plan,List<GameObject> boxes,CargoLabelBatch batch,bool visible){
  Clear();var byId=new Dictionary<string,Material>();
  foreach(var label in batch.labels??new CargoLabelImage[0]){
   if(string.IsNullOrEmpty(label.cargoId)||string.IsNullOrEmpty(label.png)||byId.ContainsKey(label.cargoId))continue;
   var texture=new Texture2D(2,2,TextureFormat.RGBA32,true);textures.Add(texture);
   if(!ImageConversion.LoadImage(texture,Convert.FromBase64String(label.png),true))continue;
   texture.filterMode=FilterMode.Trilinear;texture.anisoLevel=4;texture.wrapMode=TextureWrapMode.Clamp;
   var material=new Material(Resources.Load<Shader>("CargoLabel"));material.mainTexture=texture;material.enableInstancing=true;materials.Add(material);byId[label.cargoId]=material;
  }
  for(int i=0;i<boxes.Count;i++){
   if(!byId.TryGetValue(plan.placements[i].cargoId,out var material))continue;
   var root=new GameObject("Box information");root.transform.SetParent(boxes[i].transform,false);roots.Add(root);
   // Four vertical faces; the carton skin is inset by 1%, so the labels remain
   // within the physical box envelope while avoiding z-fighting with its mesh.
   AddFace(root.transform,new Vector3(0,0,.503f),Quaternion.Euler(0,180,0),material);
   AddFace(root.transform,new Vector3(0,0,-.503f),Quaternion.identity,material);
   AddFace(root.transform,new Vector3(.503f,0,0),Quaternion.Euler(0,-90,0),material);
   AddFace(root.transform,new Vector3(-.503f,0,0),Quaternion.Euler(0,90,0),material);
   root.SetActive(visible);
  }
 }
 void AddFace(Transform parent,Vector3 position,Quaternion rotation,Material material){
  if(!quad){quad=new Mesh();quad.name="Shared label plane";quad.vertices=new[]{new Vector3(-.5f,-.5f,0),new Vector3(.5f,-.5f,0),new Vector3(-.5f,.5f,0),new Vector3(.5f,.5f,0)};quad.uv=new[]{new Vector2(0,0),new Vector2(1,0),new Vector2(0,1),new Vector2(1,1)};quad.triangles=new[]{0,2,1,2,3,1};quad.RecalculateBounds();}
  var go=new GameObject("Printed carton label");go.AddComponent<MeshFilter>().sharedMesh=quad;go.AddComponent<MeshRenderer>();go.transform.SetParent(parent,false);
  go.transform.localPosition=position;go.transform.localRotation=rotation;go.transform.localScale=new Vector3(.82f,.62f,1);
  go.GetComponent<Renderer>().sharedMaterial=material;faces++;
 }
 public void Dispose(){Clear();if(quad)UnityEngine.Object.Destroy(quad);}
}
