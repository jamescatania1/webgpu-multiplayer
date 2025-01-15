import { mat3, mat4, quat, vec3 } from "gl-matrix";

export default class Transform {
	public position = vec3.create();
    public rotation = vec3.create();
    public scale = vec3.fromValues(1, 1, 1);

    public readonly matrix = mat4.create();
    public readonly normalMatrix = mat3.create();
    public modelScale: number = 1;

    private finalScale = vec3.create();
    private normalMatrix4 = mat4.create();
    private quat = quat.create();

    constructor(gl: WebGL2RenderingContext) {
        this.update(gl);
    }

    public update(gl: WebGL2RenderingContext) {
        quat.fromEuler(this.quat, this.rotation[0], this.rotation[1], this.rotation[2]);
        vec3.scale(this.finalScale, this.scale, this.modelScale);
        mat4.fromRotationTranslationScale(this.matrix, this.quat, this.position, this.finalScale);
        
        mat4.fromRotationTranslationScale(this.normalMatrix4, this.quat, this.position, this.scale);
        mat3.normalFromMat4(this.normalMatrix, this.normalMatrix4);
    }
}
