//Mesh attributes
attribute aPosition: vec3f;
attribute aColor: vec4f;

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

//Output to fragment shader
varying vColor: vec4f;
//varying vFogDepth: f32;//Might be omitted when calculating vFogDepth in the fragment shader

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output : VertexOutput;

    // Curve effect
    var worldPos = uniform.matrix_model * vec4<f32>(input.aPosition, 1.0);
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