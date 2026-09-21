using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;

[Serializable] public class SpaceSpec { public float length,width,height; }
[Serializable] public class CargoBox { public string cargoId,color; public float x,y,z,length,width,height,weightKg; public bool invalid; }
[Serializable] public class CargoPlan { public int revision; public SpaceSpec container; public CargoBox[] placements; }
[Serializable] public class ViewerCommand { public string action; public float value; public string view; }
public class CargoViewer : MonoBehaviour {
 [DllImport("__Internal")] static extern void CargoEvent(string json);
 Camera cam; Transform shell,cargoRoot; CargoPlan plan;
 readonly List<GameObject> boxes=new List<GameObject>(); readonly List<Material> ownedMaterials=new List<Material>();
 Material surface,highlight; float yaw=222,pitch=27,distance=14; Vector3 target; Vector3 mouseDown; bool dragging;
 float cut=100; int step; int selected=-1; bool playing; float clock; GameObject selection;
 void Emit(string json) {
 #if UNITY_WEBGL && !UNITY_EDITOR
 CargoEvent(json);
 #endif
 }
 void Start() {
  Application.targetFrameRate=45; QualitySettings.antiAliasing=4;
  #if UNITY_WEBGL && !UNITY_EDITOR
  WebGLInput.captureAllKeyboardInput=false;
  #endif
  cam=new GameObject("Camera").AddComponent<Camera>(); cam.clearFlags=CameraClearFlags.SolidColor; cam.backgroundColor=new Color(.925f,.953f,.975f); cam.fieldOfView=40; cam.nearClipPlane=.02f; cam.farClipPlane=500;
  surface=new Material(Resources.Load<Shader>("CargoSurface"));
  Emit("{\"type\":\"ready\"}");
 }
 Material Mat(Color color) { var m=new Material(surface); m.color=color; ownedMaterials.Add(m); return m; }
 GameObject Cube(string name,Vector3 pos,Vector3 size,Material mat,Transform parent,bool collider=false) {
  var go=GameObject.CreatePrimitive(PrimitiveType.Cube); go.name=name; go.transform.SetParent(parent,false); go.transform.localPosition=pos; go.transform.localScale=size; go.GetComponent<Renderer>().sharedMaterial=mat;
  if(!collider) Destroy(go.GetComponent<Collider>()); return go;
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
  bool resize=plan==null||plan.container.length!=next.container.length||plan.container.width!=next.container.width||plan.container.height!=next.container.height;
  if(shell) Destroy(shell.gameObject); if(cargoRoot) Destroy(cargoRoot.gameObject); if(selection) Destroy(selection);
  foreach(var m in ownedMaterials) Destroy(m); ownedMaterials.Clear(); boxes.Clear(); selected=-1;
  plan=next; playing=false; step=plan.placements.Length;
  shell=new GameObject("Equipment").transform; cargoRoot=new GameObject("Cargo").transform;
  var s=plan.container; float l=s.length,w=s.width,h=s.height;
  highlight=Mat(new Color(1,.6f,.04f));
  var floor=Mat(new Color(.65f,.73f,.79f)); var frame=Mat(new Color(.20f,.37f,.48f)); var wall=Mat(new Color(.76f,.83f,.88f)); var grid=Mat(new Color(.82f,.87f,.9f));
  Cube("Floor",new Vector3(0,-.055f,0),new Vector3(l,.11f,w),floor,shell);
  EdgeBox(new Vector3(0,h/2,0),new Vector3(l,h,w),frame,shell,.035f);
  Cube("Back wall",new Vector3(-l/2-.025f,h/2,0),new Vector3(.05f,h,w),wall,shell);
  Cube("Far wall",new Vector3(0,h/2,-w/2-.025f),new Vector3(l,h,.05f),wall,shell);
  for(float x=-l/2;x<l/2;x+=.3f) Cube("Corrugation",new Vector3(x,h/2,-w/2+.01f),new Vector3(.025f,h,.025f),floor,shell);
  for(float x=-l/2;x<=l/2;x+=1) Cube("Floor grid",new Vector3(x,.002f,0),new Vector3(.009f,.004f,w),grid,shell);
  for(float z=-w/2;z<=w/2;z+=.5f) Cube("Floor grid",new Vector3(0,.002f,z),new Vector3(l,.004f,.009f),grid,shell);
  // Door is the +X end. The model is cut open on the near side for inspection.
  var door=Mat(new Color(.13f,.56f,.76f));
  Cube("Door threshold",new Vector3(l/2,.025f,0),new Vector3(.08f,.05f,w),door,shell);
  var palette=new Dictionary<string,Material>();
  for(int i=0;i<plan.placements.Length;i++) {
   var p=plan.placements[i]; string key=p.invalid?"#ef4444":p.color;
   if(string.IsNullOrEmpty(key)) key="#76b9de";
   if(!palette.ContainsKey(key)) {Color c; if(!ColorUtility.TryParseHtmlString(key,out c)) c=Color.cyan;palette[key]=Mat(c);}
   var go=Cube("Cargo_"+i,new Vector3(p.x+p.length/2-l/2,p.z+p.height/2+.007f,p.y+p.width/2-w/2),new Vector3(p.length,p.height,p.width)*.99f,palette[key],cargoRoot,true); boxes.Add(go);
  }
  target=new Vector3(0,h*.40f,0); if(resize) { distance=Mathf.Max(l,w,h)*1.3f; yaw=222; pitch=27; }
  UpdateVisibility(); CameraPose();
  Emit("{\"type\":\"planApplied\",\"revision\":"+plan.revision+",\"count\":"+boxes.Count+"}");
 }
 void UpdateVisibility() { for(int i=0;i<boxes.Count;i++) boxes[i].SetActive(i<step && plan.placements[i].z<plan.container.height*cut/100); if(selection) selection.SetActive(selected>=0&&boxes[selected].activeSelf); }
 void CameraPose() { cam.transform.position=target+Quaternion.Euler(pitch,yaw,0)*Vector3.back*distance; cam.transform.LookAt(target); }
 public void Command(string json) {
  var c=JsonUtility.FromJson<ViewerCommand>(json); if(c==null||plan==null)return;
  switch(c.action) {
   case "cut":cut=Mathf.Clamp(c.value,1,100);UpdateVisibility();break;
   case "shell":shell.gameObject.SetActive(c.value>0);break;
   case "step":playing=false;step=Mathf.Clamp((int)c.value,0,boxes.Count);UpdateVisibility();break;
   case "play":playing=c.value>0;if(playing&&step>=boxes.Count)step=0;UpdateVisibility();break;
   case "select":Select((int)c.value,false);break;
   case "view":
    target=new Vector3(0,plan.container.height*.4f,0); distance=Mathf.Max(plan.container.length,plan.container.width,plan.container.height)*1.3f;
    if(c.view=="top"){pitch=89;yaw=0;} else if(c.view=="door"){pitch=0;yaw=-90;} else if(c.view=="side"){pitch=0;yaw=180;} else {pitch=27;yaw=222;} CameraPose();break;
  }
 }
 void Select(int index,bool notify) {
  if(selection)Destroy(selection); selected=index>=0&&index<boxes.Count?index:-1;
  if(selected>=0){selection=new GameObject("Selection");var p=boxes[selected].transform;EdgeBox(p.position,p.localScale,highlight,selection.transform,.025f);selection.SetActive(boxes[selected].activeSelf);}
  if(notify)Emit("{\"type\":\"selection\",\"index\":"+selected+"}");
 }
 void Update() {
  if(cam==null||plan==null)return;
  if(Input.GetMouseButtonDown(0)){mouseDown=Input.mousePosition;dragging=false;}
  if(Input.GetMouseButton(0)&&Vector3.Distance(mouseDown,Input.mousePosition)>4){dragging=true;yaw+=Input.GetAxis("Mouse X")*3;pitch=Mathf.Clamp(pitch-Input.GetAxis("Mouse Y")*3,5,89);}
  if(Input.GetMouseButton(1)){target-=cam.transform.right*Input.GetAxis("Mouse X")*distance*.015f;target-=cam.transform.up*Input.GetAxis("Mouse Y")*distance*.015f;}
  distance=Mathf.Clamp(distance*(1-Input.mouseScrollDelta.y*.08f),.5f,150);
  if(Input.GetMouseButtonUp(0)&&!dragging){RaycastHit hit;if(Physics.Raycast(cam.ScreenPointToRay(Input.mousePosition),out hit)){int idx;if(hit.collider.name.StartsWith("Cargo_")&&int.TryParse(hit.collider.name.Substring(6),out idx))Select(idx,true);}else Select(-1,true);}
  if(playing){clock+=Time.unscaledDeltaTime;if(clock>.25f){clock=0;step=Mathf.Min(step+1,boxes.Count);UpdateVisibility();Emit("{\"type\":\"step\",\"value\":"+step+"}");if(step==boxes.Count)playing=false;}}
  if(Input.touchCount==2){var a=Input.GetTouch(0);var b=Input.GetTouch(1);float now=Vector2.Distance(a.position,b.position);float prev=Vector2.Distance(a.position-a.deltaPosition,b.position-b.deltaPosition);if(now>0)distance=Mathf.Clamp(distance*prev/now,.5f,150);}
  CameraPose();
 }
 void OnDestroy(){foreach(var m in ownedMaterials)Destroy(m);if(surface)Destroy(surface);}
}
