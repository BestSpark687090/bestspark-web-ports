//Mesh attributes
attribute vec3 aPosition;
attribute vec2 aUv0;

uniform mat4 matrix_model;
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
    vUv0 = aUv0;

    //Converts localPos to worldPos
    vec4 worldPos = matrix_model * vec4(aPosition, 1.0);

    // Curve effect
    float delta = Global_CharacterPosZ - worldPos.z;
    float d2 = delta * delta;
    float d3 = delta * d2;
    worldPos.xyz -= d3 * Global_CurveCombined * curveScale;

    // Clip-space position
    gl_Position = matrix_viewProjection * worldPos;

    vFogFactor = clamp((-delta - 30.0) / 55.0, 0.0, 1.0) * fogScale;
}


//uniform float twistStrength; // radians per unit depth

//{
        // Cork effect
    // float delta = Global_CharacterPosZ - worldPos.z;
    // float angle = delta * twistStrength;

    // float s = sin(angle);
    // float c = cos(angle);

    // // Rotate around Z axis
    // vec2 rotatedXY = vec2(
    //     worldPos.x * c - worldPos.y * s,
    //     worldPos.x * s + worldPos.y * c
    // );

    // worldPos.xy = rotatedXY;
//}