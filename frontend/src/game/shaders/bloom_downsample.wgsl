override threshold: f32;
override soft_threshold: f32;

@group(0) @binding(0) var u_in_texture: texture_2d<f32>;
@group(0) @binding(1) var u_in_sampler: sampler;
@group(0) @binding(2) var u_out_texture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> u_filter: i32;

struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

@compute @workgroup_size(8, 8)
fn compute_downsample(in: ComputeIn) {
    let out_dimensions: vec2<f32> = vec2<f32>(textureDimensions(u_out_texture).xy);
    let in_dimensions: vec2<f32> = vec2<f32>(textureDimensions(u_in_texture).xy);
    let texel: vec2<f32> = 1.0 / in_dimensions;

    let pixel_pos: vec2<i32> = vec2<i32>(in.id.xy);
    let uv: vec2<f32> = vec2<f32>(pixel_pos) / vec2<f32>(out_dimensions);

    var res: vec3<f32> = vec3<f32>(0.0);

    res += textureSampleLevel(u_in_texture, u_in_sampler, uv, 0.0).rgb * 0.125;

    res += textureSampleLevel(u_in_texture, u_in_sampler, uv + texel, 0.0).rgb * 0.125;
    res += textureSampleLevel(u_in_texture, u_in_sampler, uv + vec2<f32>(texel.x, -texel.y), 0.0).rgb * 0.125;
    res += textureSampleLevel(u_in_texture, u_in_sampler, uv - texel, 0.0).rgb * 0.125;
    res += textureSampleLevel(u_in_texture, u_in_sampler, uv + vec2<f32>(-texel.x, texel.y), 0.0).rgb * 0.125;

    res += textureSampleLevel(u_in_texture, u_in_sampler, uv + vec2<f32>(texel.x * 2.0, 0.0), 0.0).rgb * 0.0625;
    res += textureSampleLevel(u_in_texture, u_in_sampler, uv + vec2<f32>(0.0, texel.y * 2.0), 0.0).rgb * 0.0625;
    res += textureSampleLevel(u_in_texture, u_in_sampler, uv + vec2<f32>(texel.x * -2.0, 0.0), 0.0).rgb * 0.0625;
    res += textureSampleLevel(u_in_texture, u_in_sampler, uv + vec2<f32>(0.0, texel.y * -2.0), 0.0).rgb * 0.0625;

    res += textureSampleLevel(u_in_texture, u_in_sampler, uv + 2.0 * texel, 0.0).rgb * 0.03125;
    res += textureSampleLevel(u_in_texture, u_in_sampler, uv + 2.0 * vec2<f32>(texel.x, -texel.y), 0.0).rgb * 0.03125;
    res += textureSampleLevel(u_in_texture, u_in_sampler, uv - 2.0 * texel, 0.0).rgb * 0.03125;
    res += textureSampleLevel(u_in_texture, u_in_sampler, uv + 2.0 * vec2<f32>(-texel.x, texel.y), 0.0).rgb * 0.03125;

    if (u_filter == 1) {
        res = prefilter(res);
    }

    textureStore(u_out_texture, vec2<i32>(in.id.xy), vec4<f32>(res, 1.0));
}

fn prefilter(c: vec3<f32>) -> vec3<f32> {
    let brightness: f32 = max(c.r, max(c.g, c.b));
    let knee: f32 = threshold * soft_threshold;
    var soft: f32 = brightness - threshold + knee;
    soft = clamp(soft, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 0.00001);
    var contribution: f32 = max(soft, brightness - 0.1);
    contribution /= max(brightness, 0.00001);
    return c * contribution;
}