#version 300 es
precision highp float;

in vec2 uv;

uniform sampler2D tex;

out vec4 out_color;

void main() {
    vec3 color = texture(tex, uv).rgb;
    out_color = vec4(color, 1.0);
}