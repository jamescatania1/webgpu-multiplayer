struct CameraData {
    view_proj_matrix: mat4x4<f32>,
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
    @location(1) vertex_uv: u32,
    @location(2) vertex_normal: u32,
}

struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) world_pos: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
    @location(3) color: vec3f
};

// process the points of the triangle
@vertex 
fn vs(in: VertexIn) -> VertexOut {
    var x: f32 = f32(in.vertex_xyzc.x >> 16u) / 65535.0 - 0.5;
    var y: f32 = f32(in.vertex_xyzc.x & 0xFFFFu) / 65535.0 - 0.5;
    var z: f32 = f32(in.vertex_xyzc.y >> 16u) / 65535.0 - 0.5;
    var world_pos: vec4f = u_transform.model_matrix * vec4f(vec3f(x, y, z) * u_transform.model_scale, 1.0) + vec4f(u_transform.model_offset, 0.0);
    
    var r: f32 = f32((in.vertex_xyzc.y >> 11u) & 0x1Fu) / 31.0;
    var g: f32 = f32((in.vertex_xyzc.y >> 5u) & 0x3Fu) / 63.0;
    var b: f32 = f32(in.vertex_xyzc.y & 0x1Fu) / 31.0;

    var nx: f32 = f32(in.vertex_normal >> 22u) / 511.5 - 1.0;
    var ny: f32 = f32((in.vertex_normal >> 12u) & 0x3FFu) / 511.5 - 1.0;
    var nz: f32 = f32((in.vertex_normal >> 2u) & 0x3FFu) / 511.5 - 1.0;

    var u: f32 = f32(in.vertex_uv >> 16u) / 65535.0;
    var v: f32 = f32(in.vertex_uv & 0xFFFFu) / 65535.0;

    var out: VertexOut;
    out.pos = u_global.view_proj_matrix * world_pos;
    out.world_pos = vec3f(world_pos.xyz);
    out.normal = u_transform.normal_matrix * vec3f(nx, ny, nz);
    out.uv = vec2f(u, v);
    out.color = vec3f(r, g, b);
    return out;
}

// set the colors of the area within the triangle
@fragment 
fn fs(in: VertexOut) -> @location(0) vec4f {
    return vec4f(in.color, 1.0);
}