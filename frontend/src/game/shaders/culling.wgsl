struct TransformData {
    model_matrix: mat4x4<f32>,
    normal_matrix: mat3x3<f32>,
    model_offset: vec3<f32>,
    model_scale: f32,
}
@group(0) @binding(0) var<storage, read> u_transform: array<TransformData>;

struct CulledInstances {
    instances: array<u32>,
}
@group(0) @binding(1) var<storage, read_write> u_culled: CulledInstances;

struct IndirectArgs {
    index_count: u32,
    instance_count: atomic<u32>,
    reserved0: u32,
    reserved1: u32,
    reserved2: u32,
}
@group(0) @binding(2) var<storage, read_write> u_indirect_args: IndirectArgs;

struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

@compute @workgroup_size(64)
fn compute_culling(in: ComputeIn) {
    let instance_index: u32 = in.id.x;

    if (instance_index > 125u) {
        return;
    }

    let culled_index: u32 = atomicAdd(&u_indirect_args.instance_count, 1u);
    u_culled.instances[culled_index] = instance_index;
}