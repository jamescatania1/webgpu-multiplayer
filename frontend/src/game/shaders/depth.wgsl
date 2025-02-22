override near = 0.1;
override far = 300.0;

struct TransformData {
    model_matrix: mat4x4<f32>,
    normal_matrix: mat3x3<f32>,
    model_offset: vec3<f32>,
    model_scale: vec3<f32>,
    cast_shadows: u32,
}
@group(0) @binding(0) var<storage, read> u_transform: array<TransformData>;

struct CulledInstances {
    instances: array<u32>,
}
@group(0) @binding(1) var<storage, read> u_culled: CulledInstances;

struct CameraData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
}
@group(1) @binding(0) var<uniform> u_global: CameraData;

struct VertexIn {
    @builtin(instance_index) instance: u32,
    @location(0) vertex_xyzc: vec2<u32>,
}

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) view_pos: vec4<f32>,
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

    var out: VertexOut;
    out.pos = clip_pos;
    out.view_pos = view_pos;
    return out;
}

@fragment 
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let screen_pos: vec3<f32> = in.view_pos.xyz / in.view_pos.w;
    let view_normal = cross(dpdyFine(screen_pos), dpdxFine(screen_pos));
    return vec4<f32>(normalize(view_normal * vec3<f32>(1.0, -1.0, 1.0)), 1.0);
}