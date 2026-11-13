attribute aPosition: vec3f;
attribute aColor: vec4f;

uniform matrix_model: mat4x4f;
uniform matrix_view: mat4x4f;//Might be omitted when calculating vFogDepth in the fragment shader
uniform matrix_viewProjection: mat4x4f;

varying vColor: vec4f;
varying vFogDepth: f32;//Might be omitted when calculating vFogDepth in the fragment shader

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output : VertexOutput;

    output.vColor = input.aColor;
  
    var worldPos = uniform.matrix_model * vec4<f32>(input.aPosition, 1.0);

    // View-space position
    let viewPos = uniform.matrix_view * worldPos;
    // Store positive depth
    output.vFogDepth = -viewPos.z;

    // Clip-space position
    output.position = uniform.matrix_viewProjection * worldPos;
    
    return output;
}


//Many optimization ideas from ChatGPT: https://chatgpt.com/g/g-p-6911d7f35b248191a83d55c8d65a5551-talking-tom-gold-run/c/695e1d05-05ec-8329-bd3f-c9aa1246f284

//Do this once on CPU:
//Global_CurveStrengthScaled = Global_CurveStrength * 0.0001;




