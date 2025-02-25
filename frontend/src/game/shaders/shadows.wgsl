
struct TransformData {
    model_matrix: mat4x4<f32>,
    normal_matrix: mat3x3<f32>,
    model_offset: vec3<f32>,
    model_scale: vec3<f32>,
    cast_shadows: f32,
}
@group(0) @binding(0) var<storage, read> u_transform: array<TransformData>;

struct CulledInstances {
    instances: array<u32>,
}
@group(0) @binding(1) var<storage, read> u_culled: CulledInstances;

struct ShadowData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
    radius: f32,
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
    let instance_index: u32 = u_culled.instances[in.instance];
    let transform: TransformData = u_transform[instance_index];

    let x: f32 = f32(in.vertex_xyzc.x >> 16u) / 65535.0 - 0.5;
    let y: f32 = f32(in.vertex_xyzc.x & 0xFFFFu) / 65535.0 - 0.5;
    let z: f32 = f32(in.vertex_xyzc.y >> 16u) / 65535.0 - 0.5;
    let world_pos: vec4f = transform.model_matrix * vec4f(vec3f(x, y, z) * transform.model_scale + transform.model_offset, 1.0);

    var out: VertexOut;
    out.pos = u_shadow.proj_matrix * (u_shadow.view_matrix * world_pos);
    return out;
}

@fragment 
fn fs(in: VertexOut) {
    // return vec4f((in.pos.z + u_shadow.bias) * u_shadow.depth_scale, 1.0, 1.0, 1.0);
}