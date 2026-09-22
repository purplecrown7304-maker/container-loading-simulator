using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
public static class WebBuild {
 public static void Run() {
  const string instancedPath="Assets/Resources/CargoInstanced.mat";
  var instanced=AssetDatabase.LoadAssetAtPath<Material>(instancedPath);
  if(!instanced){instanced=new Material(Resources.Load<Shader>("CargoTextured"));AssetDatabase.CreateAsset(instanced,instancedPath);}
  instanced.enableInstancing=true;EditorUtility.SetDirty(instanced);AssetDatabase.SaveAssets();
  foreach(var key in new[]{"truck-cab","container-shell","carton","wood-pallet","plastic-pallet","corner-guard","dunnage-block","dunnage-airbag"}) {
   var asset=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Resources/Meshy/"+key+"/model.obj");
   if(!asset)throw new System.Exception("Missing Meshy model: "+key);
   var instance=Object.Instantiate(asset);int triangles=0;Bounds bounds=new Bounds();bool first=true;
   foreach(var renderer in instance.GetComponentsInChildren<MeshRenderer>()) {
    if(first){bounds=renderer.bounds;first=false;}else bounds.Encapsulate(renderer.bounds);
    foreach(var material in renderer.sharedMaterials)if(!material||!material.mainTexture)throw new System.Exception("Missing Meshy texture: "+key);
    triangles+=renderer.GetComponent<MeshFilter>().sharedMesh.triangles.Length/3;
   }
   if(first||(bounds.size-Vector3.one).magnitude>.005f||bounds.center.magnitude>.005f)throw new System.Exception("Meshy bounds must be unit centered: "+key+" "+bounds);
   Debug.Log("MESHY_ASSET_OK "+key+" triangles="+triangles+" bounds="+bounds);
   Object.DestroyImmediate(instance);
  }
  EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
  var go=new GameObject("CargoViewer"); go.AddComponent<CargoViewer>();
  EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene(),"Assets/Viewer.unity");
  PlayerSettings.companyName="Cargo Studio"; PlayerSettings.productName="Cargo Unity Viewer";
  PlayerSettings.WebGL.compressionFormat=WebGLCompressionFormat.Disabled;
  PlayerSettings.WebGL.dataCaching=false; PlayerSettings.WebGL.initialMemorySize=128;
  PlayerSettings.runInBackground=true;
  PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.WebGL,ManagedStrippingLevel.Low);
  var path=Path.GetFullPath(Path.Combine(Application.dataPath,"../../public/unity-viewer"));
  var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions {scenes=new[]{"Assets/Viewer.unity"},locationPathName=path,target=BuildTarget.WebGL,options=BuildOptions.None});
  if(report.summary.result!=BuildResult.Succeeded) throw new System.Exception("Unity build failed: "+report.summary.result);
  Debug.Log("CARGO_WEB_BUILD_SUCCESS "+path);
 }
}
