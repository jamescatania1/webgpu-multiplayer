#version 300 es
precision highp float;

uniform sampler2D ssao_map;
    
in vec2 uv;
    
out float out_color;
    
void main() {
    vec2 texelSize = 1.0 / vec2(textureSize(ssao_map, 0));
    float res = 0.0;
    for (int t = -2; t <= 2; ++t) {
        for (int s = -2; s <= 2; ++s) {
            vec2 offset = vec2(float(s), float(t)) * texelSize;
            res += texture(ssao_map, uv + offset).r;
        }
    }
    out_color = res / 25.0;
}