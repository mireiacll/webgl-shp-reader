export const VERTEX_SHADER_SOURCE = `#version 300 es
  in vec3 a_position;
  in vec4 a_color;
  in vec2 a_texCoord;
  in vec3 a_normal;
  uniform mat4 u_matrix;
  uniform mat4 u_objectTMatrix;
  out vec4 v_color;
  out vec2 v_texCoord;
  out vec3 v_normal;

  void main() {
    vec4 realPosObject = u_objectTMatrix * vec4(a_position, 1.0);
    gl_Position = u_matrix * realPosObject;
    vec3 realNormalObject = mat3(u_objectTMatrix) * a_normal;
    v_color = a_color;
    v_texCoord = a_texCoord;
    v_normal = realNormalObject;
  }
`;