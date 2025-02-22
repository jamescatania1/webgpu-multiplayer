override sample_scale: f32 = 1.0;
override intensity: f32 = 1.0;
override radius: f32 = 1.0;

@group(0) @binding(0) var u_presample_texture: texture_2d<f32>;
@group(0) @binding(1) var u_postsample_texture: texture_2d<f32>;
@group(0) @binding(2) var u_in_sampler: sampler;
@group(0) @binding(3) var u_out_texture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<uniform> u_level: i32;


struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

@compute @workgroup_size(8, 8)
fn compute_upsample(in: ComputeIn) {
    let blur_dimensions: vec2<i32> = vec2<i32>(textureDimensions(u_postsample_texture).xy);
    let out_dimensions: vec2<i32> = vec2<i32>(textureDimensions(u_presample_texture).xy);
    let out_texel: vec2<f32> = 1.0 / vec2<f32>(textureDimensions(u_out_texture).xy);

    let uv: vec2<f32> = vec2<f32>(in.id.xy) * out_texel;


    let r: vec2<f32> = out_texel * sample_scale;
    var res: vec3<f32> = vec3<f32>(0.0);
    res += 4.0 * textureSampleLevel(u_postsample_texture, u_in_sampler, uv, 0.0).rgb;
    res += 2.0 * textureSampleLevel(u_postsample_texture, u_in_sampler, uv + vec2<f32>(r.x, 0.0), 0.0).rgb;
    res += 2.0 * textureSampleLevel(u_postsample_texture, u_in_sampler, uv + vec2<f32>(-r.x, 0.0), 0.0).rgb;
    res += 2.0 * textureSampleLevel(u_postsample_texture, u_in_sampler, uv + vec2<f32>(0.0, r.y), 0.0).rgb;
    res += 2.0 * textureSampleLevel(u_postsample_texture, u_in_sampler, uv + vec2<f32>(0.0, -r.y), 0.0).rgb;
    res += 1.0 * textureSampleLevel(u_postsample_texture, u_in_sampler, uv + vec2<f32>(r.x, r.y), 0.0).rgb;
    res += 1.0 * textureSampleLevel(u_postsample_texture, u_in_sampler, uv + vec2<f32>(r.x, -r.y), 0.0).rgb;
    res += 1.0 * textureSampleLevel(u_postsample_texture, u_in_sampler, uv + vec2<f32>(-r.x, r.y), 0.0).rgb;
    res += 1.0 * textureSampleLevel(u_postsample_texture, u_in_sampler, uv + vec2<f32>(-r.x, -r.y), 0.0).rgb;
    res /= 16.0;

    // res *= vec3<f32>(1.0, 0.0, 0.0);

    if (u_level == 1) {
        res *= intensity * 1.0;
    }
    else {
        res *= radius * 0.5;
    }

    res += textureSampleLevel(u_presample_texture, u_in_sampler, uv, 0.0).rgb;

    textureStore(u_out_texture, vec2<i32>(in.id.xy), vec4<f32>(res, 1.0));
}