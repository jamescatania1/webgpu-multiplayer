override ambient_intensity: f32;

@group(0) @binding(0) var color_sampler: sampler;
@group(0) @binding(1) var ambient_texture: texture_2d<f32>;
@group(0) @binding(2) var directional_texture: texture_2d<f32>;
@group(0) @binding(3) var shadow_texture: texture_2d<f32>;
@group(0) @binding(4) var ssao_texture: texture_2d<f32>;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex 
fn vs(@location(0) pos: vec2<f32>) -> VertexOut {
    var screen_pos: vec2<f32> = (pos + 1.0) / 2.0;
    screen_pos.y = 1.0 - screen_pos.y;

    var out: VertexOut;
    out.pos = vec4<f32>(pos, 0.0, 1.0);
    out.uv = screen_pos;
    return out;
}

@fragment 
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let ambient: vec3<f32> = textureSample(ambient_texture, color_sampler, in.uv).rgb;
    let directional: vec3<f32> = textureSample(directional_texture, color_sampler, in.uv).rgb;
    let shadow: f32 = textureSample(shadow_texture, color_sampler, in.uv).r;
    let occlusion: f32 = textureSample(ssao_texture, color_sampler, in.uv).r;

    var color: vec3<f32> = ambient * ambient_intensity;
    color += directional * (1.0 - shadow);
    color *= (1.0 - occlusion);

    // TODO fog

    return vec4<f32>(color, 1.0);
}