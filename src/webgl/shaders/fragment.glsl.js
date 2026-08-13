export const FRAGMENT_SHADER_SOURCE = `#version 300 es
  precision highp float;
  precision highp int;
  in vec4 v_color;
  in vec2 v_texCoord;
  in vec3 v_normal;
  in vec4 ortoPos;
  uniform sampler2D u_texture;
  uniform float u_useTexture;
  uniform vec3 u_lightDirection;
  uniform float u_ambientStrength;
  uniform float u_useLighting;
  uniform float u_near;
  uniform float u_far;
  uniform vec4 u_selectionColor;
  uniform float u_isSelected;

  layout(location = 0) out vec4 outColor;
  layout(location = 1) out vec4 outDepth;
  layout(location = 2) out vec4 outNormal;
  layout(location = 3) out vec4 outSelectionColor;

  // (0..1) -> 4 color channels (~32 bits of precision instead of the 8 bits grayscale )
  vec4 encodeDepth(float depth) {
    const vec4 bitShift = vec4(1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0);
    const vec4 bitMask = vec4(1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0, 0.0);

    vec4 rgba = fract(depth * bitShift); // spread depth across 4 channels
    rgba -= rgba.gbaa * bitMask;         // prevent each channel from "bleeding" into the next
    return rgba;
  }

  // normal range -1..1 -> color channel  0..1
  vec4 encodeNormal(vec3 normal) {
    return vec4(normal * 0.5 + 0.5, 1.0);
  }

  void main() {
    vec4 texColor = texture(u_texture, v_texCoord);
    vec4 baseColor = mix(v_color, texColor, u_useTexture);

    vec3 normal = normalize(v_normal);
    float diffuse = max(dot(normal, -u_lightDirection), 0.0);
    float lightingFactor = u_ambientStrength + (1.0 - u_ambientStrength) * diffuse;
    float appliedLighting = mix(1.0, lightingFactor, u_useLighting);

    //outColor = vec4(baseColor.rgb * appliedLighting, baseColor.a);

    vec3 litColor = baseColor.rgb * appliedLighting;

    const vec3 HIGHLIGHT_COLOR = vec3(0.2, 1.0, 0.15);
    // vec3 finalColor = mix(litColor, HIGHLIGHT_COLOR, u_isSelected * 0.6);
    vec3 finalColor = (u_isSelected > 0.5) ? HIGHLIGHT_COLOR : litColor;


    outColor = vec4(finalColor, baseColor.a);

    float viewZ = ortoPos.z;
    float linearDepth = - viewZ;
    //float ndcZ = gl_FragCoord.z * 2.0 - 1.0;
    //float ndcZ = ortoPos.z;
    //float linearDepth = (2.0 * u_near * u_far) / (u_far + u_near - ndcZ * (u_far - u_near));
    //float linearDepth = ortoPos.z;
    float normalizedDepth = (linearDepth - u_near) / (u_far - u_near);
    float invertedDepth = 1.0 - normalizedDepth; // near = 1.0 (white), far = 0.0 (black)

    outDepth = encodeDepth(normalizedDepth);
    outNormal = encodeNormal(normal);
    outSelectionColor = u_selectionColor; // written as-is, no encoding needed
  }
`;