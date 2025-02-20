
struct TransformData {
    model_matrix: mat4x4<f32>,
    normal_matrix: mat3x3<f32>,
    model_offset: vec3<f32>,
    model_scale: f32,
}
@group(0) @binding(0) var<storage, read> u_transform: array<TransformData>;

struct ShadowData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
    depth_scale: f32,
    bias: f32,
    normal_bias: f32,
    pcf_radius: f32,
    near: f32,
    far: f32,
}
@group(1) @binding(0) var<uniform> u_shadow: ShadowData;

struct VertexIn {
    @builtin(instance_index) instance: u32,
    @location(0) vertex_xyzc: vec2<u32>,
}

struct VertexOut {
    @builtin(position) pos: vec4f,
};

@vertex 
fn vs(in: VertexIn) -> VertexOut {
    let transform: TransformData = u_transform[in.instance];

    let x: f32 = f32(in.vertex_xyzc.x >> 16u) / 65535.0 - 0.5;
    let y: f32 = f32(in.vertex_xyzc.x & 0xFFFFu) / 65535.0 - 0.5;
    let z: f32 = f32(in.vertex_xyzc.y >> 16u) / 65535.0 - 0.5;
    let world_pos: vec4f = transform.model_matrix * vec4f(vec3f(x, y, z) * transform.model_scale + transform.model_offset, 1.0);

    var out: VertexOut;
    out.pos = u_shadow.proj_matrix * (u_shadow.view_matrix * world_pos);
    // out.pos.z += u_shadow.bias;
    return out;
}

@fragment 
fn fs(in: VertexOut) -> @location(0) vec4f {
    return vec4f((in.pos.z + u_shadow.bias) * u_shadow.depth_scale, 1.0, 1.0, 1.0);
}