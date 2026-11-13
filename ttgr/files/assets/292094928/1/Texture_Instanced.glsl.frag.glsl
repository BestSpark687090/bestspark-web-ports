varying vec2 vUv0;
varying float vFogFactor;

uniform vec3 tintColor;


uniform vec3 Global_FogColor;
uniform float fogToBlack; // 0.0 = opaque fog, 1.0 = additive fog


uniform float Global_GreyScale; // 0 = color, 1 = greyscale (defaults to 0)
uniform vec3 Global_GreyScaleColor;

uniform sampler2D map;



void my_version()//broken
{
    //Emission + Opacity information
    // vec4 tex_color = texture(map, vUv0);//[1,1,1,a]

    // //Base color + Tint-effect
    // vec3 tint_color = vec3(0.1686274509803922, 0.1019607843137255, 0);
    // vec3 color = tint_color * tex_color.a;

    // //Fog-effect
    // //color = mix(tex_color.rgb, Global_FogColor, vFogFactor);

    // //GreyScale-effect
    // float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
    // color = mix(color.rgb, vec3(grey), Global_GreyScale);

    // //gl_FragColor = vec4(color, tex_color.a);

    // gl_FragColor = vec4(vFogFactor,0,0,0);//or alpha1...
}

void gpt_version_modified()
{
    // Alpha-only alpha mask
    vec4 texColor = texture(map, vUv0);
    float alpha = texColor.a;

    // Early out for empty pixels
    if (alpha <= 0.001) discard;

    // Base color information
    vec3 color = texColor.rgb;

    //Apply tint effect
    color *= tintColor;


    //No add effect for now...

    //Fog effect
    vec3 fogTarget = mix(Global_FogColor, vec3(0.0), fogToBlack);
    color = mix(color, fogTarget, vFogFactor);

    //GreyScale effect
    float tintGrey = dot(tintColor, Global_GreyScaleColor);
    color = mix(tintColor, vec3(tintGrey), Global_GreyScale);

    // Glow color
    color *= alpha;

    // Fog fades glow intensity (not color)
    color *= (1.0 - vFogFactor);//[0,0,0] at FogFactor 1    [color.a, color.b, color.g] at FogFactor 0

    //T = 

    //mix(color, [0,0,0], T)

    // Additive blending alpha is irrelevant
    gl_FragColor = vec4(color, 1.0);
}

void gpt_version()
{
    // Alpha-only alpha mask
    float alpha = texture(map, vUv0).a;

    // Early out for empty pixels
    if (alpha <= 0.001) discard;

    // Base flow color
    vec3 tint = vec3(0.1686, 0.102, 0.0);//Could be same as texture color?input color so to speak

    float tintGrey = dot(tint, Global_GreyScaleColor);
    tint = mix(tint, vec3(tintGrey), Global_GreyScale);

    // Glow color
    vec3 color = tint * alpha;

    // Fog fades glow intensity (not color)
    color *= (1.0 - vFogFactor);//[0,0,0] at FogFactor 1    [color.a, color.b, color.g] at FogFactor 0

    //T = 

    //mix(color, [0,0,0], T)

    // Additive blending: alpha is irrelevant
    gl_FragColor = vec4(color, 1.0);
}


void main(void)
{

    //my_version();
    //gpt_version();
    gpt_version_modified();
}


//Outfit7way
//varying vec4 vOriginalColor;
//{
    //Outfit7way
    //gl_FragColor = vec4(texture(map, vUv0).a * vOriginalColor);
//}   



//move trig functions to cpu side, precompute on s and c
//collapse fog + greyscale into a single multiplyedx