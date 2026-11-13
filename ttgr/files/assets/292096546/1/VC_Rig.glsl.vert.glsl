//Mesh attributes
attribute vec3 aPosition;
attribute vec4 aColor;


attribute vec4 vertex_boneWeights;
attribute vec4 vertex_boneIndices;
uniform highp sampler2D texture_poseMap;
//#define SKIN true


uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

uniform float Global_CharacterPosZ;

//Curve
uniform vec3 Global_CurveCombined;//Pre-combines direction and strength on the CPU
uniform float curveScale;// 0 = off, 1 = on (defaults to 0)

//Color modifiers
uniform vec3 tintColor;//defaults to new Color(1,1,1)
uniform vec3 addColor;//defaults to new Color(0,0,0))

uniform vec3 Global_FogColor;
uniform float fogScale;// 0 = disabled, 1 = full fog (defaults to 1)
uniform float fogToBlack; // 0.0 = opaque fog, 1.0 = additive fog

uniform float Global_GreyScale; // 0 = color, 1 = greyscale (defaults to 0)
uniform vec3 Global_GreyScaleColor;

uniform float Global_GammaBlend;

//Output to fragment shader
varying vec4 vColor;
//varying float vFogDepth;//Might be omitted when calculating vFogDepth in the fragment shader


void getBoneMatrix(const in int width, const in int index, out vec4 v1, out vec4 v2, out vec4 v3) {
    int v = index / width;
    int u = index % width;
    v1 = texelFetch(texture_poseMap, ivec2(u + 0, v), 0);
    v2 = texelFetch(texture_poseMap, ivec2(u + 1, v), 0);
    v3 = texelFetch(texture_poseMap, ivec2(u + 2, v), 0);
}

mat4 getSkinMatrix(const in vec4 indicesFloat, const in vec4 weights) {
    int width = textureSize(texture_poseMap, 0).x;
    ivec4 indices = ivec4(indicesFloat + 0.5) * 3;
    vec4 a1, a2, a3;
    getBoneMatrix(width, indices.x, a1, a2, a3);
    vec4 b1, b2, b3;
    getBoneMatrix(width, indices.y, b1, b2, b3);
    vec4 c1, c2, c3;
    getBoneMatrix(width, indices.z, c1, c2, c3);
    vec4 d1, d2, d3;
    getBoneMatrix(width, indices.w, d1, d2, d3);
    vec4 v1 = a1 * weights.x + b1 * weights.y + c1 * weights.z + d1 * weights.w;
    vec4 v2 = a2 * weights.x + b2 * weights.y + c2 * weights.z + d2 * weights.w;
    vec4 v3 = a3 * weights.x + b3 * weights.y + c3 * weights.z + d3 * weights.w;
    float one = dot(weights, vec4(1.0));
    return mat4(
    v1.x, v2.x, v3.x, 0, v1.y, v2.y, v3.y, 0, v1.z, v2.z, v3.z, 0, v1.w, v2.w, v3.w, one
    );
}

void main(void)
{
    //Rig matrix conversion
    mat4 dModelMatrix = matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);

    // Curve-effect
    vec4 worldPos = dModelMatrix * vec4(aPosition, 1.0);

    float delta = Global_CharacterPosZ - worldPos.z;
    float d2 = delta * delta;
    float d3 = delta * d2;
    worldPos.xyz -= d3 * Global_CurveCombined * curveScale;

    // Clip-space position (screen [-1 to 1] on both axis)
    gl_Position = matrix_viewProjection * worldPos;

    //Base color information
    vec3 color = aColor.rgb;

    //Apply tint effect
    color *= tintColor;//defaults to [1,1,1] (no change)

    //Apply add effect
    color += addColor;//addColor defaults to [0,0,0,0] (no change)

    //Fog effect
    float fogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * fogScale;//Range[0 - 1] or 0 when fogScale is set to 0

    vec3 fogTarget = mix(Global_FogColor, vec3(0.0), fogToBlack);
    color = mix(color, fogTarget, fogFactor);

    color = mix(color, pow(color, vec3(2.2)), Global_GammaBlend);

    //GreyScale-effect
    float grey = dot(color, Global_GreyScaleColor);
    color.rgb = mix(color.rgb, vec3(grey), Global_GreyScale);

    vColor = vec4(color, aColor.a);//Not sure about alpha value here...
}

