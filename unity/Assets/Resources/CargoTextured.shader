Shader "Cargo/Textured" {
 Properties { _MainTex ("Base color",2D)="white" {} _Color ("Tint",Color)=(1,1,1,1) }
 SubShader { Tags { "RenderType"="Opaque" } Pass { CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #pragma multi_compile_instancing
 #include "UnityCG.cginc"
 sampler2D _MainTex; float4 _MainTex_ST; fixed4 _Color;
 struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;float2 uv:TEXCOORD0;UNITY_VERTEX_INPUT_INSTANCE_ID};
 struct v2f {float4 vertex:SV_POSITION;float3 normal:TEXCOORD0;float2 uv:TEXCOORD1;};
 v2f vert(appdata v){UNITY_SETUP_INSTANCE_ID(v);v2f o;o.vertex=UnityObjectToClipPos(v.vertex);o.normal=UnityObjectToWorldNormal(v.normal);o.uv=TRANSFORM_TEX(v.uv,_MainTex);return o;}
 fixed4 frag(v2f i):SV_Target {float3 n=normalize(i.normal);float key=saturate(dot(n,normalize(float3(.4,1,.6))));float fill=saturate(dot(n,normalize(float3(-.8,.4,-.3))));return fixed4(tex2D(_MainTex,i.uv).rgb*_Color.rgb*(.53+.38*key+.09*fill),1);}
 ENDCG } }
}
