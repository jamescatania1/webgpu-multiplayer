override ssao_samples: i32;
override ssao_radius: f32;
override ssao_bias: f32;
override ssao_noise_scale: f32;
override ssao_fade_start: f32;
override ssao_fade_end: f32;
// override near: f32;
// override far: f32;

@group(0) @binding(0) var u_depth: texture_depth_multisampled_2d;
@group(0) @binding(1) var u_normal: texture_multisampled_2d<f32>;
@group(0) @binding(2) var u_ssao_texture: texture_storage_2d<rgba16float, write>;

@group(1) @binding(0) var u_ssao_noise_sampler: sampler;
@group(1) @binding(1) var u_ssao_noise: texture_2d<f32>;
struct SSAOData {
    kernel: array<vec3<f32>, TEMPL_ssao_samples>,
};
@group(1) @binding(6) var<uniform> u_ssao: SSAOData;

struct CameraData {
    view_matrix: mat4x4<f32>,
    proj_matrix: mat4x4<f32>,
}
@group(2) @binding(0) var<uniform> u_camera: CameraData;
struct CameraInverseData {
    proj_inverse: mat4x4<f32>,
}
@group(2) @binding(1) var<uniform> u_camera_inverse: CameraInverseData;

struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

@compute @workgroup_size(8, 8)
fn compute_ssao(in: ComputeIn) {
    let depth_dimensions: vec2<f32> = vec2<f32>(textureDimensions(u_depth).xy);

    let uv: vec2<f32> = vec2<f32>(in.id.xy) / depth_dimensions;

    let view_pos: vec3<f32> = view_position(vec2<i32>(in.id.xy));

    var view_normal: vec3<f32> = textureLoad(u_normal, vec2<i32>(in.id.xy), 0).rgb;
    // view_normal = view_normal

    var random_vec: vec3<f32> = normalize(textureSampleLevel(u_ssao_noise, u_ssao_noise_sampler, uv * ssao_noise_scale, 0.0).xyz);

    var tangent: vec3<f32> = normalize(random_vec - view_normal * dot(random_vec, view_normal));
    var bitangent: vec3<f32> = cross(view_normal, tangent);
    var tbn: mat3x3<f32> = mat3x3<f32>(tangent, bitangent, view_normal);

    var occlusion: f32 = 0.0;
    for (var i: i32 = 0; i < ssao_samples; i++) {
        var sample_pos: vec3<f32> = tbn * u_ssao.kernel[i];
        sample_pos = sample_pos * ssao_radius + view_pos;
        
        var offset: vec4<f32> = u_camera.proj_matrix * vec4<f32>(sample_pos, 1.0);
        offset = (offset / offset.w) * 0.5 + 0.5;
        // offset.y = 1.0 - offset.y;

        let pixel_coords: vec2<i32> = vec2<i32>(offset.xy * depth_dimensions);
        let sample_depth: f32 = view_position(pixel_coords).z;

        let range_check: f32 = smoothstep(0.0, 1.0, ssao_radius / abs(view_pos.z - sample_depth));
        let d_z = sample_depth - sample_pos.z;
        if (d_z > ssao_bias) {
            occlusion += 1.0 * range_check;
        }
        // occlusion += f32(offset.x);
    }
    occlusion /= f32(ssao_samples);

    // let tmp = u_camera.proj_matrix * 
    // occlusion = occlusion * 0.000001 + u_camera.proj_matrix * vec4<f32>(view_pos, 1.0);

    textureStore(u_ssao_texture, vec2<i32>(in.id.xy), vec4<f32>(vec3<f32>(occlusion), 1.0));
}

fn view_position(pixel_coords: vec2<i32>) -> vec3<f32> {
    let depth: f32 = textureLoad(u_depth, pixel_coords, 0);

    let uv: vec2<f32> = vec2<f32>(pixel_coords) / vec2<f32>(textureDimensions(u_depth).xy);
    let screen_pos: vec4<f32> = vec4<f32>(
        uv.x * 2.0 - 1.0,
        uv.y * 2.0 - 1.0,
        depth,
        1.0
    );
    var view_pos: vec4<f32> = u_camera_inverse.proj_inverse * screen_pos;
    return view_pos.xyz / view_pos.w;
}