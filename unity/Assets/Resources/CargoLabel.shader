Shader "Cargo/Label" {
 Properties { _MainTex ("Printed information",2D)="white" {} }
 SubShader { Tags { "RenderType"="Opaque" } Pass { Cull Off ZWrite On
 CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #pragma multi_compile_instancing
 #include "UnityCG.cginc"
 sampler2D _MainTex;
 struct appdata {float4 vertex:POSITION;float2 uv:TEXCOORD0;UNITY_VERTEX_INPUT_INSTANCE_ID};
 struct v2f {float4 vertex:SV_POSITION;float2 uv:TEXCOORD0;};
 v2f vert(appdata v){UNITY_SETUP_INSTANCE_ID(v);v2f o;o.vertex=UnityObjectToClipPos(v.vertex);o.uv=v.uv;return o;}
 fixed4 frag(v2f i):SV_Target {return tex2D(_MainTex,i.uv);}
 ENDCG } }
}
