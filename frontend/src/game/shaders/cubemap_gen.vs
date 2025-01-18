#version 300 es
in vec3 vertex_position;

uniform mat4 proj_matrix;
uniform mat4 view_matrix;

out vec3 position;

void main() {
    position = vertex_position; 
    gl_Position =  proj_matrix * view_matrix * vec4(vertex_position, 1.0);
}