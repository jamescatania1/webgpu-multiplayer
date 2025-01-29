struct GlobalData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> u_global: GlobalData;

struct ModelData {
    model_matrix: mat4x4<f32>,
}
@group(1) @binding(0) var<uniform> u_model: ModelData;

struct VertexIn {
    @location(0) pos: vec3f,
    @location(1) color: vec3f,
}

struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) color: vec4f
};

// process the points of the triangle
@vertex 
fn vs(in: VertexIn) -> VertexOut {
    var out: VertexOut;
    out.pos = u_global.proj_matrix * u_global.view_matrix * u_model.model_matrix * vec4f(in.pos, 1.0);
    out.color = vec4f(in.color, 1.0);
    return out;
}

// set the colors of the area within the triangle
@fragment 
fn fs(in: VertexOut) -> @location(0) vec4f {
    return in.color;
}