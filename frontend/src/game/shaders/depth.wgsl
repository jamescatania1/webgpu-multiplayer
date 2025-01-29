override near = 0.1;
override far = 300.0;

struct CameraData {
    view_proj_matrix: mat4x4<f32>,
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

struct VertexIn {
    @location(0) vertex_xyzc: vec2<u32>,
}

struct VertexOut {
    @builtin(position) pos: vec4f,
    // @location(0) world_pos: vec3f,
};

@vertex 
fn vs(in: VertexIn) -> VertexOut {
    let x: f32 = f32(in.vertex_xyzc.x >> 16u) / 65535.0 - 0.5;
    let y: f32 = f32(in.vertex_xyzc.x & 0xFFFFu) / 65535.0 - 0.5;
    let z: f32 = f32(in.vertex_xyzc.y >> 16u) / 65535.0 - 0.5;
    let world_pos: vec4f = u_transform.model_matrix * vec4f(vec3f(x, y, z) * u_transform.model_scale + u_transform.model_offset, 1.0);

    var out: VertexOut;
    out.pos = u_global.view_proj_matrix * world_pos;
    return out;
}

fn linearize_depth(depth: f32) -> f32 {
    return (2.0 * far * near) / (far + near - (depth * 2.0 - 1.0) * (far - near));
}

@fragment 
fn fs(in: VertexOut) -> @location(0) vec4f {
    return vec4f(linearize_depth(in.pos.z) / far, 1.0, 1.0, 1.0);
}