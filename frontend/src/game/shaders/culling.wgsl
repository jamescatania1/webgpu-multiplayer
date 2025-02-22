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

struct CameraData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
    camera_position: vec3<f32>,
}
@group(1) @binding(0) var<uniform> u_camera: CameraData;

struct CameraFrustum {
    near_normal: vec3<f32>,
    near_distance: f32,
    far_normal: vec3<f32>,
    far_distance: f32,
    left_normal: vec3<f32>,
    left_distance: f32,
    right_normal: vec3<f32>,
    right_distance: f32,
    bottom_normal: vec3<f32>,
    bottom_distance: f32,
    top_normal: vec3<f32>,
    top_distance: f32,
}
@group(1) @binding(3) var<uniform> u_frustum: CameraFrustum;

struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

fn bounding_box(model: TransformData) -> array<vec4<f32>, 8> {
    var res= array<vec4<f32>, 8>();
    res[0] = model.model_matrix * vec4<f32>(vec3<f32>(-0.5, -0.5, -0.5) * model.model_scale + model.model_offset, 1.0);
    res[1] = model.model_matrix * vec4<f32>(vec3<f32>(-0.5, 0.5, -0.5) * model.model_scale + model.model_offset, 1.0);
    res[2] = model.model_matrix * vec4<f32>(vec3<f32>(0.5, -0.5, -0.5) * model.model_scale + model.model_offset, 1.0);
    res[3] = model.model_matrix * vec4<f32>(vec3<f32>(0.5, 0.5, -0.5) * model.model_scale + model.model_offset, 1.0);
    res[4] = model.model_matrix * vec4<f32>(vec3<f32>(-0.5, -0.5, 0.5) * model.model_scale + model.model_offset, 1.0);
    res[5] = model.model_matrix * vec4<f32>(vec3<f32>(-0.5, 0.5, 0.5) * model.model_scale + model.model_offset, 1.0);
    res[6] = model.model_matrix * vec4<f32>(vec3<f32>(0.5, -0.5, 0.5) * model.model_scale + model.model_offset, 1.0);
    res[7] = model.model_matrix * vec4<f32>(vec3<f32>(0.5, 0.5, 0.5) * model.model_scale + model.model_offset, 1.0);
    return res;
}

@compute @workgroup_size(64)
fn compute_culling(in: ComputeIn) {
    let instance_index: u32 = in.id.x;

    let model: TransformData = u_transform[instance_index];
    var bounds: array<vec4<f32>, 8> = bounding_box(model);
    for (var i: u32 = 0u; i < 8u; i++) {
        if (dot(bounds[i].xyz, u_frustum.left_normal) - u_frustum.left_distance > -1.0) {
            return;
        }
        if (dot(bounds[i].xyz, u_frustum.right_normal) + u_frustum.right_distance > -1.0) {
            return;
        }
    }

    let culled_index: u32 = atomicAdd(&u_indirect_args.instance_count, 1u);
    u_culled.instances[culled_index] = instance_index;
}