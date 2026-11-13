//Mesh attributes
attribute aPosition: vec3f;
attribute aColor: vec4f;
attribute aUv0 : vec2f;

uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;


uniform Global_CharacterPosZ: f32;

//Curve
uniform Global_CurveCombined: vec3f;//Pre-combines direction and strength on the CPU
uniform curveScale: f32;// 0 = off, 1 = on

//Fog
uniform fogScale: f32;// 0 = disabled, 1 = full fog (defaults to 1)

varying vFogFactor: f32;//Might be omitted when calculating vFogDepth in the fragment shader
varying vUv0 : vec2f;
varying vColor : vec4f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.vUv0 = input.aUv0;

    // Curve effect
    var worldPos = uniform.matrix_model * vec4<f32>(input.aPosition, 1.0);
    let delta = uniform.Global_CharacterPosZ - worldPos.z;
    let d2 = delta * delta;
    let d3 = delta * d2;
    let curveOffset = d3 * uniform.Global_CurveCombined * uniform.curveScale;
    worldPos = worldPos - vec4<f32>(curveOffset, 0.0);

    // Clip-space position (screen [-1 to 1] on both axis)
    output.position = uniform.matrix_viewProjection * worldPos;

    output.vFogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * uniform.fogScale;
    output.vColor = input.aColor;

    return output;
}

