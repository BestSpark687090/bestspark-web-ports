varying vUv0 : vec2f;
varying vFogFactor: f32;

uniform tintColor: vec3f;

uniform Global_FogColor: vec3f;
uniform fogToBlack: f32;

uniform Global_GreyScale: f32;
uniform Global_GreyScaleColor: vec3f;


var map: texture_2d<f32>;
var mapSampler: sampler;


 @fragment
 fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;

    // Sample
    let texColor : vec4<f32> = textureSample(map, mapSampler, input.vUv0);
    let alpha : f32 = texColor.a;
    
     // Early out for empty pixels
    if (alpha <= 0.001) {
        discard;
    }

    // Base color
    var color : vec3<f32> = texColor.rgb;

    // Tint
    color = color * uniform.tintColor;


    // Fog
    let fogTarget : vec3<f32> = mix(uniform.Global_FogColor, vec3<f32>(0.0, 0.0, 0.0), uniform.fogToBlack);
    color = mix(color, fogTarget, input.vFogFactor);

    // Greyscale effect (matches your GLSL exactly, even though it overrides 'color')
    let tintGrey : f32 = dot(uniform.tintColor, uniform.Global_GreyScaleColor);
    color = mix(uniform.tintColor, vec3<f32>(tintGrey, tintGrey, tintGrey), uniform.Global_GreyScale);

    // Glow color
    color = color * alpha;

    // Fog fades glow intensity (not color)
    color = color * (1.0 - input.vFogFactor);

    // Additive blending alpha is irrelevant
    output.color = vec4<f32>(color, 1.0);


    //  let emissionColor = textureSample(map, mapSampler, vUv0).rgb;

    //  // Linear fog factor
    //  let fogFactor = clamp((input.vFogDepth - 30.0) / 55.0, 0.0, 1.0);
    //  let finalColor = mix(emissionColor, uniform.fogColor, fogFactor);
    //  output.color = vec4<f32>(finalColor, 1.0);
     
     return output;
 }
