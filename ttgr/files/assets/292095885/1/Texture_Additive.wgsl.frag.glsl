 //Mesh attributes
 varying vUv0 : vec2f;
 varying vFogFactor: f32;
 
uniform Global_FogColor: vec3f;
uniform Global_GreyScale: f32;
uniform Global_GreyScaleColor: vec3f;

uniform emissive_color: vec4f;

var emissive_texture: texture_2d<f32>;
var emissive_textureSampler: sampler;

 @fragment
 fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;

   let emission = textureSample(emissive_texture, emissive_textureSampler, input.vUv0).a;

   if (emission <= 0.001) {
      discard;
   }

   var tint = uniform.emissive_color.rgb;

   // Greyscale on tint
   let tintGrey = dot(tint, uniform.Global_GreyScaleColor);
   tint = mix(tint, vec3<f32>(tintGrey, tintGrey, tintGrey), uniform.Global_GreyScale);

   // Glow color
   var color = tint * emission;

   // Fog fades glow intensity (not color)
   color = color * (1.0 - input.vFogFactor);

   // Additive blending: alpha is irrelevant
   output.color = vec4<f32>(color, 1.0);
   return output;
 }
