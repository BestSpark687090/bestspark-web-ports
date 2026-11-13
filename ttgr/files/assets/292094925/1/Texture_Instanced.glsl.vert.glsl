//Mesh attributes
attribute vec3 aPosition;
attribute vec2 aUv0;

//Instance attributes
attribute vec3 instance_pos;

uniform mat4 matrix_viewProjection;
uniform float Global_CharacterPosZ;

//Curve
uniform vec3 Global_CurveCombined;//Pre-combines direction and strength on the CPU
uniform float curveScale;// 0 = off, 1 = on

uniform float fogScale;// 0 = disabled, 1 = full fog (defaults to 1)

varying float vFogFactor;//Might be omitted when calculating vFogDepth in the fragment shader
varying vec2 vUv0;

void main(void)
{
    //Translate (Converts localPos to worldPos)
    vec3 worldPos = aPosition + instance_pos;

    // Curve-effect
    float delta = Global_CharacterPosZ - worldPos.z;
    float d2 = delta * delta;
    float d3 = delta * d2;
    worldPos -= d3 * Global_CurveCombined * curveScale;

    // Clip-space position (screen [-1 to 1] on both axis)
    gl_Position = matrix_viewProjection * vec4(worldPos, 1.0);

    vFogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * fogScale;

    vUv0 = aUv0;
}

//Outfit7way
//varying vec4 vOriginalColor;

//{
    //Outfit7way
    //vec4 tint_color = vec4(0.1686274509803922, 0.1019607843137255, 0,1);
    //vOriginalColor = smoothstep(2.0, 60.0, worldPos.z) * tint_color;
//}
