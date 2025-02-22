struct TransformData {
    model_matrix: mat4x4<f32>,
    normal_matrix: mat3x3<f32>,
    model_offset: vec3<f32>,
    model_scale: vec3<f32>,
    cast_shadows: u32,
}
@group(0) @binding(0) var<storage, read> u_transform: array<TransformData>;

struct CulledInstances {
    instances: array<u32>,
}
@group(0) @binding(1) var<storage, read_write> u_culled: CulledInstances;
@group(0) @binding(2) var<storage, read_write> u_culled_shadow: CulledInstances;

struct IndirectArgs {
    index_count: u32,
    instance_count: atomic<u32>,
    reserved0: u32,
    reserved1: u32,
    reserved2: u32,
}
@group(0) @binding(3) var<storage, read_write> u_indirect_args: IndirectArgs;
@group(0) @binding(4) var<storage, read_write> u_indirect_shadow_args: IndirectArgs;

struct CameraData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
    camera_position: vec3<f32>,
}
@group(1) @binding(0) var<uniform> u_camera: CameraData;

struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

fn bounding_box(instance: TransformData) -> array<vec4<f32>, 8> {
    var res= array<vec4<f32>, 8>();
    res[0] = u_camera.proj_matrix * (u_camera.view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(-0.5, -0.5, -0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[1] = u_camera.proj_matrix * (u_camera.view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(-0.5, 0.5, -0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[2] = u_camera.proj_matrix * (u_camera.view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(0.5, -0.5, -0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[3] = u_camera.proj_matrix * (u_camera.view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(0.5, 0.5, -0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[4] = u_camera.proj_matrix * (u_camera.view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(-0.5, -0.5, 0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[5] = u_camera.proj_matrix * (u_camera.view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(-0.5, 0.5, 0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[6] = u_camera.proj_matrix * (u_camera.view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(0.5, -0.5, 0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[7] = u_camera.proj_matrix * (u_camera.view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(0.5, 0.5, 0.5) * instance.model_scale + instance.model_offset, 1.0));
    return res;
}

fn visible(instance: TransformData) -> bool {
    var bounds: array<vec4<f32>, 8> = bounding_box(instance);
    for (var i: u32 = 0u; i < 8u; i++) {
        let clip_pos: vec4<f32> = bounds[i];
        if (clip_pos.x >= -clip_pos.w && clip_pos.x <= clip_pos.w 
            && clip_pos.y >= -clip_pos.w && clip_pos.y <= clip_pos.w
            && clip_pos.z >= -clip_pos.w && clip_pos.z <= clip_pos.w
        ) {
            return true;
        }
    }
    return false;
}

@compute @workgroup_size(64)
fn compute_culling(in: ComputeIn) {
    let instance_index: u32 = in.id.x;

    let instance: TransformData = u_transform[instance_index];
    if (!visible(instance)) {
        return;
    }

    let culled_index: u32 = atomicAdd(&u_indirect_args.instance_count, 1u);
    u_culled.instances[culled_index] = instance_index;

    if (instance.cast_shadows > 0u) {
        let culled_shadow_index: u32 = atomicAdd(&u_indirect_shadow_args.instance_count, 1u);
        u_culled_shadow.instances[culled_shadow_index] = instance_index;
    }
}