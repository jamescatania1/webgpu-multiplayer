@group(0) @binding(0) var u_cubemap: texture_2d_array<f32>;
@group(0) @binding(1) var u_irradiance: texture_storage_2d_array<rgba16float, write>;

struct ComputeIn {
    @builtin(global_invocation_id) id: vec3<u32>,
};

@compute @workgroup_size(4, 4)
fn compute_irradiance(in: ComputeIn) {
    let cube_dim: vec2<u32> = textureDimensions(u_cubemap);
    let irradiance_dim: vec2<u32> = textureDimensions(u_irradiance);

    let u: f32 = (f32(in.id.x) / f32(irradiance_dim.x)) * 2.0 - 1.0;
    let v: f32 = (f32(in.id.y) / f32(irradiance_dim.y)) * 2.0 - 1.0;
    let face_world_positions: array<vec3<f32>, 6> = array<vec3<f32>, 6>(
        vec3<f32>(1.0, -v, -u), // right
        vec3<f32>(-1.0, -v, u), // left
        vec3<f32>(u, 1.0, v), // top
        vec3<f32>(u, -1.0, -v), // bottom
        vec3<f32>(u, -v, 1.0), // back
        vec3<f32>(-u, -v, -1.0), // front
    );
    let pos: vec3<f32> = face_world_positions[in.id.z];

    let normal: vec3<f32> = normalize(pos);
    var up = vec3<f32>(0.0, 1.0, 0.0);
    var right: vec3<f32> = normalize(cross(up, normal));
    up = normalize(cross(normal, right));

    const delta: f32 = 0.05;
    const PI = 3.14159265359;
    
    var irradiance = vec3<f32>(0.0);
    var samples: i32 = 0;
    for (var phi: f32 = 0.0; phi < 2.0 * PI; phi += delta) {
        for (var theta: f32 = 0.0; theta < 0.5 * PI; theta += delta) {
            let tangent = vec3<f32>(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
            var sample: vec3<f32> = tangent.x * right + tangent.y * up + tangent.z * normal;

            // transform the sample position to cubemap tex coords
            let sample_uvw = cube_coord(sample, vec2<f32>(cube_dim));

            irradiance += textureLoad(u_cubemap, sample_uvw.xy, sample_uvw.z, 0).rgb * cos(theta) * sin(theta);
            // irradiance += textureSampleLevel(u_cubemap, u_cubemap_sampler, vec3<f32>(face_uv, f32(i32(face))), 0.0).rgb * cos(theta) * sin(theta);
            samples += 1;
        }
    }
    irradiance = PI * irradiance * (1.0 / f32(samples));
    // irradiance /= f32(samples);
    
    textureStore(u_irradiance, in.id.xy, in.id.z, vec4<f32>(irradiance, 1.0));
}

fn cube_coord(sample: vec3<f32>, cube_dim: vec2<f32>) -> vec3<i32> {
let abs_sample: vec3<f32> = abs(sample);
    let max_abs: f32 = max(max(abs_sample.x, abs_sample.y), abs_sample.z);
    var tex = sample / max_abs;
    var face: f32;
    var face_uv: vec2<f32>;
    if (abs_sample.x > abs_sample.y && abs_sample.x > abs_sample.z) {
        let x = step(tex.x, 0.0);
        face_uv = mix(-tex.zy, vec2<f32>(tex.z, -tex.y), x);
        face = x;
    }
    else if (abs_sample.y > abs_sample.z) {
        let y = step(tex.y, 0.0);
        face_uv = mix(tex.xz, vec2<f32>(tex.x, -tex.z), y);
        face = 2.0 + y;
    }
    else {
        let z = step(tex.z, 0.0);
        face_uv = mix(vec2<f32>(tex.x, -tex.y), -tex.xy, z);
        face = 4.0 + z;
    }
    face_uv = (face_uv + 1.0) * 0.5;
    face_uv *= cube_dim;
    face_uv.x = clamp(face_uv.x, 0.0, cube_dim.x - 1.0);
    face_uv.y = clamp(face_uv.y, 0.0, cube_dim.y - 1.0);

    return vec3<i32>(i32(face_uv.x), i32(face_uv.y), i32(face));
}