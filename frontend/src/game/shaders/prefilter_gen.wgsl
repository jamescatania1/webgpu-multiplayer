@group(0) @binding(0) var u_rect_sky: texture_2d<f32>;
@group(0) @binding(1) var u_rect_sky_sampler: sampler;
@group(0) @binding(2) var u_cubemap: texture_storage_2d_array<rgba16float, write>;

struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

@compute @workgroup_size(8, 8)
fn compute_prefilter(in: ComputeIn) {
}