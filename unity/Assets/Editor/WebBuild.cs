using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
public static class WebBuild {
 public static void Run() {
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
