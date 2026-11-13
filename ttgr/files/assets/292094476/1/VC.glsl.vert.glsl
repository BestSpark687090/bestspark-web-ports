//Mesh attributes
attribute vec3 aPosition;
attribute vec4 aColor;

uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

uniform float Global_CharacterPosZ;

//Curve
uniform vec3 Global_CurveCombined;//Pre-combines direction and strength on the CPU
uniform float curveScale;// 0 = off, 1 = on (defaults to 0)

//Color modifiers
uniform vec3 tintColor;//defaults to new Color(1,1,1)
uniform vec3 addColor;//defaults to new Color(0,0,0))

uniform vec3 Global_FogColor;
uniform float fogScale;// 0 = disabled, 1 = full fog (defaults to 1)
uniform float fogToBlack; // 0.0 = opaque fog, 1.0 = additive fog

uniform float Global_GreyScale; // 0 = color, 1 = greyscale (defaults to 0)
uniform vec3 Global_GreyScaleColor;

uniform float Global_GammaBlend;

//Output to fragment shader
varying vec4 vColor;
//varying float vFogDepth;//Might be omitted when calculating vFogDepth in the fragment shader

void new()
{
    // Curve-effect
    vec4 worldPos = matrix_model * vec4(aPosition, 1.0);
    float delta = Global_CharacterPosZ - worldPos.z;
    float d2 = delta * delta;
    float d3 = delta * d2;
    worldPos.xyz -= d3 * Global_CurveCombined * curveScale;

    // Clip-space position (screen [-1 to 1] on both axis)
    gl_Position = matrix_viewProjection * worldPos;




    //TESTS
    //vColor = aColor;
    //vColor = vec4(tintColor, 1);
    //return;



    //Base color information
    vec3 color = aColor.rgb;

    //Apply tint effect
    color *= tintColor;//defaults to [1,1,1] (no change)

    //Apply add effect
    color += addColor;//addColor defaults to [0,0,0,0] (no change)

    //Fog effect
    float fogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * fogScale;//Range[0 - 1] or 0 when fogScale is set to 0

    vec3 fogTarget = mix(Global_FogColor, vec3(0.0), fogToBlack);
    color = mix(color, fogTarget, fogFactor);

    color = mix(color, pow(color, vec3(2.2)), Global_GammaBlend);

    //GreyScale-effect
    float grey = dot(color, Global_GreyScaleColor);
    color.rgb = mix(color.rgb, vec3(grey), Global_GreyScale);

    vColor = vec4(color, aColor.a);//Not sure about alpha value here...
    //vColor = vec4(aColor.a, aColor.a, aColor.a, 1.0f);//Not sure about alpha value here...
}


// void approved()
// {
//     // Curve-effect
//     vec4 worldPos = matrix_model * vec4(aPosition, 1.0);
//     float delta = Global_CharacterPosZ - worldPos.z;
//     float d2 = delta * delta;
//     float d3 = delta * d2;
//     worldPos.xyz -= d3 * Global_CurveCombined * curveScale;

//     // Clip-space position (screen [-1 to 1] on both axis)
//     gl_Position = matrix_viewProjection * worldPos;

//     // Base + additive
//     vec3 color = aColor.rgb + addColor;//addColor defaults to [0,0,0]

//     //Fog-effect
//     float fogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * fogScale;
//     color = mix(color, Global_FogColor, fogFactor);

//     //GreyScale-effect
//     float grey = dot(color, Global_GreyScaleColor);
//     color.rgb = mix(color.rgb, vec3(grey), Global_GreyScale);

//     vColor = vec4(color, aColor.a);//Not sure about alpha value here...
// }


void main(void)
{
    //approved();
    new();
}



    //color = mix(color, Global_FogColor, fogFactor);//[fog.r, fog.g, fog.b] at FogFactor 1   [color.a, color.b, color.g] at FogFactor 0

    //color *= (1.0 - vFogFactor);//[0,0,0] at FogFactor 1    [color.a, color.b, color.g] at FogFactor 0
    
    
    //mix(color, GlobalFogColor, fogFactor)//opague
    //mix(color, [0,0,0], T) //additively


    //local_fogColor = Global_FogColor * (0 or 1) depending on Additive or not Additive (additive.a) perhaps?

    //T = 

    //vec3 local_fogColor = mix(Global_FogColor, vec3(0), addColor.a);




