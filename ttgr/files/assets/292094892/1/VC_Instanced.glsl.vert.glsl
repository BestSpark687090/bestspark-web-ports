//Mesh attributes
attribute vec3 aPosition;
attribute vec4 aColor;

//Instance attributes
attribute vec3 instance_pos;
attribute vec2 instance_rot;

uniform mat4 matrix_viewProjection;
uniform float Global_CharacterPosZ;

//Curve
uniform vec3 Global_CurveCombined;//Pre-combines direction and strength on the CPU
uniform float curveScale;// 0 = off, 1 = on (defaults to 0)

//Color modifiers
uniform float Global_GreyScale; // 0 = color, 1 = greyscale (defaults to 0)
uniform vec3 Global_GreyScaleColor;

uniform vec3 addColor;//used to be a float (defaults to new Color(0,0,0,0))

uniform vec3 Global_FogColor;
uniform float fogScale;// 0 = disabled, 1 = full fog (defaults to 1)

varying vec4 vColor;
//varying float vFogDepth;//Might be omitted when calculating vFogDepth in the fragment shader

void main(void)
{
    vec3 localPos = aPosition;
    
    // Rotate around Y
    float s = instance_rot.x;
    float c = instance_rot.y;

    vec3 rotated;
    rotated.x = localPos.x * c - localPos.z * s;
    rotated.y = localPos.y;
    rotated.z = localPos.x * s + localPos.z * c;

    // Apply Translation
    vec3 worldPos = rotated + instance_pos;

    // Curve-effect
    float delta = Global_CharacterPosZ - worldPos.z;
    float d2 = delta * delta;
    float d3 = delta * d2;
    worldPos -= d3 * Global_CurveCombined * curveScale;

    // Clip-space position (screen [-1 to 1] on both axis)
    gl_Position = matrix_viewProjection * vec4(worldPos,1.0);

    // Base color + Additive-effect
    vec3 color = aColor.rgb + addColor;//addColor defaults to [0,0,0]

    //Fog-effect
    float fogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * fogScale;
    color = mix(color, Global_FogColor, fogFactor);

    //GreyScale-effect
    float grey = dot(color, Global_GreyScaleColor);
    color.rgb = mix(color.rgb, vec3(grey), Global_GreyScale);

    vColor = vec4(color, aColor.a);//Not sure about alpha value here...
}

