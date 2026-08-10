export class Texture {
  #gl;
  #texture;
  #loaded;

  constructor(gl, source) {
    this.#gl = gl;
    this.#loaded = false;
    this.#texture = this.#createPlaceholder();
    //this.#loadImage(url);
    if (typeof source === 'string') {
      this.#loadImage(source);           // existing URL path
    } else {
      this.#loadFromElement(source);     // canvas or already-loaded Image/ImageBitmap
    }
  }

  #createPlaceholder() {
    const gl = this.#gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([160, 160, 160, 255]));
    return texture;
  }

  #isPowerOfTwo(value) {
    return (value & (value - 1)) === 0;
  }

  // #loadImage(url) {
  //   const gl = this.#gl;
  //   const image = new Image();
  //   image.onload = () => {
  //     gl.bindTexture(gl.TEXTURE_2D, this.#texture);
  //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  //     const powerOfTwo = this.#isPowerOfTwo(image.width) && this.#isPowerOfTwo(image.height);

  //     if (powerOfTwo) {
  //       gl.generateMipmap(gl.TEXTURE_2D);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  //     } else {
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  //     }

  //     this.#loaded = true;
  //   };
  //   image.src = url;
  // }

  #uploadAndConfigure(element) {
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, this.#texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);

    const width = element.width;
    const height = element.height;
    const powerOfTwo = this.#isPowerOfTwo(width) && this.#isPowerOfTwo(height);

    if (powerOfTwo) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    this.#loaded = true;
  }

  #loadImage(url) {
    const image = new Image();
    image.onload = () => this.#uploadAndConfigure(image);
    image.src = url;
  }

  #loadFromElement(element) {
    this.#uploadAndConfigure(element);
  }

  getTexture() { return this.#texture; }
  isLoaded() { return this.#loaded; }
}