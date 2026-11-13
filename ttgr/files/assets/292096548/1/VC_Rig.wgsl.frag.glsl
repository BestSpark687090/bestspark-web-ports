varying vColor: vec4f;
//varying vFogDepth: f32;

//uniform fogColor : vec3f;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    
    // Linear fog factor
    // let fogFactor = clamp((input.vFogDepth - 30.0) / 55.0, 0.0, 1.0);
    // let finalColor = mix(input.vColor.rgb, uniform.fogColor, fogFactor);
    // output.color = vec4<f32>(finalColor, input.vColor.a);

    output.color = input.vColor;

    return output;
}
