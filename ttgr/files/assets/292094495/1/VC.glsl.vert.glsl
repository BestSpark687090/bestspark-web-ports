attribute vec3 aPosition;
attribute vec4 aColor;

uniform mat4 matrix_model;
uniform mat4 matrix_view;//Might be omitted when calculating vFogDepth in the fragment shader
uniform mat4 matrix_viewProjection;

varying vec4 vColor;
varying float vFogDepth;//Might be omitted when calculating vFogDepth in the fragment shader

void main(void)
{
    vColor = aColor;

    vec4 worldPos = matrix_model * vec4(aPosition, 1.0);

    // View-space position
    vec4 viewPos = matrix_view * worldPos;
    // Store positive depth for fog effect
    vFogDepth = -viewPos.z;

    // Clip-space position
    gl_Position = matrix_viewProjection * worldPos;
}
       
