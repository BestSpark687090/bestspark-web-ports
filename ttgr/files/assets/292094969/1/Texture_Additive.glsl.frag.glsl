//Mesh attributes
varying vec2 vUv0;
varying float vFogFactor;

uniform vec3 Global_FogColor;
uniform float Global_GreyScale; // 0 = color, 1 = greyscale (defaults to 0)
uniform vec3 Global_GreyScaleColor;

uniform sampler2D emissive_texture;
uniform vec4 emissive_color;
//uniform vec3 emissive_color;

void main(void)
{
    //My version
    //Emission
    //vec4 tex_color = texture(emissive_texture, vUv0);

    //float alpha = tex_color.a;

    // Early out for empty pixels
    //if (alpha <= 0.001) discard;

    //vec3 color = mix(tex_color.rgb, emissive_color.rgb, vFogFactor);
    //vec3 tint = mix(emissive_color.rgb, Global_FogColor, vFogFactor);


    //vFogFactor[0 - 1]

    // Base effect
    //vec3 color = emissive_color.rgb * tex_color.a;
    //vec3 color = tex_color.rgb * emissive_color.rgb;
    //color *= (1.0 - vFogFactor);

    // Fog effect
    //color = mix(color, Global_FogColor, vFogFactor);

    //GreyScale-effect
    //float grey = dot(color, Global_GreyScaleColor);
    //color = mix(color, vec3(grey), Global_GreyScale);

    //gl_FragColor = vec4(color,1);

    //gl_FragColor = vec4(tint, 1);


    //tex_color.a = 0.0;

    //gl_FragColor = tex_color;

    //float channel = tex_color.g;
    //gl_FragColor = vec4(channel, channel, channel, channel);
    //gl_FragColor = vec4(tex_color.rgb * emissive_color.rgb, 1);
    //gl_FragColor = vec4(1,0,0,1);
    //gl_FragColor = vec4(emissive_color.rgb,1);


    //GPT version

    float emission = texture(emissive_texture, vUv0).a;

    // Early out for empty pixels
    if (emission <= 0.001) discard;

    // Base flow color
    vec3 tint = emissive_color.rgb;//Test

    float tintGrey = dot(tint, Global_GreyScaleColor);
    tint = mix(tint, vec3(tintGrey), Global_GreyScale);

    // Glow color
    vec3 color = tint * emission;

    // Fog fades glow intensity (not color)
    color *= (1.0 - vFogFactor);

    // Additive blending: alpha is irrelevant
    gl_FragColor = vec4(color, 1.0);
}   
