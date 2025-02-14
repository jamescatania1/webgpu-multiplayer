override kernel_size: i32;
override blur_x: f32;
override blur_y: f32;

@group(0) @binding(0) var u_ssao_texture: texture_2d<f32>;
@group(0) @binding(1) var u_ssao_sampler: sampler;
@group(0) @binding(2) var u_blur_texture: texture_storage_2d<rgba16float, write>;

@group(1) @binding(0) var<storage, read> u_kernel: array<f32>;

struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

@compute @workgroup_size(8, 8)
fn compute_ssao_blur(in: ComputeIn) {
    let dimensions: vec2<f32> = vec2<f32>(textureDimensions(u_ssao_texture).xy);
    let texel_size: vec2<f32> = 1.0 / dimensions;

    let pixel_pos: vec2<i32> = vec2<i32>(in.id.xy);
    let uv: vec2<f32> = vec2<f32>(pixel_pos) / vec2<f32>(dimensions);

    var res: f32 = 0.0;
    for (var i: i32 = 0; i < kernel_size; i++) {
        let weight: f32 = u_kernel[i * 2];
        let offset: f32 = u_kernel[i * 2 + 1];
        let sample_pos: vec2<f32> = vec2<f32>(blur_x, blur_y) * offset * texel_size + uv;
        res += textureSampleLevel(u_ssao_texture, u_ssao_sampler, sample_pos, 0.0).r * weight;
    }
    textureStore(u_blur_texture, vec2<i32>(in.id.xy), vec4<f32>(vec3<f32>(res), 1.0));
}