#version 300 es
precision highp float;

const float exposure = 0.7;
const float temperature = 0.2; // [-1.6, 1.6] for cool/warm
const float tint = 0.1;
const float contrast = 1.1;
const float brightness = 0.0;
const float gamma = 2.2;

in vec2 uv;

uniform sampler2D color_map;

out vec4 out_color;

vec3 white_balance(vec3 color) {
    const float t1 = temperature * 10.0 / 6.0;
    const float t2 = tint * 10.0 / 6.0;

    const float x = 0.31271 - t1 * (t1 < 0.0 ? 0.1 : 0.05);
    const float std_illum_y = 2.87 * x - 3.0 * x * x - 0.27509507;
    const float y = std_illum_y + t2 * 0.05;

    const vec3 w1 = vec3(0.949237, 1.03542, 1.08728);

    const float y_adj = 1.0;
    const float x_adj = y_adj * x / y;
    const float z_adj = y_adj * (1.0 - x - y) / y;

    const float l = 0.7328 * x_adj + 0.4296 * y_adj - 0.1624 * z_adj;
    const float m = -0.7036 * x_adj + 1.6975 * y_adj + 0.0061 * z_adj;
    const float s = 0.0030 * x_adj + 0.0136 * y_adj + 0.9834 * z_adj;

    const vec3 w2 = vec3(l, m, s);
    const vec3 balance = vec3(w1.x / w2.x, w1.y / w2.y, w1.z / w2.z);

    const mat3 LIN_2_LMS_MAT = mat3(
        0.390405, 0.549941, 0.00892632,
        0.0708416, 0.963172, 0.00135775,
        0.0231082, 0.128021, 0.936245
    );

    const mat3 LMS_2_LIN_MAT = mat3(
         2.85847,  -1.62879, -0.0248910,
        -0.210182,  1.15820,  0.000324281,
        -0.0418120, -0.118169, 1.06867
    );

    vec3 lms = LIN_2_LMS_MAT * color;
    lms *= balance;
    return LMS_2_LIN_MAT * lms;
}

vec3 aces(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {             
    vec3 color = texture(color_map, uv).rgb;
    // float occlusion_factor = texture(depth_map, uv).r;
    // color *= max(1.0, occlusion_factor);

    // creds acerola

    // exposure
    color *= exposure;

    // white balancing
    color = white_balance(color);

    // contrast and brightness
    color = contrast * (color - 0.5) + 0.5 + brightness;

    // tone mapping
    color = aces(color);

    color = pow(color, vec3(1.0 / gamma));
    out_color = vec4(color, 1.0);
}