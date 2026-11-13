//Mesh attributes
attribute vec3 aPosition;
attribute vec2 aUv0;

attribute vec4 vertex_boneWeights;
attribute vec4 vertex_boneIndices;
uniform highp sampler2D texture_poseMap;
//#define SKIN true

uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

uniform float Global_CharacterPosZ;

//Curve
uniform vec3 Global_CurveCombined;//Pre-combines direction and strength on the CPU
uniform float curveScale;// 0 = off, 1 = on

//Fog
uniform float fogScale;// 0 = disabled, 1 = full fog (defaults to 1)

//Offset for the eyes
uniform vec2 emissiveMapTiling;
uniform vec2 emissiveMapOffset;

varying float vFogFactor;//Might be omitted when calculating vFogDepth in the fragment shader
varying vec2 vUv0;

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
    vUv0 = (aUv0 * emissiveMapTiling) + emissiveMapOffset;
    //vUv0 = aUv0;

    //Rig matrix conversion
    mat4 dModelMatrix = matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);

    // Curve-effect | Converts localPos to worldPos
    vec4 worldPos = dModelMatrix * vec4(aPosition, 1.0);

    // Curve effect
    float delta = Global_CharacterPosZ - worldPos.z;
    float d2 = delta * delta;
    float d3 = delta * d2;
    worldPos.xyz -= d3 * Global_CurveCombined * curveScale;

    // Clip-space position
    gl_Position = matrix_viewProjection * worldPos;

    vFogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * fogScale;
}