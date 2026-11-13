//Mesh attributes
attribute aPosition: vec3f;
attribute aUv0 : vec2f;

//instance attributes
attribute instance_pos: vec3f;

uniform matrix_viewProjection: mat4x4f;
uniform Global_CharacterPosZ: f32;

//Curve
uniform Global_CurveCombined: vec3f;
uniform curveScale: f32;

uniform fogScale: f32;

varying vFogFactor: f32;//Might be omitted when calculating vFogDepth in the fragment shader
varying vUv0 : vec2f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // Translate (local -> world)
    var worldPos : vec3<f32> = input.aPosition + input.instance_pos;

    // Curve-effect
    let delta : f32 = uniform.Global_CharacterPosZ - worldPos.z;
    let d2 : f32 = delta * delta;
    let d3 : f32 = delta * d2;
    worldPos = worldPos - (d3 * uniform.Global_CurveCombined * uniform.curveScale);

    // Clip-space position
    output.position = uniform.matrix_viewProjection * vec4<f32>(worldPos, 1.0);

    // Fog factor
    output.vFogFactor = clamp(((-delta - 30.0) / 55.0), 0.0, 1.0) * uniform.fogScale;

    // UV
    output.vUv0 = input.aUv0;

    return output;
}

