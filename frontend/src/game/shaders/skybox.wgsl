@group(0) @binding(0) var<uniform> u_rot_proj_matrix: mat4x4<f32>;

@group(1) @binding(0) var u_skybox: texture_cube<f32>;
@group(1) @binding(1) var u_skybox_sampler: sampler;

struct VertexIn {
    @location(0) pos: vec3<f32>,
}

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec3<f32>,
};

struct FragmentOut {
    @location(0) color: vec4f,
    @location(1) occlusion: vec4f,
};

@vertex 
fn vs(in: VertexIn) -> VertexOut {
    var out: VertexOut;
    out.pos = u_rot_proj_matrix * vec4<f32>(in.pos, 1.0);
    out.pos.z = out.pos.w;
    out.uv = in.pos;
    return out;
}

@fragment 
fn fs(in: VertexOut) -> FragmentOut {
    var sky: vec3<f32> = textureSample(u_skybox, u_skybox_sampler, in.uv).rgb;
    sky = pow(sky, vec3<f32>(1.0 / 2.2));

    var out: FragmentOut;
    out.color = vec4<f32>(sky, 1.0);
    // out.color = vec4<f32>(in.pos.z / in.pos.w);
    out.occlusion = vec4<f32>(1.0);
    return out;
}