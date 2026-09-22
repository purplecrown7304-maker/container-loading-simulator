using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.Rendering;

[Serializable] public class SpaceSpec { public float length,width,height; }
[Serializable] public class CargoBox { public string cargoId,color,modelKey; public float x,y,z,length,width,height,weightKg; public bool invalid; }
[Serializable] public class Decoration : CargoBox { public int supportIndex = -1; public bool wire; }
[Serializable] public class WeightCell { public float x,y,length,width,loadKg,kgPerM2; }
[Serializable] public class CargoPoint { public float x,y,z; }
[Serializable] public class CargoFrame { public int revision; public float[] cargo,supports; }
[Serializable] public class CargoPlan { public int revision; public SpaceSpec container; public string geometry; public bool vehicle; public CargoBox[] placements,supports; public Decoration[] decorations; public WeightCell[] cells; public CargoPoint centerOfGravity; }
[Serializable] public class ViewerCommand { public string action; public float value; public string view; }
public class CargoViewer : MonoBehaviour {
 [DllImport("__Internal")] static extern void CargoEvent(string json);
 Camera cam; Transform shell,cargoRoot,supportRoot,decorRoot,weightRoot,cgRoot; bool showWeight,showCg=true; CargoPlan plan;
 readonly List<GameObject> boxes=new List<GameObject>(); readonly List<GameObject> supports=new List<GameObject>(); readonly List<Material> ownedMaterials=new List<Material>();
 CargoModelLibrary models; CargoLabels labels=new CargoLabels(); bool showLabels=true;
 Material surface,highlight; float yaw=222,pitch=27,distance=14,viewportAspect=1; Vector3 target; Vector3 mouseDown; bool dragging;
 float cut=100; int step; int selected=-1; bool playing; float clock; GameObject selection;
 float renderUntil; int viewportWidth,viewportHeight;
 // Keep input responsive while static Meshy scenes yield rendering time to validation.
 void WakeRendering(){renderUntil=Time.unscaledTime+.2f;OnDemandRendering.renderFrameInterval=1;}
 void Emit(string json) {
 #if UNITY_WEBGL && !UNITY_EDITOR
 CargoEvent(json);
 #endif
 }
 void Start() {
  Application.targetFrameRate=45; QualitySettings.antiAliasing=4;
  WakeRendering();
  #if UNITY_WEBGL && !UNITY_EDITOR
  WebGLInput.captureAllKeyboardInput=false;
  #endif
  cam=new GameObject("Camera").AddComponent<Camera>(); cam.clearFlags=CameraClearFlags.SolidColor; cam.backgroundColor=new Color(.925f,.953f,.975f); cam.fieldOfView=40; cam.nearClipPlane=.02f; cam.farClipPlane=500;
  models=new CargoModelLibrary();
  surface=new Material(Resources.Load<Shader>("CargoSurface"));
  Emit("{\"type\":\"ready\"}");
 }
 Material Mat(Color color) { var m=new Material(surface); m.color=color; ownedMaterials.Add(m); return m; }
 GameObject Cube(string name,Vector3 pos,Vector3 size,Material mat,Transform parent,bool collider=false) {
  var go=GameObject.CreatePrimitive(PrimitiveType.Cube); go.name=name; go.transform.SetParent(parent,false); go.transform.localPosition=pos; go.transform.localScale=size; go.GetComponent<Renderer>().sharedMaterial=mat;
  if(!collider) Destroy(go.GetComponent<Collider>()); return go;
 }
 GameObject ModelBox(string name,string key,Vector3 pos,Vector3 size,Material mat,Transform parent,bool collider=false) {
  var go=Cube(name,pos,size,mat,parent,collider);
  if(models.Attach(key,go.transform,mat.color))go.GetComponent<MeshRenderer>().enabled=false;
  return go;
 }
 void EdgeBox(Vector3 center,Vector3 size,Material material,Transform root,float thick) {
  for(int axis=0;axis<3;axis++) for(int a=-1;a<=1;a+=2) for(int b=-1;b<=1;b+=2) {
   var p=center; var dims=Vector3.one*thick; dims[axis]=size[axis]+thick;
   p[(axis+1)%3]+=a*size[(axis+1)%3]/2; p[(axis+2)%3]+=b*size[(axis+2)%3]/2;
   Cube("Edge",p,dims,material,root);
  }
 }
 public void SetPlan(string json) {
  var next=JsonUtility.FromJson<CargoPlan>(json);
  if(next==null||next.container==null||next.placements==null||next.container.length<=0||next.container.width<=0||next.container.height<=0) return;
  bool resize=plan==null||plan.container.length!=next.container.length||plan.container.width!=next.container.width||plan.container.height!=next.container.height||plan.vehicle!=next.vehicle;
  if(supportRoot) Destroy(supportRoot.gameObject); if(decorRoot) Destroy(decorRoot.gameObject); if(weightRoot) Destroy(weightRoot.gameObject); if(cgRoot) Destroy(cgRoot.gameObject);
  if(shell) Destroy(shell.gameObject); if(cargoRoot) Destroy(cargoRoot.gameObject); if(selection) Destroy(selection);
  foreach(var m in ownedMaterials) Destroy(m); ownedMaterials.Clear(); boxes.Clear(); supports.Clear(); selected=-1;
  labels.Clear(); models.ResetCount();
  plan=next; playing=false; step=plan.placements.Length;
  WakeRendering();
  shell=new GameObject("Equipment").transform; cargoRoot=new GameObject("Cargo").transform;
  var s=plan.container; float l=s.length,w=s.width,h=s.height;
  Shader.SetGlobalVector("_CargoInteriorMin",new Vector4(-l/2-.03f,-.005f,-w/2-.03f,0));
  Shader.SetGlobalVector("_CargoInteriorMax",new Vector4(l/2+.03f,h+.005f,w/2+.03f,0));
  highlight=Mat(new Color(1,.6f,.04f));
  var floor=Mat(new Color(.65f,.73f,.79f)); var frame=Mat(new Color(.20f,.37f,.48f)); var wall=Mat(new Color(.76f,.83f,.88f)); var grid=Mat(new Color(.82f,.87f,.9f));
  bool detailedShell=plan.geometry!="platform"&&plan.geometry!="flat-rack"&&plan.geometry!="tank";
  GameObject skin=null;
  if(detailedShell){skin=new GameObject("Meshy equipment");skin.transform.SetParent(shell,false);skin.transform.localPosition=new Vector3(0,h/2,0);skin.transform.localScale=new Vector3(l+.12f,h+.12f,w+.12f);detailedShell=models.Attach("container-shell",skin.transform,Color.white);}
  Cube("Floor",new Vector3(0,-.055f,0),new Vector3(l,.11f,w),floor,shell);
  EdgeBox(new Vector3(0,h/2,0),new Vector3(l+.04f,h+.04f,w+.04f),frame,shell,.035f);
  if(plan.geometry!="platform") Cube("Back wall",new Vector3(-l/2-.045f,h/2,0),new Vector3(.05f,h,w),wall,shell);
  if(plan.geometry!="platform"&&plan.geometry!="flat-rack") Cube("Far wall",new Vector3(0,h/2,-w/2-.045f),new Vector3(l,h,.05f),wall,shell);
  if(plan.geometry!="platform"&&plan.geometry!="flat-rack") for(float x=-l/2;x<l/2;x+=.3f) Cube("Corrugation",new Vector3(x,h/2,-w/2-.016f),new Vector3(.035f,h,.025f),floor,shell);
  for(float x=-l/2;x<=l/2;x+=1) Cube("Floor grid",new Vector3(x,.002f,0),new Vector3(.009f,.004f,w),grid,shell);
  for(float z=-w/2;z<=w/2;z+=.5f) Cube("Floor grid",new Vector3(0,.002f,z),new Vector3(l,.004f,.009f),grid,shell);
  // Door is the +X end. The model is cut open on the near side for inspection.
  var door=Mat(new Color(.13f,.56f,.76f));
  Cube("Door threshold",new Vector3(l/2,.025f,0),new Vector3(.08f,.05f,w),door,shell);
  if(plan.vehicle)ModelBox("Truck cab","truck-cab",new Vector3(-l/2-w*.64f,h*.43f,0),new Vector3(w*1.15f,h*1.03f,w),Mat(Color.white),shell);
  var palette=new Dictionary<string,Material>();
  for(int i=0;i<plan.placements.Length;i++) {
   var p=plan.placements[i]; string key=p.invalid?"#ef4444":p.color;
   if(string.IsNullOrEmpty(key)) key="#76b9de";
   if(!palette.ContainsKey(key)) {Color c; if(!ColorUtility.TryParseHtmlString(key,out c)) c=Color.cyan;palette[key]=Mat(p.invalid?new Color(1,.24f,.24f):Color.Lerp(Color.white,c,.30f));}
   var go=ModelBox("Cargo_"+i,"carton",new Vector3(p.x+p.length/2-l/2,p.z+p.height/2,p.y+p.width/2-w/2),new Vector3(p.length,p.height,p.width)*.99f,palette[key],cargoRoot,true); boxes.Add(go);
  }
  supportRoot=new GameObject("Pallets").transform; decorRoot=new GameObject("Securing").transform;
  var timber=Mat(Color.white);
  foreach(var p in plan.supports??new CargoBox[0]) {
   int index=supports.Count; var unit=new GameObject("Support_"+index); unit.transform.SetParent(supportRoot,false); unit.transform.position=Position(p);
   ModelBox("Support_"+index,string.IsNullOrEmpty(p.modelKey)?"wood-pallet":p.modelKey,Vector3.zero,new Vector3(p.length,p.height,p.width),timber,unit.transform,true); supports.Add(unit);
  }
  foreach(var p in plan.decorations??new Decoration[0]) {
   Color c; if(!ColorUtility.TryParseHtmlString(p.color,out c))c=Color.gray;
   var unit=new GameObject("Securing aid"); unit.transform.SetParent(decorRoot,false); unit.transform.position=Position(p);
   var size=new Vector3(p.length,p.height,p.width); var mat=Mat(string.IsNullOrEmpty(p.modelKey)?c:Color.white);
   if(p.wire)EdgeBox(Vector3.zero,size,mat,unit.transform,.008f);else ModelBox("Securing",p.modelKey,Vector3.zero,size,mat,unit.transform);
   if(p.supportIndex>=0&&p.supportIndex<supports.Count)unit.transform.SetParent(supports[p.supportIndex].transform,true);
  }
  weightRoot=new GameObject("Weight distribution").transform; cgRoot=new GameObject("Center of gravity").transform;
  float maxLoad=0; foreach(var cell in plan.cells??new WeightCell[0]) maxLoad=Mathf.Max(maxLoad,cell.loadKg);
  for(int i=0;i<(plan.cells??new WeightCell[0]).Length;i++) {
   var cell=plan.cells[i]; if(cell.loadKg<=0||maxLoad<=0)continue;
   float t=cell.loadKg/maxLoad,barHeight=Mathf.Max(.035f,t*h*.72f);
   Color color=t<.34f?Color.Lerp(new Color(.14f,.39f,.92f),new Color(.13f,.77f,.37f),t/.34f):t<.67f?Color.Lerp(new Color(.13f,.77f,.37f),new Color(.96f,.62f,.04f),(t-.34f)/.33f):Color.Lerp(new Color(.96f,.62f,.04f),new Color(.94f,.27f,.27f),(t-.67f)/.33f);
   Cube("Cell_"+i,new Vector3(cell.x+cell.length/2-l/2,.025f+barHeight/2,cell.y+cell.width/2-w/2),new Vector3(cell.length*.88f,barHeight,cell.width*.82f),Mat(color),weightRoot,true);
  }
  if(plan.centerOfGravity!=null&&plan.placements.Length>0) {
   var cg=plan.centerOfGravity; var purple=Mat(new Color(.49f,.23f,.93f)); var point=new Vector3(cg.x-l/2,cg.z+.04f,cg.y-w/2);
   Cube("CG stem",new Vector3(point.x,cg.z/2,point.z),new Vector3(.025f,Mathf.Max(.025f,cg.z),.025f),purple,cgRoot);
   var ball=GameObject.CreatePrimitive(PrimitiveType.Sphere);ball.transform.SetParent(cgRoot,false);ball.transform.position=point;ball.transform.localScale=Vector3.one*.16f;ball.GetComponent<Renderer>().sharedMaterial=purple;Destroy(ball.GetComponent<Collider>());
   var center=Mat(new Color(.06f,.46f,.43f));Cube("Container center X",new Vector3(0,.025f,0),new Vector3(.5f,.04f,.025f),center,cgRoot);Cube("Container center Z",new Vector3(0,.025f,0),new Vector3(.025f,.04f,.5f),center,cgRoot);
  }
  target=new Vector3(0,h*.40f,0); if(resize) { yaw=222; pitch=27; viewportAspect=cam.aspect; distance=FitDistance(viewportAspect); }
  UpdateVisibility(); CameraPose();
  AuditVisualBounds();
  Emit("{\"type\":\"planApplied\",\"revision\":"+plan.revision+",\"count\":"+boxes.Count+",\"modelCount\":"+models.instances+"}");
 }
 public void SetLabels(string json){
  var batch=JsonUtility.FromJson<CargoLabelBatch>(json);if(plan==null||batch==null||batch.revision!=plan.revision)return;
  labels.Apply(plan,boxes,batch,showLabels);WakeRendering();
  Emit("{\"type\":\"labelsApplied\",\"revision\":"+plan.revision+",\"faces\":"+labels.faces+"}");
 }
 void AuditVisualBounds(){
  int outside=0;float l=plan.container.length,w=plan.container.width,h=plan.container.height;
  for(int i=0;i<boxes.Count;i++){
   foreach(var renderer in boxes[i].GetComponentsInChildren<Renderer>()){
    if(!renderer.enabled)continue;var b=renderer.bounds;
    if(b.min.x < -l/2-.0001f||b.max.x>l/2+.0001f||b.min.y<-.0001f||b.max.y>h+.0001f||b.min.z < -w/2-.0001f||b.max.z>w/2+.0001f){outside++;break;}
   }
  }
  Emit("{\"type\":\"geometryAudit\",\"revision\":"+plan.revision+",\"outsideCargo\":"+outside+",\"interiorClipped\":true}");
 }
 Vector3 Position(CargoBox p) {return new Vector3(p.x+p.length/2-plan.container.length/2,p.z+p.height/2,p.y+p.width/2-plan.container.width/2);}
 void UpdateVisibility() {
  WakeRendering();
  for(int i=0;i<boxes.Count;i++)boxes[i].SetActive(!showWeight&&i<step&&plan.placements[i].z<plan.container.height*cut/100);
  if(supportRoot)supportRoot.gameObject.SetActive(!showWeight); if(decorRoot)decorRoot.gameObject.SetActive(!showWeight);
  if(weightRoot)weightRoot.gameObject.SetActive(showWeight); if(cgRoot)cgRoot.gameObject.SetActive(showWeight&&showCg);
  if(selection)selection.SetActive(selected>=0&&boxes[selected].activeSelf);
 }
 bool ValidPoses(float[] poses,int count) {
  if(poses==null||poses.Length!=count*7)return false;
  foreach(float f in poses)if(float.IsNaN(f)||float.IsInfinity(f))return false;
  for(int i=0;i<count;i++){int o=i*7;float q=0;for(int j=3;j<7;j++)q+=poses[o+j]*poses[o+j];if(q<.0001f)return false;}
  return true;
 }
 void ApplyPoses(List<GameObject> items,float[] poses) {
  for(int i=0;i<items.Count;i++){int o=i*7;items[i].transform.position=new Vector3(poses[o],poses[o+1],poses[o+2]);items[i].transform.rotation=new Quaternion(poses[o+3],poses[o+4],poses[o+5],poses[o+6]).normalized;}
 }
 public void SetFrame(string json) {
  var frame=JsonUtility.FromJson<CargoFrame>(json);
  if(plan==null||frame==null||frame.revision!=plan.revision||!ValidPoses(frame.cargo,boxes.Count)||!ValidPoses(frame.supports,supports.Count))return;
  playing=false;ApplyPoses(boxes,frame.cargo);ApplyPoses(supports,frame.supports);
  WakeRendering();
  Emit("{\"type\":\"frameApplied\",\"revision\":"+plan.revision+"}");
 }
 // Fit all eight equipment corners to the horizontal and vertical frustum.
 // This handles both narrow mobile canvases and wide packaging previews.
 float FitDistance(float aspect) {
  var s=plan.container;var inverse=Quaternion.Inverse(Quaternion.Euler(pitch,yaw,0));
  float vertical=Mathf.Tan(cam.fieldOfView*Mathf.Deg2Rad*.5f),horizontal=vertical*Mathf.Max(.1f,aspect),fit=.5f;
  for(int x=-1;x<=1;x+=2)for(int y=0;y<=1;y++)for(int z=-1;z<=1;z+=2){
   var p=inverse*(new Vector3((x<0&&plan.vehicle?-s.length*.5f-s.width*1.22f:x*s.length*.5f),y*s.height,z*s.width*.5f)-target);
   fit=Mathf.Max(fit,Mathf.Abs(p.x)/horizontal-p.z,Mathf.Abs(p.y)/vertical-p.z);
  }
  return fit*1.12f;
 }
 void CameraPose() { var position=target+Quaternion.Euler(pitch,yaw,0)*Vector3.back*distance;var rotation=Quaternion.LookRotation(target-position);if(cam.transform.position!=position||Quaternion.Angle(cam.transform.rotation,rotation)>.001f)WakeRendering();cam.transform.SetPositionAndRotation(position,rotation); }
 public void Command(string json) {
  var c=JsonUtility.FromJson<ViewerCommand>(json); if(c==null||plan==null)return;
  WakeRendering();
  switch(c.action) {
   case "labels":showLabels=c.value>0;labels.Show(showLabels);break;
   case "weight":showWeight=c.value>0;UpdateVisibility();break;
   case "cg":showCg=c.value>0;UpdateVisibility();break;
   case "cut":cut=Mathf.Clamp(c.value,1,100);UpdateVisibility();break;
   case "shell":shell.gameObject.SetActive(c.value>0);break;
   case "step":playing=false;step=Mathf.Clamp((int)c.value,0,boxes.Count);UpdateVisibility();break;
   case "play":playing=c.value>0;if(playing&&step>=boxes.Count)step=0;UpdateVisibility();break;
   case "select":Select((int)c.value,false);break;
   case "view":
    target=new Vector3(0,plan.container.height*.4f,0);
    if(c.view=="top"){pitch=89;yaw=0;} else if(c.view=="door"){pitch=0;yaw=-90;} else if(c.view=="side"){pitch=0;yaw=180;} else {pitch=27;yaw=222;}
    viewportAspect=cam.aspect;distance=FitDistance(viewportAspect);CameraPose();break;
  }
 }
 void Select(int index,bool notify) {
  WakeRendering();
  if(selection)Destroy(selection); selected=index>=0&&index<boxes.Count?index:-1;
  if(selected>=0){selection=new GameObject("Selection");var p=boxes[selected].transform;selection.transform.SetParent(p,false);EdgeBox(Vector3.zero,Vector3.one,highlight,selection.transform,.025f);selection.SetActive(boxes[selected].activeSelf);}
  if(notify)Emit("{\"type\":\"selection\",\"index\":"+selected+",\"revision\":"+plan.revision+"}");
 }
 void Update() {
  if(cam==null||plan==null)return;
  if(Mathf.Abs(cam.aspect-viewportAspect)>.01f){distance*=FitDistance(cam.aspect)/FitDistance(viewportAspect);viewportAspect=cam.aspect;}
  if(Input.GetMouseButtonDown(0)){mouseDown=Input.mousePosition;dragging=false;}
  if(Input.GetMouseButton(0)&&Vector3.Distance(mouseDown,Input.mousePosition)>4){dragging=true;yaw+=Input.GetAxis("Mouse X")*3;pitch=Mathf.Clamp(pitch-Input.GetAxis("Mouse Y")*3,5,89);}
  if(Input.GetMouseButton(1)){target-=cam.transform.right*Input.GetAxis("Mouse X")*distance*.015f;target-=cam.transform.up*Input.GetAxis("Mouse Y")*distance*.015f;}
  distance=Mathf.Clamp(distance*(1-Input.mouseScrollDelta.y*.08f),.5f,150);
  if(Input.GetMouseButtonUp(0)&&!dragging){RaycastHit hit;if(Physics.Raycast(cam.ScreenPointToRay(Input.mousePosition),out hit)){int idx;if(hit.collider.name.StartsWith("Cargo_")&&int.TryParse(hit.collider.name.Substring(6),out idx))Select(idx,true);
   else if(hit.collider.name.StartsWith("Support_")&&int.TryParse(hit.collider.name.Substring(8),out idx))Emit("{\"type\":\"support\",\"index\":"+idx+",\"revision\":"+plan.revision+"}");
   else if(hit.collider.name.StartsWith("Cell_")&&int.TryParse(hit.collider.name.Substring(5),out idx))Emit("{\"type\":\"cell\",\"index\":"+idx+",\"revision\":"+plan.revision+"}");}else Select(-1,true);}
  if(playing){clock+=Time.unscaledDeltaTime;if(clock>.25f){clock=0;step=Mathf.Min(step+1,boxes.Count);UpdateVisibility();Emit("{\"type\":\"step\",\"value\":"+step+",\"revision\":"+plan.revision+"}");if(step==boxes.Count)playing=false;}}
  if(Input.touchCount==2){var a=Input.GetTouch(0);var b=Input.GetTouch(1);float now=Vector2.Distance(a.position,b.position);float prev=Vector2.Distance(a.position-a.deltaPosition,b.position-b.deltaPosition);if(now>0)distance=Mathf.Clamp(distance*prev/now,.5f,150);}
  CameraPose();
  if(Screen.width!=viewportWidth||Screen.height!=viewportHeight){viewportWidth=Screen.width;viewportHeight=Screen.height;WakeRendering();}
  OnDemandRendering.renderFrameInterval=Time.unscaledTime<renderUntil?1:15;
 }
 void OnDestroy(){labels.Dispose();if(models!=null)models.Dispose();foreach(var m in ownedMaterials)Destroy(m);if(surface)Destroy(surface);}
}
