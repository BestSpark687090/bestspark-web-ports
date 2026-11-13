//Attributes (Input received from the Mesh)

    //Mesh attributes
attribute vec3 aPosition;
attribute vec2 aUv0;

    //Skin attributes
attribute vec4 vertex_boneWeights;
attribute vec4 vertex_boneIndices;

    //Morph attributes
attribute uint morph_vertex_id;


//Uniforms

    //Projection uniforms
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

    //Curve uniforms
uniform float Global_CharacterPosZ;
uniform vec3 Global_CurveCombined;//Pre-combines direction and strength on the CPU
uniform float curveScale;// 0 = off, 1 = on

    //Fog uniforms
uniform float fogScale;// 0 = disabled, 1 = full fog (defaults to 1)

    //UV Offset uniforms
uniform vec2 emissiveMapTiling;
uniform vec2 emissiveMapOffset;

    //Skin uniforms
uniform highp sampler2D texture_poseMap;

    //Morph uniforms
uniform vec2 morph_tex_params;
uniform sampler2D morphPositionTex;

//Varyings (Output send to the fragment shader)
varying float vFogFactor;//Might be omitted when calculating vFogDepth in the fragment shader
varying vec2 vUv0;

//Methods
ivec2 getTextureMorphCoords() {
    ivec2 textureSize = ivec2(morph_tex_params);
    int morphGridV = int(morph_vertex_id) / textureSize.x;
    int morphGridU = int(morph_vertex_id) - (morphGridV * textureSize.x);
    return ivec2(morphGridU, morphGridV);
}

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

    //Rig matrix conversion
    mat4 dModelMatrix = matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);

    //NEW adjusting aPos locally before it gets converted to WorldSpace
    ivec2 morphUV = getTextureMorphCoords();
    vec3 morphPos = texelFetch(morphPositionTex, ivec2(morphUV), 0).xyz;

    vec3 localPos = aPosition + morphPos;

    // Curve-effect | Converts localPos to worldPos
    vec4 worldPos = dModelMatrix * vec4(localPos, 1.0);

    // Curve effect
    float delta = Global_CharacterPosZ - worldPos.z;
    float d2 = delta * delta;
    float d3 = delta * d2;
    worldPos.xyz -= d3 * Global_CurveCombined * curveScale;

    // Clip-space position
    gl_Position = matrix_viewProjection * worldPos;

    vFogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * fogScale;
}