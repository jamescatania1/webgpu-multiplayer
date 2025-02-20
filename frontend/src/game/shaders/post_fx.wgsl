override bloom_intensity: f32 = 0.2;
override exposure: f32 = 1.0;
override temperature: f32 = 0.2; // [-1.6, 1.6] for cool/warm
override tint: f32 = 0.1;
override contrast: f32 = 1.0;
override brightness: f32 = 0.0;
override gamma: f32 = 2.2;

@group(0) @binding(0) var color_sampler: sampler;
@group(0) @binding(1) var color_texture: texture_2d<f32>;
@group(0) @binding(2) var bloom_texture: texture_2d<f32>;

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex 
fn vs(@location(0) pos: vec2<f32>) -> VertexOut {
    var out: VertexOut;
    out.pos = vec4<f32>(pos, 0.0, 1.0);
    out.uv = (pos + 1.0) / 2.0;
    out.uv.y = 1.0 - out.uv.y;
    return out;
}

@fragment 
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let bloom: vec3<f32> = textureSample(bloom_texture, color_sampler, in.uv).rgb;
    var color: vec3<f32> = textureSample(color_texture, color_sampler, in.uv).rgb;
    color = mix(color, bloom, bloom_intensity);

    // exposure
    color *= exposure;

    // white balancing
    color = white_balance(color);

    // contrast and brightness
    color = (contrast * (color - 0.5) + 0.5 + brightness);

    // tone mapping
    color = aces(color);

    color = pow(color, vec3<f32>(1.0 / gamma));
    return vec4<f32>(color, 1.0);
    // return vec4<f32>(textureSample(color_texture, color_sampler, in.uv).rgb + color * 0.00001, 1.0);
}

fn white_balance(color: vec3<f32>) -> vec3<f32> {
    let t1: f32 = temperature * 10.0 / 6.0;
    let t2: f32 = tint * 10.0 / 6.0;

    var x: f32 = 0.31271;
    if (t1 < 0.0) {
        x -= t1 * 0.1;
    }
    else {
        x -= t1 * 0.05;
    }
    let std_illum_y: f32 = 2.87 * x - 3.0 * x * x - 0.27509507;
    let y: f32 = std_illum_y + t2 * 0.05;

    const w1: vec3<f32> = vec3<f32>(0.949237, 1.03542, 1.08728);

    let y_adj: f32 = 1.0;
    let x_adj: f32 = y_adj * x / y;
    let z_adj: f32 = y_adj * (1.0 - x - y) / y;

    let l: f32 = 0.7328 * x_adj + 0.4296 * y_adj - 0.1624 * z_adj;
    let m: f32 = -0.7036 * x_adj + 1.6975 * y_adj + 0.0061 * z_adj;
    let s: f32 = 0.0030 * x_adj + 0.0136 * y_adj + 0.9834 * z_adj;

    let w2: vec3<f32> = vec3<f32>(l, m, s);
    let balance: vec3<f32> = vec3<f32>(w1.x / w2.x, w1.y / w2.y, w1.z / w2.z);

    const lin_2_lms_mat: mat3x3<f32> = mat3x3<f32>(
        0.390405, 0.549941, 0.00892632,
        0.0708416, 0.963172, 0.00135775,
        0.0231082, 0.128021, 0.936245
    );

    const lms_2_lin_mat: mat3x3<f32> = mat3x3<f32>(
         2.85847,  -1.62879, -0.0248910,
        -0.210182,  1.15820,  0.000324281,
        -0.0418120, -0.118169, 1.06867
    );

    var lms: vec3<f32> = lin_2_lms_mat * color;
    lms *= balance;
    return lms_2_lin_mat * lms;
}

fn aces(x: vec3<f32>) -> vec3<f32> {
    const a = 2.51;
    const b = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;
    let out: vec3<f32> = (x * (a * x + b)) / (x * (c * x + d) + e);
    return vec3<f32>(
        clamp(out.r, 0.0, 1.0),
        clamp(out.g, 0.0, 1.0),
        clamp(out.b, 0.0, 1.0)
    );
}