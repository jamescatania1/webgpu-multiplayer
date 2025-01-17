#version 300 es
in uvec3 vertex_data;

layout(std140) uniform GlobalData {
    vec3 camera_position;
    mat4 view_proj_matrix;
    vec3 sun_direction;
    vec3 sun_color;
    vec3 light_positions[4];
    vec3 light_colors[4];
};

uniform mat4 model_matrix;
uniform mat3 normal_matrix;

out vec3 normal;
out vec3 position;
out lowp vec3 color;

void main() {
    float x = float(vertex_data.x >> 16u) / 65535.0 - 0.5;
    float y = float(vertex_data.x & 0xFFFFu) / 65535.0 - 0.5;
    float z = float(vertex_data.y >> 16u) / 65535.0 - 0.5;
    position = (model_matrix * vec4(x, y, z, 1.0)).xyz;
    gl_Position = view_proj_matrix * model_matrix * vec4(x, y, z, 1.0);

    float r = float((vertex_data.y >> 11u) & 0x1Fu) / 31.0;
    float g = float((vertex_data.y >> 5u) & 0x3Fu) / 63.0;
    float b = float(vertex_data.y & 0x1Fu) / 31.0;
    color = vec3(r, g, b);

    float nx = float(vertex_data.z >> 22u) / 511.5 - 1.0;
    float ny = float((vertex_data.z >> 12u) & 0x3FFu) / 511.5 - 1.0;
    float nz = float((vertex_data.z >> 2u) & 0x3FFu) / 511.5 - 1.0;
    normal = normal_matrix * vec3(nx, ny, nz);
}