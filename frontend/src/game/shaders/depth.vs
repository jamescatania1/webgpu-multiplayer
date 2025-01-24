#version 300 es

in uvec2 vertex_xyzc;

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

void main() {      
    float x = float(vertex_xyzc.x >> 16u) / 65535.0 - 0.5;
    float y = float(vertex_xyzc.x & 0xFFFFu) / 65535.0 - 0.5;
    float z = float(vertex_xyzc.y >> 16u) / 65535.0 - 0.5;
    vec4 world_pos = model_matrix * vec4(vec3(x, y, z) * scale, 1.0) + vec4(offset, 0.0);
    gl_Position = view_proj_matrix * vec4(world_pos.xyz, 1.0);
}