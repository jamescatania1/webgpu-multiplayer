#version 300 es
in uvec2 vertex_xyzc;
in uint vertex_uv;
in uint vertex_normal;

layout(std140) uniform GlobalData {
    vec3 camera_position;
    mat4 view_proj_matrix;
    vec3 sun_direction;
    vec4 sun_color;
    vec3 light_positions[4];
    vec4 light_colors[4];
};

uniform vec3 offset;
uniform float scale;
uniform mat4 model_matrix;
uniform mat3 normal_matrix;

out vec3 position;
out vec4 clip_position;
out vec3 normal;
out vec2 uv;
out lowp vec3 color;

void main() {
    float x = float(vertex_xyzc.x >> 16u) / 65535.0 - 0.5;
    float y = float(vertex_xyzc.x & 0xFFFFu) / 65535.0 - 0.5;
    float z = float(vertex_xyzc.y >> 16u) / 65535.0 - 0.5;
    vec4 world_pos = model_matrix * vec4(vec3(x, y, z) * scale, 1.0) + vec4(offset, 0.0);
    position = world_pos.xyz;
    gl_Position = view_proj_matrix * world_pos;
    clip_position = gl_Position;

    float r = float((vertex_xyzc.y >> 11u) & 0x1Fu) / 31.0;
    float g = float((vertex_xyzc.y >> 5u) & 0x3Fu) / 63.0;
    float b = float(vertex_xyzc.y & 0x1Fu) / 31.0;
    color = vec3(r, g, b);

    float nx = float(vertex_normal >> 22u) / 511.5 - 1.0;
    float ny = float((vertex_normal >> 12u) & 0x3FFu) / 511.5 - 1.0;
    float nz = float((vertex_normal >> 2u) & 0x3FFu) / 511.5 - 1.0;
    normal = normal_matrix * vec3(nx, ny, nz);

    float u = float(vertex_uv >> 16u) / 65535.0;
    float v = float(vertex_uv & 0xFFFFu) / 65535.0;
    uv = vec2(u, v);
}