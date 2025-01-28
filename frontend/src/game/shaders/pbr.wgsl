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
    @location(1) vertex_normal: u32,
    @location(2) vertex_uv: u32,
}

struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) world_pos: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
    @location(3) color: vec3f
};

@vertex 
fn vs(in: VertexIn) -> VertexOut {
    let x: f32 = f32(in.vertex_xyzc.x >> 16u) / 65535.0 - 0.5;
    let y: f32 = f32(in.vertex_xyzc.x & 0xFFFFu) / 65535.0 - 0.5;
    let z: f32 = f32(in.vertex_xyzc.y >> 16u) / 65535.0 - 0.5;
    let world_pos: vec4f = u_transform.model_matrix * vec4f(vec3f(x, y, z) * u_transform.model_scale, 1.0) + vec4f(u_transform.model_offset, 0.0);
    
    let r: f32 = f32((in.vertex_xyzc.y >> 11u) & 0x1Fu) / 31.0;
    let g: f32 = f32((in.vertex_xyzc.y >> 5u) & 0x3Fu) / 63.0;
    let b: f32 = f32(in.vertex_xyzc.y & 0x1Fu) / 31.0;

    let nx: f32 = f32(in.vertex_normal >> 22u) / 511.5 - 1.0;
    let ny: f32 = f32((in.vertex_normal >> 12u) & 0x3FFu) / 511.5 - 1.0;
    let nz: f32 = f32((in.vertex_normal >> 2u) & 0x3FFu) / 511.5 - 1.0;

    let u: f32 = f32(in.vertex_uv >> 16u) / 65535.0;
    let v: f32 = f32(in.vertex_uv & 0xFFFFu) / 65535.0;

    var out: VertexOut;
    out.pos = u_global.view_proj_matrix * world_pos;
    out.world_pos = vec3f(world_pos.xyz);
    out.normal = u_transform.normal_matrix * vec3f(nx, ny, nz);
    out.uv = vec2f(u, v);
    out.color = vec3f(r, g, b);
    return out;
}

@fragment 
fn fs(in: VertexOut) -> @location(0) vec4f {
    // not pbr yet

    let sun_direction: vec3f = normalize(vec3f(2.0, 3.0, 1.0));
    let sun_color: vec4f = vec4f(1.0, 1.0, 1.0, 1.0);

    let n = normalize(in.normal);
    let l = sun_direction;
    let lambert = max(dot(n, l), 0.0);
    var color = lambert * sun_color.rgb * in.color;
    color = color * 0.5 + in.color * 0.5;

    return vec4f(color, 1.0);
}