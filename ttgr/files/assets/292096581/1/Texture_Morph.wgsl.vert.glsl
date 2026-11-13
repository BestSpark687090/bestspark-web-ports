//Attributes (Input received from the Mesh)

    //Mesh attributes
attribute aPosition: vec3f;
attribute aUv0 : vec2f;

    //Skin attributes
attribute vertex_boneWeights: vec4f;
attribute vertex_boneIndices: vec4f;

    //Morph attributes
//attribute uint morph_vertex_id;
attribute morph_vertex_id: u32;

//Uniforms

    //Projection uniforms
uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;

    //Curve uniforms
uniform Global_CharacterPosZ: f32;
uniform Global_CurveCombined: vec3f;//Pre-combines direction and strength on the CPU
uniform curveScale: f32;// 0 = off, 1 = on

    //Fog uniformsFog
uniform fogScale: f32;// 0 = disabled, 1 = full fog (defaults to 1)

    //UV Offset uniforms
uniform emissiveMapTiling: vec2f;
uniform emissiveMapOffset: vec2f;

    //Skin uniforms
var texture_poseMap: texture_2d<uff>;

    //Morph uniforms
//uniform vec2 morph_tex_params;
uniform morph_tex_params: vec2f;
//uniform sampler2D morphPositionTex;
var morphPositionTex: texture_2d<f32>;


//Varyings (Output send to the fragment shader)
varying vFogFactor: f32;//Might be omitted when calculating vFogDepth in the fragment shader
varying vUv0 : vec2f;

fn getTextureMorphCoords() -> vec2i {

    // turn morph_vertex_id into int grid coordinates
    var textureSize: vec2i = vec2i(uniform.morph_tex_params);
    var morphGridV: i32 = i32(morph_vertex_id) / textureSize.x;
    var morphGridU: i32 = i32(morph_vertex_id) - (morphGridV * textureSize.x);
    morphGridV = textureSize.y - morphGridV - 1;
    return vec2i(morphGridU, morphGridV);
}


// fn _pcCopyInputs(input: VertexInput) {
//     vertex_position = vec4f(input.vertex_position);
//     morph_vertex_id = u32(input.morph_vertex_id);
//     vertex_boneWeights = vec4f(input.vertex_boneWeights);
//     vertex_boneIndices = vec4f(input.vertex_boneIndices);
//     vertex_texCoord0 = vec2f(input.vertex_texCoord0);

//     pcVertexIndex = input.vertexIndex;
//     pcInstanceIndex = input.instanceIndex;
// }

struct BoneMatrix {
    v1: vec4f,
    v2: vec4f,
    v3: vec4f,
}

fn getBoneMatrix(width: i32, index: i32) -> BoneMatrix {

    let v = index / width;
    let u = index % width;

    var result: BoneMatrix;
    result.v1 = textureLoad(texture_poseMap, vec2i(u + 0, v), 0);
    result.v2 = textureLoad(texture_poseMap, vec2i(u + 1, v), 0);
    result.v3 = textureLoad(texture_poseMap, vec2i(u + 2, v), 0);
    return result;
}

fn getSkinMatrix(indicesFloat: vec4f, weights: vec4f) -> mat4x4f {

    let width = i32(textureDimensions(texture_poseMap).x);
    var indices = vec4i(indicesFloat + 0.5) * 3;

    let boneA = getBoneMatrix(width, indices.x);
    let boneB = getBoneMatrix(width, indices.y);
    let boneC = getBoneMatrix(width, indices.z);
    let boneD = getBoneMatrix(width, indices.w);

    // ... rest of getSkinMatrix remains the same ...
    let v1 = boneA.v1 * weights.x + boneB.v1 * weights.y + boneC.v1 * weights.z + boneD.v1 * weights.w;
    let v2 = boneA.v2 * weights.x + boneB.v2 * weights.y + boneC.v2 * weights.z + boneD.v2 * weights.w;
    let v3 = boneA.v3 * weights.x + boneB.v3 * weights.y + boneC.v3 * weights.z + boneD.v3 * weights.w;

    let one = dot(weights, vec4f(1.0, 1.0, 1.0, 1.0));

    // transpose to 4x4 matrix
    return mat4x4f(
        v1.x, v2.x, v3.x, 0,
        v1.y, v2.y, v3.y, 0,
        v1.z, v2.z, v3.z, 0,
        v1.w, v2.w, v3.w, one
    );
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    _pcCopyInputs(input);


    var output: VertexOutput;

    //output.vUv0 = input.aUv0;
    output.vUv0 = (input.aUv0 * uniform.emissiveMapTiling) + uniform.emissiveMapOffset;

        //Rig matrix conversion
    let dModelMatrix = uniform.matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);

//
    //vUv0 = (aUv0 * emissiveMapTiling) + emissiveMapOffset;

    //Rig matrix conversion
    //mat4 dModelMatrix = matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);

    //NEW adjusting aPos locally before it gets converted to WorldSpace
    //ivec2 morphUV = getTextureMorphCoords();
    var morphUV: vec2i = getTextureMorphCoords();

    //MAYBE OPTHER LINE
    //vec3 morphPos = texelFetch(morphPositionTex, ivec2(morphUV), 0).xyz;
    var morphPos: vec3f = textureLoad(morphPositionTex, morphUV, 0).xyz;

    //vec3 localPos = aPosition + morphPos;
    var localPos: vec3f = aPosition + morphPos;

    // Curve-effect | Converts localPos to worldPos
    //vec4 worldPos = dModelMatrix * vec4(localPos, 1.0);
    var worldPos = dModelMatrix * vec4<f32>(localPos, 1.0);
//

    // Curve effect
    //var worldPos = dModelMatrix * vec4<f32>(input.aPosition, 1.0);
    let delta = uniform.Global_CharacterPosZ - worldPos.z;
    let d2 = delta * delta;
    let d3 = delta * d2;
    let curveOffset = d3 * uniform.Global_CurveCombined * uniform.curveScale;
    worldPos = worldPos - vec4<f32>(curveOffset, 0.0);

    // Clip-space position (screen [-1 to 1] on both axis)
    output.position = uniform.matrix_viewProjection * worldPos;

    output.vFogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * uniform.fogScale;

    return output;
}

