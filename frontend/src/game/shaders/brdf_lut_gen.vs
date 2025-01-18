#version 300 es

in vec3 vertex_position;
in vec2 tex_coords;

out vec2 uv;

void main() {
    uv = tex_coords;
    gl_Position = vec4(vertex_position, 1.0);
}