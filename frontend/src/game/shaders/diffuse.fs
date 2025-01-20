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
uniform float metallic;
uniform float roughness;
uniform float ao;

out vec4 out_color;

float ndfGGX(float cosLh, float roughness)
{
	float alpha   = roughness * roughness;
	float alphaSq = alpha * alpha;

	float denom = (cosLh * cosLh) * (alphaSq - 1.0) + 1.0;
	return alphaSq / (PI * denom * denom);
}

// Single term for separable Schlick-GGX below.
float gaSchlickG1(float cosTheta, float k)
{
	return cosTheta / (cosTheta * (1.0 - k) + k);
}

// Schlick-GGX approximation of geometric attenuation function using Smith's method.
float gaSchlickGGX(float cosLi, float cosLo, float roughness)
{
	float r = roughness + 1.0;
	float k = (r * r) / 8.0; // Epic suggests using this roughness remapping for analytic lights.
	return gaSchlickG1(cosLi, k) * gaSchlickG1(cosLo, k);
}

vec3 fresnel_schlick(float cos_theta, vec3 f_0, float r) {
    return f_0 + (max(vec3(1.0 - r), f_0) - f_0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}


void main() {
    vec3 l_o = normalize(camera_position - position);
    vec3 n = normalize(normal);

    float cos_lo = max(dot(n, l_o), 0.0);
    vec3 l_r = 2.0 * cos_lo * n - l_o;

    vec3 f_0 = mix(vec3(0.04), color, metallic);
    vec3 light = vec3(0.0);

    vec3 directional; {
        vec3 l_i = sun_direction;
        vec3 l_radiance = sun_color.rgb * sun_color.a;

        vec3 l_half = normalize(l_i + l_o);
        float cos_li = max(dot(n, l_i), 0.0);
        float cos_lh = max(dot(n, l_half), 0.0);

        vec3 f = fresnel_schlick(max(0.0, dot(l_half, l_o)), f_0, roughness);
        float d = ndfGGX(cos_lh, roughness);
        float g = gaSchlickGGX(cos_li, cos_lo, roughness);

        vec3 k_d = mix(vec3(1.0) - f, vec3(0.0), metallic);
        vec3 diffuse_brdf = k_d * color;
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

            vec3 f = fresnel_schlick(max(0.0, dot(l_half, l_o)), f_0, roughness);
            float d = ndfGGX(cos_lh, roughness);
            float g = gaSchlickGGX(cos_li, cos_lo, roughness);

            vec3 k_d = mix(vec3(1.0) - f, vec3(0.0), metallic);
            vec3 diffuse_brdf = k_d * color;
            vec3 specular_brdf = f * d * g / (4.0 * max(0.0001, cos_lo * cos_li));

            point += l_radiance * cos_li * (diffuse_brdf + specular_brdf);
        }
    }
    light += point;

    vec3 ambient; {
        vec3 irradiance = texture(sky_irradiance, n).rgb;

        vec3 f = fresnel_schlick(cos_lo, f_0, roughness);
        vec3 k_d = mix(vec3(1.0) - f, vec3(0.0), metallic);
        vec3 diffuse = k_d * irradiance * color;

        vec3 specular_irradiance = textureLod(sky_prefilter, l_r, roughness * MAX_PREFILTER_LOD).rgb;
        vec2 brdf = texture(sky_brdf_lut, vec2(cos_lo, roughness)).rg;
        vec3 specular = specular_irradiance * (f_0 * brdf.x + brdf.y);

        ambient = (diffuse + specular) * ao;
    }
    light += ambient + vec3(uv.x) * 0.0001;

    // gamma correct
    light = light / (light + vec3(1.0));
    light = pow(light, vec3(1.0 / 2.2));
    out_color = vec4(light, 1.0);
}