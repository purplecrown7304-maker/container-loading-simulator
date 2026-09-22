using System.Collections.Generic;
using UnityEngine;

// Meshy assets are visual skins. Packing and Rapier continue to own every physical dimension.
public sealed class CargoModelLibrary {
 readonly Dictionary<string,GameObject> prefabs=new Dictionary<string,GameObject>();
 readonly Dictionary<string,Material> materials=new Dictionary<string,Material>();
 readonly Shader shader;
 public int instances { get; private set; }
 public CargoModelLibrary() { shader=Resources.Load<Shader>("CargoTextured"); }
 public bool Attach(string key,Transform parent,Color tint) {
  if(string.IsNullOrEmpty(key))return false;
  if(!prefabs.TryGetValue(key,out var prefab)) { prefab=Resources.Load<GameObject>("Meshy/"+key+"/model");prefabs[key]=prefab; }
  if(!prefab)return false;
  var visual=Object.Instantiate(prefab,parent,false);visual.name="Meshy "+key;
  foreach(var collider in visual.GetComponentsInChildren<Collider>())Object.Destroy(collider);
  foreach(var renderer in visual.GetComponentsInChildren<MeshRenderer>()) {
   var source=renderer.sharedMaterials;var mapped=new Material[source.Length];
   for(int i=0;i<source.Length;i++) {
    string id=key+"/"+(source[i]?source[i].name:"none")+"/"+i+"/"+ColorUtility.ToHtmlStringRGB(tint);
    if(!materials.TryGetValue(id,out var material)) {
     material=new Material(shader);material.name=id;material.enableInstancing=true;
     material.mainTexture=source[i]?source[i].mainTexture:null;material.color=tint;
     material.SetFloat("_ClipInterior",key=="container-shell"?1:0);
     materials[id]=material;
    }
    mapped[i]=material;
   }
   renderer.sharedMaterials=mapped;
  }
  instances++;return true;
 }
 public void ResetCount(){Dispose();instances=0;}
 public void Dispose(){foreach(var m in materials.Values)Object.Destroy(m);materials.Clear();}
}
