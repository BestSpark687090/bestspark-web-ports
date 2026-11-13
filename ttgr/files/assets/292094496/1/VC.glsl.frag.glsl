varying vec4 vColor;
varying float vFogDepth;

uniform vec3 fogColor;
// uniform float fogStart;  //Turned into a CONSTANT (30)
// uniform float fogEnd;    //Turned into a CONSTANT (85)

void main(void)
{
    // Linear fog factor
    float fogFactor = clamp((vFogDepth - 30.0) / 55.0, 0.0, 1.0);

    vec3 finalColor = mix(vColor.rgb, fogColor, fogFactor);
    gl_FragColor = vec4(finalColor, vColor.a);
}   

