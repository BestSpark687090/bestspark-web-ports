//Mesh attributes
attribute aPosition: vec3f;
attribute aColor: vec4f;

attribute vertex_boneWeights: vec4f;
attribute vertex_boneIndices: vec4f;

uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;

uniform Global_CharacterPosZ: f32;

//Curve
uniform Global_CurveCombined: vec3f;
uniform curveScale: f32;

//Color modifiers
uniform tintColor: vec3f;
uniform addColor: vec3f;

uniform Global_FogColor: vec3f;
uniform fogScale: f32;
uniform fogToBlack: f32;

uniform Global_GreyScale: f32;
uniform Global_GreyScaleColor: vec3f;

uniform Global_GammaBlend: f32;

var texture_poseMap: texture_2d<uff>;

//Output to fragment shader
varying vColor: vec4f;
//varying vFogDepth: f32;//Might be omitted when calculating vFogDepth in the fragment shader

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

    var output : VertexOutput;

    //Rig matrix conversion
    let dModelMatrix = uniform.matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);

    // Curve effect
    var worldPos = dModelMatrix * vec4<f32>(input.aPosition, 1.0);
    let delta = uniform.Global_CharacterPosZ - worldPos.z;
    let d2 = delta * delta;
    let d3 = delta * d2;
    let curveOffset = d3 * uniform.Global_CurveCombined * uniform.curveScale;
    worldPos = worldPos - vec4<f32>(curveOffset, 0.0);

    // Clip-space position (screen [-1 to 1] on both axis)
    output.position = uniform.matrix_viewProjection * worldPos;


    // Base color information
    var color = input.aColor.rgb;

    // Apply tint
    color = color * uniform.tintColor;

    // Apply add effect
    color = color + uniform.addColor;


    // Fog
    let fogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * uniform.fogScale;
    let fogTarget = mix(uniform.Global_FogColor, vec3<f32>(0.0, 0.0, 0.0), uniform.fogToBlack);
    color = mix(color, fogTarget, fogFactor);

    //RenderTexture gamma correction
    color = mix(color, pow(color, vec3<f32>(2.2)), uniform.Global_GammaBlend);

    // GreyScale
    let grey = dot(color, uniform.Global_GreyScaleColor);
    color = mix(color, vec3<f32>(grey, grey, grey), uniform.Global_GreyScale);

    output.vColor = vec4<f32>(color, input.aColor.a);

    return output;
}