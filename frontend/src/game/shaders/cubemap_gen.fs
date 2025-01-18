#version 300 es
precision highp float;

in vec3 position;

out vec4 out_color;

uniform sampler2D rect_texture;

const vec2 IN_ATAN = vec2(0.1591, 0.3183);

vec2 sample_spherical(vec3 v) {
    vec2 uv = vec2(atan(v.z, v.x), asin(v.y));
    uv *= IN_ATAN;
    uv += 0.5;
    uv.y = 1.0 - uv.y;
    return uv;
}

void main(){		
    vec2 uv = sample_spherical(normalize(position));
    vec3 color = texture(rect_texture, uv).rgb;
    
    out_color = vec4(color + vec3(0.0, 0.0, 0.0), 1.0); 
}