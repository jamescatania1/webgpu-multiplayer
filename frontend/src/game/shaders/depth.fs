#version 300 es
precision highp float;

in vec4 clip_position;

out vec4 out_color;

float near = 0.1; 
float far  = 100.0; 
  
float linearize_depth(float depth) {
    float z = depth * 2.0 - 1.0; // back to NDC 
    return (2.0 * near * far) / (far + near - z * (far - near));	
}

void main() {             
    out_color = vec4(clip_position.xyz, 1.0);
}