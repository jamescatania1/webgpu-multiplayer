#version 300 es
precision highp float;

layout(std140) uniform GlobalData {
    vec3 camera_position;
    vec3 light_position;
    vec3 sun_color;
    mat4 view_proj_matrix;
};

in vec3 normal;
in vec3 position;
in lowp vec3 color;

out vec4 out_color;

void main() {
    vec3 light_direction = normalize(light_position - position);
    vec3 diffuse = max(dot(normal, light_direction), 0.0) * sun_color;

    vec3 view_direction = normalize(camera_position - position);
    vec3 reflect_direction = reflect(-light_direction, normal);
    vec3 specular = pow(max(dot(view_direction, reflect_direction), 0.0), 8.0) * sun_color;

    out_color = vec4((diffuse * 0.5 + specular * 0.2 + 0.5) * color, 1.0);
}