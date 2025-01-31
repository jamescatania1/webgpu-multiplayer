override ssao_samples: i32 = 64;
override ssao_radius: f32 = 0.5;
override ssao_bias: f32 = 0.05;
override ssao_noise_scale: f32 = 100.0;
override ssao_fade_start: f32 = 45.0;
override ssao_fade_end: f32 = 105.0;
override near: f32 = 0.1;
override far: f32 = 300.0;

struct CameraData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
    camera_position: vec3<f32>,
}
@group(0) @binding(0) var<uniform> u_global: CameraData;

struct TransformData {
    model_matrix: mat4x4<f32>,
    normal_matrix: mat3x3<f32>,
    model_offset: vec3<f32>,
    model_scale: f32,
}
@group(1) @binding(0) var<uniform> u_transform: TransformData;

@group(2) @binding(0) var u_depth: texture_2d<f32>;
@group(2) @binding(1) var u_depth_sampler: sampler;
@group(2) @binding(2) var<uniform> u_screen_size: vec2<f32>;

@group(3) @binding(0) var u_ssao_noise_sampler: sampler;
@group(3) @binding(1) var u_ssao_noise: texture_2d<f32>;
@group(3) @binding(2) var u_scene_sampler: sampler;
@group(3) @binding(3) var u_irradiance: texture_cube<f32>;
@group(3) @binding(4) var u_prefilter: texture_cube<f32>;
@group(3) @binding(5) var u_brdf: texture_2d<f32>;
struct SSAOData {
    kernel: array<vec3<f32>, TEMPL_ssao_samples>,
};
@group(3) @binding(6) var<uniform> u_ssao: SSAOData;
struct LightingData {
    sun_direction: vec3<f32>,
    sun_color: vec4<f32>,
};
@group(3) @binding(7) var<uniform> u_lighting: LightingData;

struct VertexIn { 
    @location(0) vertex_xyzc: vec2<u32>,
    @location(1) vertex_normal: u32,
    @location(2) vertex_uv: u32,
};

struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) world_pos: vec3f,
    @location(1) normal: vec3f,
    @location(2) view_normal: vec3f,
    @location(3) uv: vec2f,
    @location(4) screen_uv: vec2f,
    @location(5) color: vec3f,
    @location(6) view_pos: vec4f,
    @location(7) vertex_pos_hash: vec2f,
};

struct FragmentOut {
    @location(0) color: vec4f,
    @location(1) occlusion: vec4f,
};

@vertex 
fn vs(in: VertexIn) -> VertexOut {
    let x: f32 = f32(in.vertex_xyzc.x >> 16u) / 65535.0 - 0.5;
    let y: f32 = f32(in.vertex_xyzc.x & 0xFFFFu) / 65535.0 - 0.5;
    let z: f32 = f32(in.vertex_xyzc.y >> 16u) / 65535.0 - 0.5;
    let world_pos: vec4f = u_transform.model_matrix * vec4f(vec3f(x, y, z) * u_transform.model_scale + u_transform.model_offset, 1.0);
    let view_pos: vec4f = u_global.view_matrix * world_pos;
    let clip_pos: vec4f = u_global.proj_matrix * view_pos;

    let r: f32 = f32((in.vertex_xyzc.y >> 11u) & 0x1Fu) / 31.0;
    let g: f32 = f32((in.vertex_xyzc.y >> 5u) & 0x3Fu) / 63.0;
    let b: f32 = f32(in.vertex_xyzc.y & 0x1Fu) / 31.0;

    let nx: f32 = f32(in.vertex_normal >> 22u) / 511.5 - 1.0;
    let ny: f32 = f32((in.vertex_normal >> 12u) & 0x3FFu) / 511.5 - 1.0;
    let nz: f32 = f32((in.vertex_normal >> 2u) & 0x3FFu) / 511.5 - 1.0;

    let u: f32 = f32(in.vertex_uv >> 16u) / 65535.0;
    let v: f32 = f32(in.vertex_uv & 0xFFFFu) / 65535.0;

    var out: VertexOut;
    out.pos = clip_pos;
    out.view_pos = view_pos;
    out.world_pos = vec3f(world_pos.xyz);
    out.normal = u_transform.normal_matrix * vec3f(nx, ny, nz);
    out.view_normal = (u_global.view_matrix * (u_transform.model_matrix * vec4f(nx, ny, nz, 0.0))).xyz;
    out.uv = vec2f(u, v);
    out.screen_uv = (clip_pos.xy / clip_pos.w) * 0.5 + 0.5;
    out.screen_uv.y = 1.0 - out.screen_uv.y;
    out.color = vec3f(r, g, b);
    out.vertex_pos_hash = vec2f(x + y, z + x);
    return out;
}

fn ssao(view_pos: vec3f, view_normal: vec3f, sample_location: vec2f, clip_z: f32) -> f32 {
    var v_n = normalize(view_normal);
    var random_vec: vec3f = normalize(textureSample(u_ssao_noise, u_ssao_noise_sampler, sample_location * ssao_noise_scale).xyz);
    var tangent: vec3f = normalize(random_vec - v_n * dot(random_vec, v_n));
    var bitangent: vec3f = cross(v_n, tangent);
    var tbn: mat3x3<f32> = mat3x3<f32>(tangent, bitangent, v_n);
    var occlusion: f32 = 0.0;
    for (var i: i32 = 0; i < ssao_samples; i++) {
        var sample_pos: vec3f = tbn * u_ssao.kernel[i];
        sample_pos = sample_pos * ssao_radius + view_pos;
        
        var offset: vec4f = vec4f(sample_pos, 1.0);
        offset = u_global.proj_matrix * offset;
        offset = offset / offset.w;
        offset = offset * 0.5 + 0.5;
        offset.y = 1.0 - offset.y;

        var sample_depth: f32 = textureSample(u_depth, u_depth_sampler, offset.xy).r;
        var range_check: f32 = smoothstep(0.0, 1.0, ssao_radius / abs(view_pos.z - sample_depth));
        let d_z = sample_depth - sample_pos.z;
        if (d_z > ssao_bias && d_z < ssao_radius) {
            occlusion += 1.0 * range_check;
        }
    }
    occlusion /= f32(ssao_samples);
    
    // fades out occlusion at further distances
    let depth_linear: f32 = (2.0 * near) / (far + near - (clip_z * 2.0 - 1.0) * (far - near));
    let occlusion_fade: f32 = 1.0 - clamp((depth_linear * (far - near) - ssao_fade_start) / (ssao_fade_end - ssao_fade_start), 0.0, 1.0);
    occlusion = clamp(1.0 - occlusion_fade * occlusion, 0.0, 1.0);

    return occlusion;
}


@fragment 
fn fs(in: VertexOut) -> FragmentOut {
    let n = normalize(in.normal);
    let rough: f32 = 0.91;
    let metal: f32 = 0.0;
    let albedo: vec3f = in.color;

    let l_o: vec3f = normalize(u_global.camera_position - in.world_pos);

    let cos_lo: f32 = max(dot(n, l_o), 0.0);
    let l_r: vec3f = 2.0 * cos_lo * n - l_o;

    let f_0: vec3f = mix(vec3f(0.04), albedo, metal);
    var light: vec3f = vec3f(0.0);

    var directional: vec3f; {
        let l_i: vec3f = normalize(u_lighting.sun_direction);
        let l_radiance: vec3f = u_lighting.sun_color.rgb * u_lighting.sun_color.a;

        let l_half: vec3f = normalize(l_i + l_o);
        let cos_li: f32 = max(dot(n, l_i), 0.0);
        let cos_lh: f32 = max(dot(n, l_half), 0.0);

        let f: vec3f = fresnel_schlick(max(0.0, dot(l_half, l_o)), f_0, rough);
        let d: f32 = ndf_ggx(cos_lh, rough);
        let g: f32 = geom_schlick_ggx(cos_li, cos_lo, rough);

        let k_d: vec3f = mix(vec3<f32>(1.0) - f, vec3<f32>(0.0), metal);
        let diffuse_brdf: vec3f = k_d * albedo;
        let specular_brdf: vec3f = f * d * g / (4.0 * max(0.0001, cos_lo * cos_li));

        directional = l_radiance * cos_li * (diffuse_brdf + specular_brdf);
    }
    light += directional;

    var ambient: vec3<f32>; {
        let irradiance: vec3<f32> = textureSample(u_irradiance, u_scene_sampler, n).rgb;
        
        let f: vec3<f32> = fresnel_schlick(cos_lo, f_0, rough);
        let k_d: vec3<f32> = mix(vec3<f32>(1.0) - f, vec3<f32>(0.0), metal);
        let diffuse: vec3<f32> = k_d * irradiance * albedo;

        let specular_irradiance: vec3<f32> = textureSampleLevel(u_prefilter, u_scene_sampler, l_r, rough * 4.0).rgb;
        let brdf: vec2<f32> = textureSample(u_brdf, u_scene_sampler, vec2<f32>(cos_lo, rough)).rg;
        let specular: vec3<f32> = specular_irradiance * (f_0 * brdf.x + brdf.y);
        ambient = diffuse + specular;
    }

    // SSAO
    let occlusion = ssao(in.view_pos.xyz, in.view_normal, in.vertex_pos_hash, in.pos.z);

    light += occlusion * ambient;

    var color: vec3f = light;

    var out: FragmentOut;
    out.color = vec4f(color, 1.0);
    // out.occlusion = occlusion * vec4f(1.0);
    out.occlusion = vec4f(color, 1.0);
    // out.occlusion = vec4f(1.0) - vec4f(occlusion_fade * occlusion);
    

    return out;
}

fn ndf_ggx(cos_lh: f32, r: f32) -> f32 {
	let alpha: f32 = r * r;
	let alpha_sq: f32 = alpha * alpha;
	let denom: f32 = (cos_lh * cos_lh) * (alpha_sq - 1.0) + 1.0;
	return alpha_sq / (3.14159265 * denom * denom);
}

fn geom_schlick_ggx(cos_li: f32, cos_lo: f32, r: f32) -> f32 {
	let k: f32 = ((r + 1.0) * (r + 1.0)) / 8.0;
    let ggx_1: f32 = cos_li / (cos_li * (1.0 - k) + k);
    let ggx_2: f32 = cos_lo / (cos_lo * (1.0 - k) + k);
	return ggx_1 * ggx_2;
}

fn fresnel_schlick(cos_theta: f32, f_0: vec3f, r: f32) -> vec3f {
    return f_0 + (max(vec3f(1.0 - r), f_0) - f_0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}