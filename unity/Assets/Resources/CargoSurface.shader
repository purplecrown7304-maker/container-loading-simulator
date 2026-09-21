Shader "Cargo/Surface" {
Properties { _Color ("Color", Color) = (1,1,1,1) }
SubShader { Tags { "RenderType"="Opaque" } Pass { CGPROGRAM
#pragma vertex vert
#pragma fragment frag
#include "UnityCG.cginc"
fixed4 _Color;
struct v2f { float4 vertex:SV_POSITION; float3 normal:TEXCOORD0; };
v2f vert(appdata_base v) { v2f o; o.vertex=UnityObjectToClipPos(v.vertex); o.normal=UnityObjectToWorldNormal(v.normal); return o; }
fixed4 frag(v2f i):SV_Target { float light=.62+.38*max(0,dot(normalize(i.normal),normalize(float3(.4,1,.6)))); return fixed4(_Color.rgb*light,1); }
ENDCG } } }
