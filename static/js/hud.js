/**
 * Creates and compiles a shader.
 *
 * @param {!WebGLRenderingContext} gl The WebGL Context.
 * @param {string} shaderSource The GLSL source code for the shader.
 * @param {number} shaderType The type of shader, VERTEX_SHADER or
 *     FRAGMENT_SHADER.
 * @return {!WebGLShader} The shader.
 */
function compileShader(gl, shaderSource, shaderType) {
  // Create the shader object
  var shader = gl.createShader(shaderType);
  
  // Set the shader source code.
  gl.shaderSource(shader, shaderSource);
  
  // Compile the shader
  gl.compileShader(shader);
  
  // Check if it compiled
  var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!success) {
    // Something went wrong during compilation; get the error
    throw "could not compile shader:" + gl.getShaderInfoLog(shader);
  }
  
  return shader;
}

/**
 * Creates a shader from the content of a script tag.
 *
 * @param {!WebGLRenderingContext} gl The WebGL Context.
 * @param {string} scriptId The id of the script tag.
 * @param {string} opt_shaderType. The type of shader to create.
 *     If not passed in will use the type attribute from the
 *     script tag.
 * @return {!WebGLShader} A shader.
 */
function compileShaderFromScript(gl, scriptId, opt_shaderType) {
  // look up the script tag by id.
  var shaderScript = document.getElementById(scriptId);
  if (!shaderScript) {
    throw("*** Error: unknown script element" + scriptId);
  }
  
  // extract the contents of the script tag.
  var shaderSource = shaderScript.text;
  
  // If we didn't pass in a type, use the 'type' from
  // the script tag.
  if (!opt_shaderType) {
    if (shaderScript.type == "x-shader/x-vertex") {
      opt_shaderType = gl.VERTEX_SHADER;
    } else if (shaderScript.type == "x-shader/x-fragment") {
      opt_shaderType = gl.FRAGMENT_SHADER;
    } else if (!opt_shaderType) {
      throw("*** Error: shader type not set");
    }
  }
  
  return compileShader(gl, shaderSource, opt_shaderType);
};

/**
 * Creates a program from 2 shaders.
 *
 * @param {!WebGLRenderingContext) gl The WebGL context.
 * @param {!WebGLShader} vertexShader A vertex shader.
 * @param {!WebGLShader} fragmentShader A fragment shader.
 * @return {!WebGLProgram} A program.
 */
function createProgram(gl, vertexShader, fragmentShader) {
  // create a program.
  var program = gl.createProgram();
  
  // attach the shaders.
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  
  // link the program.
  gl.linkProgram(program);
  
  // Check if it linked.
  var success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!success) {
      // something went wrong with the link
      throw ("program failed to link:" + gl.getProgramInfoLog (program));
  }
  
  return program;
};

    
class HUD {
  constructor(gl) {
    this.gl = gl;
    this.scaleFactor = 0.01 / 4;
    this.translationVec = [0, 0];

    document.addEventListener('wheel', e => {
      this.scaleFactor *= 1+ 0.05 * Math.sign(e.deltaY);
      this.gl.uniform1f(this.scaleFactorUniformLocation, this.scaleFactor);
    });

    document.addEventListener('mousedown', e => {
      this.panning = true;
      this.lastX = e.offsetX;
      this.lastY = e.offsetY;
    });

    document.addEventListener('mouseup', e => {
      this.panning = false;
      this.lastX = null;
      this.lastY = null;
    });

    document.addEventListener('mousemove', e => {
      if (this.panning) {
        this.translationVec[0] -= (e.offsetX - this.lastX) * this.scaleFactor;
        this.translationVec[1] += (e.offsetY - this.lastY) * this.scaleFactor;
        this.lastX = e.offsetX;
        this.lastY = e.offsetY;
        this.gl.uniform2f(this.translationUniformLocation, this.translationVec[0], this.translationVec[1]);
      }
    });

    const texture = this.loadTexture(gl, 'pal.png');


    this.vertexShader = compileShaderFromScript(gl, "vertexShader");
    this.fragmentShader = compileShaderFromScript(gl, "fragmentShader");
    this.program = createProgram(gl, this.vertexShader, this.fragmentShader);

    let positionAttributeLocation = gl.getAttribLocation(this.program, "a_position");
    let resolutionUniformLocation = gl.getUniformLocation(this.program, "u_resolution");
    let samplerUniformLocation = gl.getUniformLocation(this.program, "u_sampler");
    this.scaleFactorUniformLocation = gl.getUniformLocation(this.program, "scale_factor");
    this.translationUniformLocation = gl.getUniformLocation(this.program, "translation");

    let positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    var positions = [
      -1, -1,
      -1, 1,
      1, -1,
      -1, 1,
      1, -1,
      1, 1,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    // set the resolution
    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    this.gl.uniform1f(this.scaleFactorUniformLocation, this.scaleFactor);
    this.gl.uniform2f(this.translationUniformLocation, this.translationVec[0], this.translationVec[1]);

    // Tell WebGL we want to affect texture unit 0
    gl.activeTexture(gl.TEXTURE0);

    // Bind the texture to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Tell the shader we bound the texture to texture unit 0
    gl.uniform1i(samplerUniformLocation, 0);

    gl.enableVertexAttribArray(positionAttributeLocation);

    // Bind the position buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  
    // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
    let size = 2;          // 2 components per iteration
    let type = gl.FLOAT;   // the data is 32bit floats
    let normalize = false; // don't normalize the data
    let stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
    let offset = 0;        // start at the beginning of the buffer
    gl.vertexAttribPointer(
        positionAttributeLocation, size, type, normalize, stride, offset) 
  }

  loadTexture(gl, url) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                  width, height, border, srcFormat, srcType,
                  pixel);

    const image = new Image();
    image.onload = function() {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                    srcFormat, srcType, image);


      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    };
    image.src = url;

    return texture
  }

  render() {
    let offset = 0;
    let count = 6;
    let primitiveType = this.gl.TRIANGLES;
    this.gl.drawArrays(primitiveType, offset, count);
  }
}