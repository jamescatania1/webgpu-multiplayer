struct CameraData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
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

struct SSAOData {
    kernel: array<vec3<f32>, 64>
};
@group(3) @binding(0) var<uniform> u_ssao: SSAOData;
@group(3) @binding(2) var u_ssao_noise: texture_2d<f32>;
@group(3) @binding(1) var u_ssao_noise_sampler: sampler;

struct VertexIn {
    @location(0) vertex_xyzc: vec2<u32>,
    @location(1) vertex_normal: u32,
    @location(2) vertex_uv: u32,
};

struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) world_pos: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
    @location(3) color: vec3f,
    @location(4) view_pos: vec4f,
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
    // var normal_matrix: mat3x3<f32> = transpose(inverse(mat3x3<f32>(u_transform.model_matrix) ));

    let u: f32 = f32(in.vertex_uv >> 16u) / 65535.0;
    let v: f32 = f32(in.vertex_uv & 0xFFFFu) / 65535.0;

    var out: VertexOut;
    out.pos = clip_pos;
    out.world_pos = vec3f(world_pos.xyz);
    out.normal = u_transform.normal_matrix * vec3f(nx, ny, nz);
    out.uv = vec2f(u, v);
    out.color = vec3f(r, g, b);
    out.view_pos = view_pos;
    return out;
}

@fragment 
fn fs(in: VertexOut) -> FragmentOut {
    // not pbr yet

    let sun_direction: vec3f = normalize(vec3f(2.0, 3.0, 1.0));
    let sun_color: vec4f = vec4f(1.0, 1.0, 1.0, 1.0);

    let n = normalize(in.normal);
    let l = sun_direction;
    let lambert = max(dot(n, l), 0.0);
    var color = lambert * sun_color.rgb * in.color;
    color = color * 0.5 + in.color * 0.5;

    var view_pos = in.view_pos.xyz;
    // screen_uv = screen_uv * 0.5 + 0.5;
    // screen_uv.y = 1.0 - screen_uv.y;

    // SSAO
    var random_vec: vec3f = vec3f(0.2, 0.1, 0.3) * 0.5;
    var tangent: vec3f = normalize(random_vec - n * dot(random_vec, n));
    var bitangent: vec3f = cross(n, tangent);
    var tbn: mat3x3<f32> = mat3x3<f32>(tangent, bitangent, n);
    var occlusion: f32 = 0.0;
    for (var i: i32 = 0; i < 64; i++) {
        var sample_pos: vec3f = tbn * u_ssao.kernel[i];
        sample_pos = sample_pos * 0.5 + view_pos;
        
        var offset: vec4f = vec4f(sample_pos, 1.0);
        offset = u_global.proj_matrix * offset;
        offset = offset / offset.w;
        offset = offset * 0.5 + 0.5;
        offset.y = 1.0 - offset.y;

        var sample_depth: f32 = textureSample(u_depth, u_depth_sampler, offset.xy).r;
        var range_check: f32 = smoothstep(0.0, 1.0, 0.1 / abs(view_pos.z - sample_depth));
        if (sample_depth >= sample_pos.z + 0.01) {
            occlusion += 1.0 * range_check;
        }
        // occlusion += sample_pos.z / 64.0;
    }
    occlusion = 1.0 - (occlusion / f32(64));

    var out: FragmentOut;
    out.color = vec4f(color, 1.0);
    out.occlusion = occlusion * vec4f(1.0);
    // out.occlusion = view_pos.z * vec4f(1.0);

    // var screen_pos: vec2f = (u_global.proj_matrix * in.view_pos).xy / (u_global.proj_matrix * in.view_pos).w;
    // screen_pos = screen_pos * 0.5 + 0.5;
    // screen_pos.y = 1.0 - screen_pos.y;
    // out.occlusion = textureSample(u_depth, u_depth_sampler, screen_pos).r * vec4f(1.0);
    return out;
}