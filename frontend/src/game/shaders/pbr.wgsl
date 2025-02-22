override near: f32;
override far: f32;
override ambient_intensity: f32;
override debug_cascades: bool;
override shadow_fade_distance: f32;
override fog_start: f32;
override fog_end: f32;
override fog_mip_level: f32;

struct TransformData {
    model_matrix: mat4x4<f32>,
    normal_matrix: mat3x3<f32>,
    model_offset: vec3<f32>,
    model_scale: f32,
}
@group(0) @binding(0) var<storage, read> u_transform: array<TransformData>;

struct CulledInstances {
    instances: array<u32>,
}
@group(0) @binding(1) var<storage, read> u_culled: CulledInstances;

struct CameraData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
    camera_position: vec3<f32>,
}
@group(1) @binding(0) var<uniform> u_global: CameraData;
struct ShadowData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
    depth_scale: f32,
    bias: f32,
    normal_bias: f32,
    samples: f32,
    blocker_samples: f32,
    near: f32,
    far: f32,
    align_padding_1: vec4<f32>,
    align_padding_2: vec4<f32>,
    align_padding_3: mat4x4<f32>,
}
@group(1) @binding(2) var<uniform> u_shadow: array<ShadowData, 3>;

@group(2) @binding(0) var u_depth_sampler: sampler;
@group(2) @binding(1) var u_shadowmap: texture_depth_2d_array;
@group(2) @binding(2) var<uniform> u_screen_size: vec2<f32>;
@group(2) @binding(3) var u_ssao: texture_2d<f32>;

@group(3) @binding(2) var u_scene_sampler: sampler;
@group(3) @binding(3) var u_irradiance: texture_cube<f32>;
@group(3) @binding(4) var u_prefilter: texture_cube<f32>;
@group(3) @binding(5) var u_brdf: texture_2d<f32>;
struct LightingData {
    sun_direction: vec3<f32>,
    sun_color: vec4<f32>,
};
@group(3) @binding(7) var<uniform> u_lighting: LightingData;
@group(3) @binding(8) var u_shadowmap_sampler_comparison: sampler_comparison;
@group(3) @binding(9) var u_shadowmap_sampler: sampler;
@group(3) @binding(10) var<uniform> u_shadowmap_kernel:  array<vec4<f32>, TEMPL_shadow_kernel_size>;

struct VertexIn { 
    @builtin(instance_index) instance: u32,
    @location(0) vertex_xyzc: vec2<u32>,
    @location(1) vertex_normal: u32,
    @location(2) vertex_uv: u32,
};

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) view_normal: vec3<f32>,
    @location(3) uv: vec2<f32>,
    @location(4) screen_uv: vec2<f32>,
    @location(5) color: vec3<f32>,
    @location(6) view_pos: vec4<f32>,
    @location(7) vertex_pos_hash: vec2<f32>,
    @location(8) shadow_clip_pos_0: vec4<f32>,
    @location(9) shadow_clip_pos_1: vec4<f32>,
    @location(10) shadow_clip_pos_2: vec4<f32>,
};

struct FragmentOut {
    @location(0) color: vec4<f32>,
    @location(1) occlusion: vec4<f32>,
};

@vertex 
fn vs(in: VertexIn) -> VertexOut {
    let instance_index: u32 = u_culled.instances[in.instance];
    let transform: TransformData = u_transform[instance_index];

    let x: f32 = f32(in.vertex_xyzc.x >> 16u) / 65535.0 - 0.5;
    let y: f32 = f32(in.vertex_xyzc.x & 0xFFFFu) / 65535.0 - 0.5;
    let z: f32 = f32(in.vertex_xyzc.y >> 16u) / 65535.0 - 0.5;
    let world_pos: vec4<f32> = transform.model_matrix * vec4<f32>(vec3<f32>(x, y, z) * transform.model_scale + transform.model_offset, 1.0);
    let view_pos: vec4<f32> = u_global.view_matrix * world_pos;
    let clip_pos: vec4<f32> = u_global.proj_matrix * view_pos;

    let r: f32 = f32((in.vertex_xyzc.y >> 11u) & 0x1Fu) / 31.0;
    let g: f32 = f32((in.vertex_xyzc.y >> 5u) & 0x3Fu) / 63.0;
    let b: f32 = f32(in.vertex_xyzc.y & 0x1Fu) / 31.0;

    let nx: f32 = f32(in.vertex_normal >> 22u) / 511.5 - 1.0;
    let ny: f32 = f32((in.vertex_normal >> 12u) & 0x3FFu) / 511.5 - 1.0;
    let nz: f32 = f32((in.vertex_normal >> 2u) & 0x3FFu) / 511.5 - 1.0;
    let normal = transform.normal_matrix * vec3<f32>(nx, ny, nz);

    let u: f32 = f32(in.vertex_uv >> 16u) / 65535.0;
    let v: f32 = f32(in.vertex_uv & 0xFFFFu) / 65535.0;

    let n: vec3<f32> = normalize(normal);
    let cos_lo = dot(normalize(u_lighting.sun_direction), n);
    let shadow_clip_pos_0: vec4<f32> = shadow_clip_pos(0, n, cos_lo, world_pos);
    let shadow_clip_pos_1: vec4<f32> = shadow_clip_pos(1, n, cos_lo, world_pos);
    let shadow_clip_pos_2: vec4<f32> = shadow_clip_pos(2, n, cos_lo, world_pos);

    var out: VertexOut;
    out.pos = clip_pos;
    out.view_pos = view_pos;
    out.world_pos = vec3<f32>(world_pos.xyz);
    out.normal = normal;
    out.view_normal = (u_global.view_matrix * (transform.model_matrix * vec4<f32>(normal.xyz, 0.0))).xyz;
    out.uv = vec2<f32>(u, v);
    out.screen_uv = (clip_pos.xy / clip_pos.w) * 0.5 + 0.5;
    out.screen_uv.y = 1.0 - out.screen_uv.y;
    out.color = vec3<f32>(r, g, b);
    out.vertex_pos_hash = vec2<f32>(x + y, z + x);
    out.shadow_clip_pos_0 = shadow_clip_pos_0;
    out.shadow_clip_pos_1 = shadow_clip_pos_1;
    out.shadow_clip_pos_2 = shadow_clip_pos_2;
    return out;
}

// bias the shadowmap sample based on the world normals
// https://web.archive.org/web/20180524211931/https://www.dissidentlogic.com/old/images/NormalOffsetShadows/GDC_Poster_NormalOffset.png
fn shadow_clip_pos(cascade: i32, n: vec3<f32>, cos_lo: f32, world_pos: vec4<f32>) -> vec4<f32> {
    let offset_normal_scale: f32 = saturate(1.0 - cos_lo) * u_shadow[cascade].normal_bias;
    let shadow_offset = vec4<f32>(n * offset_normal_scale, 0.0);
    let shadow_clip_pos: vec4<f32> = u_shadow[cascade].proj_matrix * (u_shadow[cascade].view_matrix * world_pos);
    let shadow_uv_offset_pos: vec4<f32> = u_shadow[cascade].proj_matrix * (u_shadow[cascade].view_matrix * (world_pos + shadow_offset));
    return vec4<f32>(shadow_uv_offset_pos.xy, shadow_clip_pos.zw);
}

const sun_size: f32 = 4.0;

fn shadow_blocker_distance(cascade_index: i32, shadow_pos: vec3<f32>, hash: f32) -> f32 {
    let frag_depth = shadow_pos.z;
    let shadowmap_pos = shadow_pos.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
    if (shadowmap_pos.x < 0.0 || shadowmap_pos.x > 1.0 || shadowmap_pos.y < 0.0 || shadowmap_pos.y > 1.0 || frag_depth > 1.0) {
        return -1.0;
    }

    let texel_size: vec2<f32> = vec2<f32>(1.0) / vec2<f32>(textureDimensions(u_shadowmap).xy);
    var search_radius: f32 = sun_size * (frag_depth - near) / frag_depth;
    search_radius = 10.0;
    let samples: i32 = i32(u_shadow[cascade_index].blocker_samples);

    var blocker_count: i32 = 0;
    var blocker_distance: f32 = 0.0;
    for (var i: i32 = 0; i < samples; i++) {
        let r_theta: vec2<f32> = u_shadowmap_kernel[i].xy + vec2<f32>(0.0, hash);
        let sample_offset: vec2<f32> = vec2<f32>(cos(r_theta.y), sin(r_theta.y)) * search_radius;
        let sample_pos: vec2<f32> = shadowmap_pos + sample_offset * texel_size;
        let sample_depth = textureSampleLevel(u_shadowmap, u_shadowmap_sampler, sample_pos, cascade_index, 0);
        if (sample_depth < frag_depth) {
            blocker_count += 1;
            blocker_distance += sample_depth;
        }
    }

    if (blocker_count > 0) {
        return blocker_distance / f32(blocker_count);
    } else {
        return -1.0;
    }
}

fn shadow(cascade_index: i32, shadow_pos: vec3<f32>, world_pos: vec3<f32>) -> f32 {
    let hash: f32 = fract(sin(dot(world_pos, vec3<f32>(12.9898, 78.233, 151.7182))) * 43758.5453);
    let texel_size: vec2<f32> = vec2<f32>(1.0) / vec2<f32>(textureDimensions(u_shadowmap).xy);

    let blocker_distance: f32 = shadow_blocker_distance(cascade_index, shadow_pos, hash);
    if (blocker_distance < 0.0) {
        return 0.0;
    }

    let frag_depth: f32 = shadow_pos.z;
    let shadowmap_pos: vec2<f32> = shadow_pos.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
    let samples: i32 = i32(u_shadow[cascade_index].samples);
    let penumbra_width: f32 = clamp(sun_size * (frag_depth - blocker_distance) / blocker_distance, 0.05, 10.2);

    var res: f32 = 0.0;
    for (var i: i32 = 0; i < samples; i++) {
        let r_theta: vec2<f32> = u_shadowmap_kernel[i].xy + vec2<f32>(0.0, hash * 1.0);
        let sample_offset: vec2<f32> = vec2<f32>(cos(r_theta.y), sin(r_theta.y)) * r_theta.x * penumbra_width;
        let sample_pos: vec2<f32> = shadowmap_pos + sample_offset * texel_size * 100.0;
        res += 1.0 - textureSampleCompareLevel(
            u_shadowmap, 
            u_shadowmap_sampler_comparison,
            sample_pos,
            cascade_index,
            frag_depth - u_shadow[cascade_index].bias
        );
    }
    return res / f32(samples);
}

fn visualize_cascades(in: VertexOut) -> vec3<f32> {
    let view_depth = abs(in.view_pos.z);
    var cascade_index: i32 = 0;
    var shadow_pos: vec3<f32> = vec3<f32>(0.0);
    if (view_depth < u_shadow[0].far) {
        cascade_index = 0;
        shadow_pos = in.shadow_clip_pos_0.xyz / in.shadow_clip_pos_0.w;
    }
    else if (view_depth < u_shadow[1].far) {
        cascade_index = 1;
        shadow_pos = in.shadow_clip_pos_1.xyz / in.shadow_clip_pos_1.w;
    }
    else if (view_depth < u_shadow[2].far) {
        cascade_index = 2;
        shadow_pos = in.shadow_clip_pos_2.xyz / in.shadow_clip_pos_2.w;
    }
    else {
        return vec3<f32>(0.0);
    }
    let shadowmap_pos = shadow_pos.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
    if (shadowmap_pos.x < 0.0 || shadowmap_pos.x > 1.0 || shadowmap_pos.y < 0.0 || shadowmap_pos.y > 1.0 || shadow_pos.z > 1.0) {
        return vec3<f32>(0.0);
    }
    if (cascade_index == 0) {
        return vec3<f32>(1.0, 0.0, 0.0);
    }
    else if (cascade_index == 1) {
        return vec3<f32>(0.0, 1.0, 0.0);
    }
    else {
        if (distance(in.world_pos, u_global.camera_position) > u_shadow[2].far) {
            return vec3<f32>(1.0, 1.0, 0.0);
        }
        return vec3<f32>(0.0, 0.0, 1.0);
    }
}

@fragment 
fn fs(in: VertexOut) -> FragmentOut {
    let n = normalize(in.normal);
    let rough: f32 = 0.75;
    let metal: f32 = 0.0;
    let albedo: vec3<f32> = in.color;

    let l_o: vec3<f32> = normalize(u_global.camera_position - in.world_pos);

    let cos_lo: f32 = max(dot(n, l_o), 0.0);
    let l_r: vec3<f32> = 2.0 * cos_lo * n - l_o;

    let f_0: vec3<f32> = mix(vec3<f32>(0.04), albedo, metal);
    var light: vec3<f32> = vec3<f32>(0.0);

    var directional: vec3<f32>; {
        let l_i: vec3<f32> = normalize(u_lighting.sun_direction);
        let l_radiance: vec3<f32> = u_lighting.sun_color.rgb * u_lighting.sun_color.a;

        let l_half: vec3<f32> = normalize(l_i + l_o);
        let cos_li: f32 = max(dot(n, l_i), 0.0);
        let cos_lh: f32 = max(dot(n, l_half), 0.0);

        let f: vec3<f32> = fresnel_schlick(max(0.0, dot(l_half, l_o)), f_0, rough);
        let d: f32 = ndf_ggx(cos_lh, rough);
        let g: f32 = geom_schlick_ggx(cos_li, cos_lo, rough);

        let k_d: vec3<f32> = mix(vec3<f32>(1.0) - f, vec3<f32>(0.0), metal);
        let diffuse_brdf: vec3<f32> = k_d * albedo;
        let specular_brdf: vec3<f32> = f * d * g / (4.0 * max(0.0001, cos_lo * cos_li));

        directional = l_radiance * cos_li * (diffuse_brdf + specular_brdf);
    }

    // shadows
    let view_depth = abs(in.view_pos.z);
    var shadow_factor: f32 = 0.0;
    if (view_depth < u_shadow[0].far) {
        shadow_factor = shadow(0, in.shadow_clip_pos_0.xyz / in.shadow_clip_pos_0.w, in.world_pos);
        if (u_shadow[1].near < view_depth) {
            let shadow_factor_alt = shadow(1, in.shadow_clip_pos_1.xyz / in.shadow_clip_pos_1.w, in.world_pos);
            shadow_factor = mix(shadow_factor, shadow_factor_alt, (view_depth - u_shadow[1].near) / (u_shadow[0].far - u_shadow[1].near));
        }
    }
    else if (view_depth < u_shadow[1].far) {
        shadow_factor = shadow(1, in.shadow_clip_pos_1.xyz / in.shadow_clip_pos_1.w, in.world_pos);
        if (u_shadow[2].near < view_depth) {
            let shadow_factor_alt = shadow(2, in.shadow_clip_pos_2.xyz / in.shadow_clip_pos_2.w, in.world_pos);
            shadow_factor = mix(shadow_factor, shadow_factor_alt, (view_depth - u_shadow[2].near) / (u_shadow[1].far - u_shadow[2].near));
        }
    }
    else if (view_depth < u_shadow[2].far) {
        let cam_distance: f32 = distance(in.world_pos, u_global.camera_position);
        if (cam_distance < u_shadow[2].far) {
            shadow_factor = shadow(2, in.shadow_clip_pos_2.xyz / in.shadow_clip_pos_2.w, in.world_pos);
            shadow_factor *= saturate((u_shadow[2].far - cam_distance) / shadow_fade_distance);
        }
    }

    light += directional * (1.0 - shadow_factor);

    var ambient: vec3<f32>; {
        let irradiance: vec3<f32> = textureSample(u_irradiance, u_scene_sampler, n).rgb;
        
        let f: vec3<f32> = fresnel_schlick(cos_lo, f_0, rough);
        let k_d: vec3<f32> = mix(vec3<f32>(1.0) - f, vec3<f32>(0.0), metal);
        let diffuse: vec3<f32> = k_d * irradiance * albedo;

        let specular_irradiance: vec3<f32> = textureSampleLevel(u_prefilter, u_scene_sampler, l_r, rough * 4.0).rgb;
        let brdf: vec2<f32> = textureSample(u_brdf, u_scene_sampler, vec2<f32>(clamp(cos_lo, 0.01, 0.99), rough)).rg;
        let specular: vec3<f32> = specular_irradiance * (f_0 * brdf.x + brdf.y);
        ambient = diffuse + specular;
    }

    // SSAO
    let occlusion: f32 = 1.0 - textureSample(u_ssao, u_scene_sampler, in.pos.xy / u_screen_size).r;
    light += ambient * ambient_intensity;


    var color: vec3<f32> = light;

    // fog
    let fog_factor: f32 = saturate((view_depth - fog_start) / (fog_end - fog_start));
    let fog_mip: f32 = max(1.0, fog_mip_level * (1.0 - fog_factor));
    var fog_sky_color = textureSampleLevel(
        u_prefilter, 
        u_scene_sampler, 
        normalize(in.world_pos - u_global.camera_position), 
        fog_mip
    ).rgb;
    fog_sky_color = pow(fog_sky_color, vec3<f32>(1.0 / 2.2));
    color = mix(color, fog_sky_color, fog_factor);

    if (debug_cascades) {
        color = mix(color, visualize_cascades(in), 0.75);
    }

    var out: FragmentOut;
    out.color = vec4<f32>(color * occlusion, 1.0);
    out.occlusion = vec4<f32>(color, 1.0);
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

fn fresnel_schlick(cos_theta: f32, f_0: vec3<f32>, r: f32) -> vec3<f32> {
    return f_0 + (max(vec3<f32>(1.0 - r), f_0) - f_0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}