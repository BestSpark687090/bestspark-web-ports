//Mesh attributes
attribute aPosition: vec3f;
attribute aColor: vec4f;

//Instance attributes
attribute instance_pos: vec3f;
attribute instance_rot: vec2f;

uniform matrix_viewProjection: mat4x4f;
uniform Global_CharacterPosZ: f32;

//Curve
uniform Global_CurveCombined: vec3f;//Pre-combines direction and strength on the CPU
uniform curveScale: f32;// 0 = off, 1 = on (defaults to 0)

//Color modifiers
uniform Global_GreyScale: f32;
uniform Global_GreyScaleColor: vec3f;

uniform addColor: vec3f;

uniform Global_FogColor: vec3f;
uniform fogScale: f32;

// uniform tintColor: vec3f;
// uniform fogToBlack: f32;

//Output to fragment shader
varying vColor: vec4f;
//varying vFogDepth: f32;//Might be omitted when calculating vFogDepth in the fragment shader


@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output : VertexOutput;

    var localPos : vec3<f32> = input.aPosition;

    // Rotate around Y
    let s : f32 = input.instance_rot.x;
    let c : f32 = input.instance_rot.y;

    var rotated : vec3<f32>;
    rotated.x = localPos.x * c - localPos.z * s;
    rotated.y = localPos.y;
    rotated.z = localPos.x * s + localPos.z * c;

    // Apply Translation
    var worldPos : vec3<f32> = rotated + input.instance_pos;


    // Curve-effect
    let delta : f32 = uniform.Global_CharacterPosZ - worldPos.z;
    let d2 : f32 = delta * delta;
    let d3 : f32 = delta * d2;
    worldPos = worldPos - (d3 * uniform.Global_CurveCombined * uniform.curveScale);

    // Clip-space position
    output.position = uniform.matrix_viewProjection * vec4<f32>(worldPos, 1.0);

    // Base color + Additive-effect
    var color : vec3<f32> = input.aColor.rgb + uniform.addColor;

    // Fog-effect
    // fogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * fogScale;
    let fogFactor : f32 = clamp(((-delta - 30.0) / 55.0), 0.0, 1.0) * uniform.fogScale;
    color = mix(color, uniform.Global_FogColor, fogFactor);

    // GreyScale-effect
    let grey : f32 = dot(color, uniform.Global_GreyScaleColor);
    color = mix(color, vec3<f32>(grey), uniform.Global_GreyScale);

    // Preserve incoming alpha
    output.vColor = vec4<f32>(color, input.aColor.a);



    // var worldPos = uniform.matrix_model * vec4<f32>(input.aPosition, 1.0);

    // // Curve effect 
    // //let delta = uniform.Global_CharacterPosZ - worldPos.z;
    // //let vert_curve_strenght = (delta * delta * delta) * uniform.Global_CurveStrenght;
    // //let worldCurve = (uniform.Global_CurveDirection * vert_curve_strenght);
    // //worldPos.xyz -= worldCurve;

    // // Curve effect optimized
    // let delta = uniform.Global_CharacterPosZ - worldPos.z;
    // let d2 = delta * delta;
    // let d3 = delta * d2;
    // let worldCurve = d3 * uniform.Global_CurveCombined;

    // worldPos = vec4<f32>(worldPos.xyz - worldCurve, worldPos.w);

    // // View-space position
    // //let viewPos = uniform.matrix_view * worldPos;
    // // Store positive depth
    // //output.vFogDepth = -viewPos.z;

    // output.vFogDepth = -delta;

    // // Clip-space position
    // output.position = uniform.matrix_viewProjection * worldPos;
    





    // output.vColor = input.aColor;

    return output;
}