#version 300 es
precision highp float;

const float PI = 3.14159265;

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


uniform bool is_metallic;
uniform float roughness;
uniform float ao;

out vec4 out_color;

vec3 fresnel_schlick(float v_dot_h) {
    vec3 f_0 = vec3(0.04);
    if (is_metallic) {
        f_0 = mix(f_0, color, 0.0);
    }
    vec3 res = f_0 + (1.0 - f_0) * pow(clamp(1.0 - v_dot_h, 0.0, 1.0), 5.0);
    return res;
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
    float spec_bdrf_denominator = 4.0 * n_dot_v * n_dot_l + 0.0001;
    vec3 spec_brdf = spec_brdf_numerator / spec_bdrf_denominator;
    vec3 diffuse_brdf = k_d * f_lambert / PI;

    vec3 res = (diffuse_brdf + spec_brdf) * intensity * n_dot_l;
    return res;
}

void main() {
    vec3 norm = normalize(normal);
    vec3 dir = normalize(camera_position - position);


    // calculate the directional light
    vec3 light = pbr_lighting_directional(sun_direction);

    // add the point lights
    for (int i = 0; i < 2; i++) {
        light += pbr_lighting_point(light_positions[i], light_colors[i]);
    }

    // gamma correct
    light = light / (light + vec3(1.0));
    light = pow(light, vec3(1.0 / 2.2));

    out_color = vec4(light, 1.0);


    // vec3 f_0 = mix(vec3(0.04), color, metallic);
    // vec3 l_0 = vec3(0.0);

    // // float distance = length(light_position - position);
    // // attenuation = 1.0 (its the sun)
    // vec3 l_dir = normalize(light_position - position);
    // vec3 l_half = normalize(l_dir + dir);
    // vec3 radiance = sun_color * 1.0;

    // // compute the BRDF
    // float ndf = distribution_ggx(normal, l_half, roughness);
    // float g = geometry_smith(normal, dir, l_dir, roughness);
    // vec3 fresnel = fresnel_schlick(max(dot(l_half, dir), 0.0), f_0);

    // vec3 brdf_numerator = fresnel * ndf * g;
    // float brdf_denominator = 4.0 * max(dot(normal, dir), 0.0) * max(dot(normal, l_dir), 0.0) + 0.0001;
    // vec3 specular = brdf_numerator / brdf_denominator;

    // vec3 k_s = fresnel;
    // vec3 k_d = vec3(1.0) - k_s;
    // k_d *= 1.0 - metallic;

    // float n_dot_l = max(dot(normal, l_dir), 0.0);
    // l_0 += (k_d * color / PI + specular) * radiance * n_dot_l;


    // vec3 ambient = vec3(0.03) * color * ao;
    // vec3 res = ambient + l_0;



    // vec3 diffuse = max(dot(normal, light_direction), 0.0) * sun_color;
    // const float shininess = 1.0;
    // const float specular_intensity = (8.0 + shininess) / (8.0 * 3.14159265);
    // vec3 view_direction = normalize(camera_position - position);
    // vec3 blinn_direction = normalize(view_direction + light_direction);
    // vec3 specular = pow(max(dot(normal, blinn_direction), 0.0), shininess) * specular_intensity * sun_color;
}