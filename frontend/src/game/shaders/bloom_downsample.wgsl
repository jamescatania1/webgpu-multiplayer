override threshold: f32;

@group(0) @binding(0) var u_in_texture: texture_2d<f32>;
@group(0) @binding(1) var u_in_sampler: sampler;
@group(0) @binding(2) var u_out_texture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> u_level: i32;

struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

@compute @workgroup_size(8, 8)
fn compute_downsample(in: ComputeIn) {
    let out_dimensions: vec2<i32> = vec2<i32>(textureDimensions(u_out_texture).xy);
    let in_dimensions: vec2<i32> = vec2<i32>(textureDimensions(u_in_texture).xy);
    let texel: vec2<f32> = 1.0 / vec2<f32>(in_dimensions);

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

    if (u_level == 1) {
        let brightness: f32 = max(res.x, max(res.y, res.z));
        let contribution: f32 = max(0.0, brightness - threshold) / max(brightness, 0.000001);
        res *= contribution;
    }

    textureStore(u_out_texture, vec2<i32>(in.id.xy), vec4<f32>(res, 1.0));
}