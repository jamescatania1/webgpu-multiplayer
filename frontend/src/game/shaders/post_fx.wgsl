@group(0) @binding(0) var color_sampler: sampler;
@group(0) @binding(1) var color_texture: texture_2d<f32>;

struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
};

@vertex 
fn vs(@location(0) pos: vec2f) -> VertexOut {
    var out: VertexOut;
    out.pos = vec4f(pos, 0.0, 1.0);
    out.uv = (pos + 1.0) / 2.0;
    out.uv.y = 1.0 - out.uv.y;
    return out;
}

@fragment 
fn fs(in: VertexOut) -> @location(0) vec4f {
    // return vec4f(1.0, 0.0, 1.0, 1.0);
    return textureSample(color_texture, color_sampler, in.uv);
}