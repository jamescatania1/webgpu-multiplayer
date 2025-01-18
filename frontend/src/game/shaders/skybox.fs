#version 300 es
precision highp float;
in vec3 tex_coords;

out vec4 out_color;

uniform samplerCube skybox;

void main() {    
    vec3 sky = texture(skybox, tex_coords).rgb;
    sky = sky / (sky + vec3(1.0));
    sky = pow(sky, vec3(1.0/2.2));
    out_color = vec4(sky, 1.0);
}