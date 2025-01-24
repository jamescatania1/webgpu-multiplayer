#version 300 es
precision highp float;

in vec2 uv;

const int max_kernel_size = 128;
const float sample_radius = 0.53;

uniform sampler2D depth_map;
uniform sampler2D noise_map;
uniform vec2 noise_scale;

uniform mat4 proj_matrix;
uniform mat4 proj_matrix_inverse;
uniform vec3 kernel[max_kernel_size];

out float out_color;

vec3 view_pos(vec2 coords) {
    float depth_value = texture(depth_map, coords).r;
    vec4 clip_pos = vec4(coords.x * 2.0 - 1.0, coords.y * 2.0 - 1.0, depth_value * 2.0 - 1.0, 1.0);
    vec4 view_pos = proj_matrix_inverse * clip_pos;
    return view_pos.xyz / view_pos.w;
}

void main() {

    vec3 position = view_pos(uv);
    vec3 normal = cross(dFdy(position.xyz), dFdx(position.xyz));
    normal = normalize(normal * -1.0);

    vec3 random = texture(noise_map, uv * noise_scale).xyz;

    vec3 tangent = normalize(random - normal * dot(random, normal));
    vec3 bitangent = cross(normal, tangent);
    mat3 tbn = mat3(tangent, bitangent, normal);
    float occlusion = 0.0;
    for (int i = 0; i < max_kernel_size; i++) {
        vec3 sample_pos = tbn * kernel[i];
        sample_pos = position + sample_pos * sample_radius;

        vec4 offset = vec4(sample_pos, 1.0);
        offset = proj_matrix * offset;
        offset.xy /= offset.w;
        offset.xy = offset.xy * 0.5 + vec2(0.5);

        float sample_depth = view_pos(offset.xy).z;
        float range_check = smoothstep(0.0, 1.0, sample_radius / abs(position.z - sample_depth));
        occlusion += (sample_depth >= sample_pos.z + 0.0025 ? 1.0 : 0.0) * range_check;
    }
    occlusion = 1.0 - occlusion / float(max_kernel_size);
    out_color = pow(occlusion, 2.0);
}