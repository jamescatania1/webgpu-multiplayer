@group(0) @binding(0) var u_blur_texture: texture_2d<f32>;
@group(0) @binding(1) var u_blur_sampler: sampler;
@group(0) @binding(2) var u_upscale_texture: texture_storage_2d<rgba16float, write>;

struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

@compute @workgroup_size(8, 8)
fn compute_ssao_upscale(in: ComputeIn) {
    let blur_dimensions: vec2<i32> = vec2<i32>(textureDimensions(u_blur_texture).xy);
    let out_texel: vec2<f32> = 1.0 / vec2<f32>(textureDimensions(u_upscale_texture).xy);

    let uv = vec2<f32>(in.id.xy) * out_texel;

    let out_pos: vec2<i32> = vec2<i32>(in.id.xy);

    let r: vec2<f32> = out_texel * 1.05;
    var res: f32 = 0.0;
    res += 4.0 * textureSampleLevel(u_blur_texture, u_blur_sampler, uv, 0.0).r;
    res += 2.0 * textureSampleLevel(u_blur_texture, u_blur_sampler, uv + vec2<f32>(r.x, 0.0), 0.0).r;
    res += 2.0 * textureSampleLevel(u_blur_texture, u_blur_sampler, uv + vec2<f32>(-r.x, 0.0), 0.0).r;
    res += 2.0 * textureSampleLevel(u_blur_texture, u_blur_sampler, uv + vec2<f32>(0.0, r.y), 0.0).r;
    res += 2.0 * textureSampleLevel(u_blur_texture, u_blur_sampler, uv + vec2<f32>(0.0, -r.y), 0.0).r;
    res += 1.0 * textureSampleLevel(u_blur_texture, u_blur_sampler, uv + vec2<f32>(r.x, r.y), 0.0).r;
    res += 1.0 * textureSampleLevel(u_blur_texture, u_blur_sampler, uv + vec2<f32>(r.x, -r.y), 0.0).r;
    res += 1.0 * textureSampleLevel(u_blur_texture, u_blur_sampler, uv + vec2<f32>(-r.x, r.y), 0.0).r;
    res += 1.0 * textureSampleLevel(u_blur_texture, u_blur_sampler, uv + vec2<f32>(-r.x, -r.y), 0.0).r;
    res /= 16.0;

    textureStore(u_upscale_texture, out_pos, vec4<f32>(vec3<f32>(res), 1.0));
}