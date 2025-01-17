#version 300 es
in vec3 vertex_position;

out vec3 tex_coords;

uniform mat4 rot_proj_matrix;

void main() {
    tex_coords = vertex_position;
    vec4 pos = rot_proj_matrix * vec4(tex_coords, 1.0);
    gl_Position = pos.xyww;
}