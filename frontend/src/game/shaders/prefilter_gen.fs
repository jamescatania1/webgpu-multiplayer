#version 300 es
precision highp float;

in vec3 position;

uniform samplerCube skybox;
uniform float roughness;

const float PI = 3.14159265359;
const uint SAMPLE_COUNT = 1024u;

out vec4 out_color;

float rad_inverse_vdc(uint z) {
    z = (z << 16u) | (z >> 16u);
    z = ((z & 0x55555555u) << 1u) | ((z & 0xAAAAAAAAu) >> 1u);
    z = ((z & 0x33333333u) << 2u) | ((z & 0xCCCCCCCCu) >> 2u);
    z = ((z & 0x0F0F0F0Fu) << 4u) | ((z & 0xF0F0F0F0u) >> 4u);
    z = ((z & 0x00FF00FFu) << 8u) | ((z & 0xFF00FF00u) >> 8u);
    return float(z) * 2.3283064365386963e-10;
}

vec2 hammersley(uint i, uint n) {
    return vec2(float(i)/float(n), rad_inverse_vdc(i));
}

vec3 importance_sample_ggx(vec2 x_i, vec3 n) {
    float a = roughness * roughness;
    float phi = 2.0 * PI * x_i.x;
    float cos_theta = sqrt((1.0 - x_i.y) / (1.0 + (a * a - 1.0) * x_i.y));
    float sin_theta = sqrt(1.0 - cos_theta * cos_theta);
    vec3 h;
    h.x = cos(phi) * sin_theta;
    h.y = sin(phi) * sin_theta;
    h.z = cos_theta;
    vec3 up = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent_x = normalize(cross(up, n));
    vec3 tangent_y = cross(n, tangent_x);
    return tangent_x * h.x + tangent_y * h.y + n * h.z;
}

void main() {
    vec3 n = normalize(position);
    vec3 r = n;
    vec3 v = r;

    float weight = 0.0;
    vec3 prefiltered_color = vec3(0.0);
    for (uint i = 0u; i < SAMPLE_COUNT; i++) {
        vec2 x_i = hammersley(i, SAMPLE_COUNT);
        vec3 h = importance_sample_ggx(x_i, n);
        vec3 l = normalize(2.0 * dot(v, h) * h - v);
        float n_dot_l = max(dot(n, l), 0.0);
        if (n_dot_l > 0.0) {
            prefiltered_color += texture(skybox, l).rgb * n_dot_l;
            weight += n_dot_l;
        }
    }
    out_color = vec4(prefiltered_color / weight, 1.0);
}