struct TransformData {
    model_matrix: mat4x4<f32>,
    normal_matrix: mat3x3<f32>,
    model_offset: vec3<f32>,
    model_scale: vec3<f32>,
    cast_shadows: f32,
}
@group(0) @binding(0) var<storage, read> u_transform: array<TransformData>;

struct CulledInstances {
    instances: array<u32>,
}
@group(0) @binding(1) var<storage, read_write> u_culled: CulledInstances;
@group(0) @binding(2) var<storage, read_write> u_culled_shadow_1: CulledInstances;
@group(0) @binding(3) var<storage, read_write> u_culled_shadow_2: CulledInstances;
@group(0) @binding(4) var<storage, read_write> u_culled_shadow_3: CulledInstances;
@group(0) @binding(5) var<storage, read_write> u_culled_shadow_4: CulledInstances;

struct IndirectArgs {
    index_count: u32,
    instance_count: atomic<u32>,
    reserved0: u32,
    reserved1: u32,
    reserved2: u32,
}
@group(0) @binding(6) var<storage, read_write> u_indirect_args: array<IndirectArgs>;

struct CameraData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
    camera_position: vec3<f32>,
}
@group(1) @binding(0) var<uniform> u_camera: CameraData;

struct ShadowData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
    radius: f32,
    bias: f32,
    normal_bias: f32,
    samples: f32,
    blocker_samples: f32,
    near: f32,
    far: f32,
    align_padding_1: vec4<f32>,
    align_padding_2: vec4<f32>,
    align_padding_3: mat4x4<f32>,
}
@group(1) @binding(2) var<uniform> u_shadow: array<ShadowData, 4>;

struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

fn bounding_box(instance: TransformData, proj_matrix: mat4x4<f32>, view_matrix: mat4x4<f32>) -> array<vec4<f32>, 8> {
    var res= array<vec4<f32>, 8>();
    res[0] = proj_matrix * (view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(-0.5, -0.5, -0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[1] = proj_matrix * (view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(-0.5, 0.5, -0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[2] = proj_matrix * (view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(0.5, -0.5, -0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[3] = proj_matrix * (view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(0.5, 0.5, -0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[4] = proj_matrix * (view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(-0.5, -0.5, 0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[5] = proj_matrix * (view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(-0.5, 0.5, 0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[6] = proj_matrix * (view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(0.5, -0.5, 0.5) * instance.model_scale + instance.model_offset, 1.0));
    res[7] = proj_matrix * (view_matrix * instance.model_matrix * vec4<f32>(vec3<f32>(0.5, 0.5, 0.5) * instance.model_scale + instance.model_offset, 1.0));
    return res;
}

fn visible(instance: TransformData, proj_matrix: mat4x4<f32>, view_matrix: mat4x4<f32>) -> bool {
    var bounds: array<vec4<f32>, 8> = bounding_box(instance, proj_matrix, view_matrix);
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

@compute @workgroup_size(1)
fn compute_culling(in: ComputeIn) {
    let instance_index: u32 = in.id.x;
    let instance: TransformData = u_transform[instance_index];

    if (visible(instance, u_camera.proj_matrix, u_camera.view_matrix)) {
        let culled_index: u32 = atomicAdd(&u_indirect_args[0].instance_count, 1u);
        u_culled.instances[culled_index] = instance_index;
    }

    if (instance.cast_shadows > 0.0 && visible(instance, u_shadow[0].proj_matrix, u_shadow[0].view_matrix)) {
        let culled_index: u32 = atomicAdd(&u_indirect_args[1].instance_count, 1u);
        u_culled_shadow_1.instances[culled_index] = instance_index;
    }
    if (instance.cast_shadows > 0.0 && visible(instance, u_shadow[1].proj_matrix, u_shadow[1].view_matrix)) {
        let culled_index: u32 = atomicAdd(&u_indirect_args[2].instance_count, 1u);
        u_culled_shadow_2.instances[culled_index] = instance_index;
    }
    if (instance.cast_shadows > 0.0 && visible(instance, u_shadow[2].proj_matrix, u_shadow[2].view_matrix)) {
        let culled_index: u32 = atomicAdd(&u_indirect_args[3].instance_count, 1u);
        u_culled_shadow_3.instances[culled_index] = instance_index;
    }
    if (instance.cast_shadows > 0.0 && visible(instance, u_shadow[3].proj_matrix, u_shadow[3].view_matrix)) {
        let culled_index: u32 = atomicAdd(&u_indirect_args[4].instance_count, 1u);
        u_culled_shadow_4.instances[culled_index] = instance_index;
    }
}