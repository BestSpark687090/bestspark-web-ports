//Mesh attributes
varying vUv0 : vec2f;
varying vFogFactor: f32;
varying vColor: vec4f;
 
uniform Global_FogColor: vec3f;
uniform Global_GreyScale: f32;
uniform Global_GreyScaleColor: vec3f;

uniform emissive_color: vec4f;

uniform Global_GammaBlend: f32;

var emissive_texture: texture_2d<f32>;
var emissive_textureSampler: sampler;

 @fragment
 fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;

    let tex_color = textureSample(emissive_texture, emissive_textureSampler, input.vUv0);

    var color = tex_color.rgb * uniform.emissive_color.rgb;
    //color *= (1.0 - vFogFactor);

    // Fog effect
    color = mix(color, uniform.Global_FogColor, input.vFogFactor);

    //RenderTexture gamma correction
    color = mix(color, pow(color, vec3<f32>(2.2)), uniform.Global_GammaBlend);

    //GreyScale-effect
    let grey = dot(color, uniform.Global_GreyScaleColor);
    color = mix(color, vec3<f32>(grey, grey, grey), uniform.Global_GreyScale);

    output.color = vec4<f32>(color, input.vColor.a);
     
    return output;
 }
