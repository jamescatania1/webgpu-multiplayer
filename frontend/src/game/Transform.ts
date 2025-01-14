import { vec3 } from "gl-matrix";

export default class Transform {
	public position = vec3.create();
    public rotation = vec3.create();

    // public readonly viewProjMatrix = mat4.create();

    // constructor(gl: WebGLRenderingContext) {
    //     this.update(gl);
    // }

    // public update(gl: WebGLRenderingContext) {
    //     this.forward[0] = Math.cos(this.yaw);
    //     this.forward[1] = Math.tan(this.pitch);
    //     this.forward[2] = Math.sin(this.yaw);
    //     vec3.normalize(this.forward, this.forward);
    //     this.right[0] = Math.cos(this.yaw - Math.PI / 2.0);
    //     this.right[1] = 0;
    //     this.right[2] = Math.sin(this.yaw - Math.PI / 2.0);
    //     vec3.cross(this.up, this.forward, this.right);
        
    //     mat4.perspective(
    //         this.projMatrix,
    //         (this.fov * Math.PI) / 180,
    //         gl.canvas.width / gl.canvas.height,
    //         this.near,
    //         this.far,
    //     );
    //     mat4.lookAt(this.viewMatrix, this.position, vec3.add(vec3.create(), this.position, this.forward), this.up);
    //     mat4.mul(this.viewProjMatrix, this.projMatrix, this.viewMatrix);
    // }
}
