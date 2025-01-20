#version 300 es
precision highp float;

const float PI = 3.14159265;
const float MAX_PREFILTER_LOD = 4.0;

in vec3 normal;
in vec3 position;
in vec3 color;
in vec2 uv;

layout(std140) uniform GlobalData {
    vec3 camera_position;
    mat4 view_proj_matrix;
    vec3 sun_direction;
    vec4 sun_color;
    vec3 light_positions[4];
    vec4 light_colors[4];
};

uniform samplerCube sky_irradiance;
uniform samplerCube sky_prefilter;
uniform sampler2D sky_brdf_lut;

uniform sampler2D albedo_map;
uniform sampler2D normal_map;
uniform sampler2D metallic_map;
uniform sampler2D roughness_map;

// & 0x1 = has albedo, & 0x2 = has normal, & 0x4 = has metallic, & 0x8 = has roughness
uniform uint texture_component_flags; 

// these and vertex color attribute are used if the texture doesn't have the component
uniform float metallic;
uniform float roughness;
// uniform float ao;

out vec4 out_color;

vec3 calculate_normal() {
    vec3 tangent = texture(normal_map, uv).xyz * 2.0 - 1.0;
    vec3 q1 = dFdx(position);
    vec3 q2 = dFdy(position);
    vec2 st1 = dFdx(uv);
    vec2 st2 = dFdy(uv);
    vec3 n = normalize(normal);
    vec3 t = normalize(q1 * st2.t - q2 * st1.t);
    vec3 b = -normalize(cross(n, t));
    mat3 tbn = mat3(t, b, n);
    return normalize(tbn * tangent);
}

float ndf_ggx(float cos_lh, float r) {
	float alpha   = r * r;
	float alpha_sq = alpha * alpha;
	float denom = (cos_lh * cos_lh) * (alpha_sq - 1.0) + 1.0;
	return alpha_sq / (PI * denom * denom);
}

float geom_schlick_ggx(float cos_li, float cos_lo, float r) {
	float k = ((r + 1.0) * (r + 1.0)) / 8.0;
    float ggx_1 = cos_li / (cos_li * (1.0 - k) + k);
    float ggx_2 = cos_lo / (cos_lo * (1.0 - k) + k);
	return ggx_1 * ggx_2;
}

vec3 fresnel_schlick(float cos_theta, vec3 f_0, float r) {
    return f_0 + (max(vec3(1.0 - r), f_0) - f_0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}

void main() {
    // uniform across all fragments, so the branch predictor should make this fine
    vec3 albedo;
    if (int(texture_component_flags & 0x1u) == 0) {
        albedo = color;
    } else {
        albedo = pow(texture(albedo_map, uv).rgb, vec3(2.2));
    }
    vec3 n;
    if (int(texture_component_flags & 0x2u) == 0) {
        n = normalize(normal);
    } else {
        n = calculate_normal();
    }
    float metal;
    if (int(texture_component_flags & 0x4u) == 0) {
        metal = metallic;
    } else {
        metal = texture(metallic_map, uv).r;
    }
    float rough;
    if (int(texture_component_flags & 0x8u) == 0) {
        rough = roughness;
    } else {
        rough = texture(roughness_map, uv).r;
    }

    vec3 l_o = normalize(camera_position - position);

    float cos_lo = max(dot(n, l_o), 0.0);
    vec3 l_r = 2.0 * cos_lo * n - l_o;

    vec3 f_0 = mix(vec3(0.04), albedo, metal);
    vec3 light = vec3(0.0);

    vec3 directional; {
        vec3 l_i = sun_direction;
        vec3 l_radiance = sun_color.rgb * sun_color.a;

        vec3 l_half = normalize(l_i + l_o);
        float cos_li = max(dot(n, l_i), 0.0);
        float cos_lh = max(dot(n, l_half), 0.0);

        vec3 f = fresnel_schlick(max(0.0, dot(l_half, l_o)), f_0, rough);
        float d = ndf_ggx(cos_lh, rough);
        float g = geom_schlick_ggx(cos_li, cos_lo, rough);

        vec3 k_d = mix(vec3(1.0) - f, vec3(0.0), metal);
        vec3 diffuse_brdf = k_d * albedo;
        vec3 specular_brdf = f * d * g / (4.0 * max(0.0001, cos_lo * cos_li));

        directional = l_radiance * cos_li * (diffuse_brdf + specular_brdf);
    }
    light += directional;

    vec3 point = vec3(0.0); {
        for (int i = 0; i < 4; i++) {
            vec3 l_i = light_positions[i] - position;
            float l_dist = length(l_i);
            l_i = normalize(l_i);
            vec3 l_radiance = light_colors[i].rgb * light_colors[i].a / (l_dist * l_dist * 0.1);

            vec3 l_half = normalize(l_i + l_o);
            float cos_li = max(dot(n, l_i), 0.0);
            float cos_lh = max(dot(n, l_half), 0.0);

            vec3 f = fresnel_schlick(max(0.0, dot(l_half, l_o)), f_0, rough);
            float d = ndf_ggx(cos_lh, rough);
            float g = geom_schlick_ggx(cos_li, cos_lo, rough);

            vec3 k_d = mix(vec3(1.0) - f, vec3(0.0), metal);
            vec3 diffuse_brdf = k_d * albedo;
            vec3 specular_brdf = f * d * g / (4.0 * max(0.0001, cos_lo * cos_li));

            point += l_radiance * cos_li * (diffuse_brdf + specular_brdf);
        }
    }
    light += point;

    vec3 ambient; {
        vec3 irradiance = texture(sky_irradiance, n).rgb;

        vec3 f = fresnel_schlick(cos_lo, f_0, rough);
        vec3 k_d = mix(vec3(1.0) - f, vec3(0.0), metal);
        vec3 diffuse = k_d * irradiance * albedo;

        vec3 specular_irradiance = textureLod(sky_prefilter, l_r, rough * MAX_PREFILTER_LOD).rgb;
        vec2 brdf = texture(sky_brdf_lut, vec2(cos_lo, rough)).rg;
        vec3 specular = specular_irradiance * (f_0 * brdf.x + brdf.y);

        // ambient = (diffuse + specular) * ao;
        ambient = (diffuse + specular);
    }
    light += ambient + vec3(uv.x) * 0.0001;

    // gamma correct
    light = light / (light + vec3(1.0));
    light = pow(light, vec3(1.0 / 2.2));
    out_color = vec4(light, 1.0);
}