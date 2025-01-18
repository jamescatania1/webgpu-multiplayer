#version 300 es
precision highp float;

in vec3 position;

uniform samplerCube skybox;

out vec4 out_color;

const float PI = 3.14159265359;

void main() {		
    vec3 normal = normalize(position);
  
    vec3 irradiance = vec3(0.0);
  
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(up, normal));
    up = normalize(cross(normal, right));

    float delta = 0.025;
    float samples = 0.0; 
    for (float phi = 0.0; phi < 2.0 * PI; phi += delta) {
        for (float theta = 0.0; theta < 0.5 * PI; theta += delta) {
            vec3 tangent = vec3(sin(theta) * cos(phi),  sin(theta) * sin(phi), cos(theta));
            vec3 sample_vector = tangent.x * right + tangent.y * up + tangent.z * normal; 

            irradiance += texture(skybox, sample_vector).rgb * cos(theta) * sin(theta);
            samples++;
        }
    }
    irradiance = PI * irradiance * (1.0 / float(samples));
  
    out_color = vec4(irradiance, 1.0);
}