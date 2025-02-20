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
@group(0) @binding(0) var<uniform> u_shadow: ShadowData;

struct VertexIn {
    @location(0) vertex_xyzc: vec2<u32>,
    @location(3) model_matrix_1: vec4<f32>,
    @location(4) model_matrix_2: vec4<f32>,
    @location(5) model_matrix_3: vec4<f32>,
    @location(6) model_matrix_4: vec4<f32>,
    @location(7) normal_matrix_1: vec3<f32>,
    @location(8) normal_matrix_2: vec3<f32>,
    @location(9) normal_matrix_3: vec3<f32>,
    @location(10) model_offset: vec3<f32>,
    @location(11) model_scale: f32,
}

struct VertexOut {
    @builtin(position) pos: vec4f,
};

@vertex 
fn vs(in: VertexIn) -> VertexOut {
    let model_matrix: mat4x4<f32> = mat4x4<f32>(
        in.model_matrix_1, 
        in.model_matrix_2, 
        in.model_matrix_3, 
        in.model_matrix_4
    );
    let normal_matrix: mat3x3<f32> = mat3x3<f32>(
        in.normal_matrix_1,
        in.normal_matrix_2,
        in.normal_matrix_3,
    );

    let x: f32 = f32(in.vertex_xyzc.x >> 16u) / 65535.0 - 0.5;
    let y: f32 = f32(in.vertex_xyzc.x & 0xFFFFu) / 65535.0 - 0.5;
    let z: f32 = f32(in.vertex_xyzc.y >> 16u) / 65535.0 - 0.5;
    let world_pos: vec4f = model_matrix * vec4f(vec3f(x, y, z) * in.model_scale + in.model_offset, 1.0);

    var out: VertexOut;
    out.pos = u_shadow.proj_matrix * (u_shadow.view_matrix * world_pos);
    // out.pos.z += u_shadow.bias;
    return out;
}

@fragment 
fn fs(in: VertexOut) -> @location(0) vec4f {
    return vec4f((in.pos.z + u_shadow.bias) * u_shadow.depth_scale, 1.0, 1.0, 1.0);
}