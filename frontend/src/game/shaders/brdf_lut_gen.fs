#version 300 es
precision highp float;
in vec2 uv;

const float PI = 3.14159265;
const uint SAMPLE_COUNT = 1024u;

out vec2 out_color;

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

vec3 importance_sample_ggx(vec2 x_i, vec3 n, float rough) {
    float a = rough * rough;
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

float geometry_schlick_ggx(float n_dot_v, float rough) {
    float k = (rough * rough) / 2.0;
    return n_dot_v / (n_dot_v * (1.0 - k) + k);
}

float geometry_smith(vec3 n, vec3 v, vec3 l, float rough) {
    float n_dot_v = max(dot(n, v), 0.0);
    float n_dot_l = max(dot(n, l), 0.0);
    return geometry_schlick_ggx(n_dot_v, rough) * geometry_schlick_ggx(n_dot_l, rough);
}

void main() {
    float n_dot_v = uv.x;
    float rough = uv.y;

    vec3 v = vec3(sqrt(1.0 - n_dot_v * n_dot_v), 0.0, n_dot_v);
    vec2 res = vec2(0.0);
    vec3 n = vec3(0.0, 0.0, 1.0);
    
    for (uint i = 0u; i < SAMPLE_COUNT; i++) {
        vec2 x_i = hammersley(i, SAMPLE_COUNT);
        vec3 h = importance_sample_ggx(x_i, n, rough);
        vec3 l = normalize(2.0 * dot(v, h) * h - v);

        float n_dot_l = max(l.z, 0.0);
        float n_dot_h = max(h.z, 0.0);
        float v_dot_h = max(dot(v, h), 0.0);

        if (n_dot_l > 0.0) {
            float g = geometry_smith(n, v, l, rough);
            float g_vis = (g * v_dot_h) / (n_dot_h * n_dot_v);
            float fc = pow(1.0 - v_dot_h, 5.0);

            res += vec2((1.0 - fc) * g_vis, fc * g_vis);
        }
    }
    out_color = res / float(SAMPLE_COUNT);
}