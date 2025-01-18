#version 300 es
precision highp float;

const float PI = 3.14159265;
const float MAX_PREFILTER_LOD = 4.0;

in vec3 normal;
in vec3 position;
in vec3 color;

layout(std140) uniform GlobalData {
    vec3 camera_position;
    mat4 view_proj_matrix;
    vec3 sun_direction;
    vec3 sun_color;
    vec3 light_positions[4];
    vec3 light_colors[4];
};

uniform samplerCube sky_irradiance;
uniform samplerCube sky_prefilter;
uniform sampler2D sky_brdf_lut;
uniform bool is_metallic;
uniform float roughness;
uniform float ao;

out vec4 out_color;

vec3 fresnel_schlick(float v_dot_h) {
    vec3 f_0 = is_metallic ? color : vec3(0.04);
    return f_0 + (1.0 - f_0) * pow(clamp(1.0 - v_dot_h, 0.0, 1.0), 5.0);
}

vec3 fresnel_schlick_rough(float v_dot_h, float rough) {
    vec3 f_0 = is_metallic ? color : vec3(0.04);
    return f_0 + (max(vec3(1.0 - roughness), f_0) - f_0) * pow(clamp(1.0 - v_dot_h, 0.0, 1.0), 5.0);
}

float geometry_smith(float dp, float rough) {
    float k = (rough + 1.0) * (rough + 1.0) / 8.0;
    float denominator = dp * (1.0 - k) + k;
    return dp / denominator;
}

float distribution_ggx(float n_dot_h, float rough) {
    float alpha_sq = rough * rough * rough * rough;
    float d = n_dot_h * n_dot_h * (alpha_sq - 1.0) + 1.0;
    float res = alpha_sq / (PI * d * d);
    return res;
}

vec3 pbr_lighting_directional(vec3 direction) {
    vec3 intensity = sun_color * 1.0;
    vec3 l = direction;

    vec3 n = normalize(normal);
    vec3 v = normalize(camera_position - position);
    vec3 h = normalize(v + l);

    float n_dot_h = max(dot(n, h), 0.0);
    float v_dot_h = max(dot(v, h), 0.0);
    float n_dot_l = max(dot(n, l), 0.0);
    float n_dot_v = max(dot(n, v), 0.0);

    vec3 f_lambert = vec3(0.0);
    if (!is_metallic) {
        f_lambert = color;
    }

    vec3 fresnel = fresnel_schlick(v_dot_h);

    vec3 k_s = fresnel;
    vec3 k_d = 1.0 - k_s;
    vec3 spec_brdf_numerator = distribution_ggx(n_dot_h, roughness) * fresnel * geometry_smith(n_dot_l, roughness) * geometry_smith(n_dot_v, roughness);
    float spec_bdrf_denominator = 4.0 * n_dot_v * n_dot_l + 0.0001;
    vec3 spec_brdf = spec_brdf_numerator / spec_bdrf_denominator;
    vec3 diffuse_brdf = k_d * f_lambert / PI;

    vec3 res = (diffuse_brdf + spec_brdf) * intensity * n_dot_l;
    return res;
}

vec3 pbr_lighting_point(vec3 light_position, vec3 light_color) {
    vec3 intensity = light_color;
    vec3 l = light_position - position;
    float distance = length(l);
    l = normalize(l);
    intensity /= distance * distance * 0.1;

    vec3 n = normalize(normal);
    vec3 v = normalize(camera_position - position);
    vec3 h = normalize(v + l);

    float n_dot_h = max(dot(n, h), 0.0);
    float v_dot_h = max(dot(v, h), 0.0);
    float n_dot_l = max(dot(n, l), 0.0);
    float n_dot_v = max(dot(n, v), 0.0);

    vec3 f_lambert = vec3(0.0);
    if (!is_metallic) {
        f_lambert = color;
    }

    vec3 fresnel = fresnel_schlick(v_dot_h);

    vec3 k_s = fresnel;
    vec3 k_d = 1.0 - k_s;
    vec3 spec_brdf_numerator = distribution_ggx(n_dot_h, roughness) * fresnel * geometry_smith(n_dot_l, roughness) * geometry_smith(n_dot_v, roughness);
    float spec_bdrf_denominator = 4.0 * n_dot_v * n_dot_l + 0.5;
    vec3 spec_brdf = spec_brdf_numerator / spec_bdrf_denominator;
    vec3 diffuse_brdf = k_d * f_lambert / PI;

    vec3 res = (diffuse_brdf + spec_brdf) * intensity * n_dot_l;
    return res;
}

vec3 ambient_lighting(vec3 norm, vec3 dir) {
    vec3 irradiance = texture(sky_irradiance, norm).rgb;
    vec3 fresnel = fresnel_schlick_rough(max(dot(norm, dir), 0.0), roughness);

    vec3 k_d = 1.0 - fresnel;
    if (is_metallic) {
        k_d = vec3(0.0);
    }
    vec3 f_0 = is_metallic ? color : vec3(0.04);
    vec3 diffuse = k_d * irradiance * color;

    vec3 prefiltered_color = textureLod(sky_prefilter, dir, roughness * MAX_PREFILTER_LOD).rgb;
    vec2 brdf = texture(sky_brdf_lut, vec2(max(dot(norm, dir), 0.0), roughness)).rg;
    vec3 specular = prefiltered_color * (f_0 * brdf.x + brdf.y);
    
    return (diffuse + specular) * ao;
}

void main() {
    vec3 norm = normalize(normal);
    vec3 dir = normalize(camera_position - position);

    // calculate the directional light
    vec3 light = pbr_lighting_directional(sun_direction) * 0.001;

    // add the point lights
    for (int i = 0; i < 2; i++) {
        light += pbr_lighting_point(light_positions[i], light_colors[i]) * 0.001;
    }

    // ambient lighting
    light += ambient_lighting(norm, dir) * 1.0;

    // gamma correct
    light = light / (light + vec3(1.0));
    light = pow(light, vec3(1.0 / 2.2));

    out_color = vec4(light, 1.0);
}