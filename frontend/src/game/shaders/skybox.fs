#version 300 es
precision highp float;
in vec3 tex_coords;

out vec4 out_color;

uniform samplerCube skybox;

void main()
{    
    out_color = texture(skybox, tex_coords);
}