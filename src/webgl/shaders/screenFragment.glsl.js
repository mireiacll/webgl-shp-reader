export const SCREEN_FRAGMENT_SHADER_SOURCE = `#version 300 es
  precision mediump float;
  in vec2 v_texCoord;
  uniform sampler2D u_texture; // color
  uniform sampler2D u_normalTexture;
  uniform sampler2D u_depthTexture;
  uniform vec2 u_texelSize;

  out vec4 outColor;

  const float NORMAL_THRESHOLD = 0.25;
  const float DEPTH_THRESHOLD = 0.01;

  float decodeDepth(vec4 rgba) {
    const vec4 bitShift = vec4(1.0, 1.0 / 256.0, 1.0 / (256.0 * 256.0), 1.0 / (256.0 * 256.0 * 256.0));
    return dot(rgba, bitShift);
  }

  vec3 decodeNormal(vec4 rgba) {
    return rgba.rgb * 2.0 - 1.0;
  }

  void main() {

    vec3 centerNormal = decodeNormal(texture(u_normalTexture, v_texCoord));
    float centerDepth = decodeDepth(texture(u_depthTexture, v_texCoord));

    vec2 offsets[4];
    offsets[0] = vec2(u_texelSize.x, 0.0);
    offsets[1] = vec2(-u_texelSize.x, 0.0);
    offsets[2] = vec2(0.0, u_texelSize.y);
    offsets[3] = vec2(0.0, -u_texelSize.y);

    bool isEdge = false;
    for (int i = 0; i < 4; i++) {
      vec2 sampleUv = v_texCoord + offsets[i];
      vec3 neighborNormal = decodeNormal(texture(u_normalTexture, sampleUv));
      float neighborDepth = decodeDepth(texture(u_depthTexture, sampleUv));

      float normalDiff = 1.0 - dot(centerNormal, neighborNormal);
      float depthDiff = abs(centerDepth - neighborDepth);

      if (normalDiff > NORMAL_THRESHOLD || depthDiff > DEPTH_THRESHOLD) {
      //if (normalDiff > NORMAL_THRESHOLD ) {
        isEdge = true;
      }
    }

    outColor = isEdge ? vec4(0.0, 0.0, 0.0, 1.0) : texture(u_texture, v_texCoord);
  
    //outColor = texture(u_texture, v_texCoord);
  }
`;