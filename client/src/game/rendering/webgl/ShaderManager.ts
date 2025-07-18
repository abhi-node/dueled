/**
 * ShaderManager - Compile and manage WebGL shaders for high-performance rendering
 * 
 * Designed for 1v1 arena combat with Archer vs Berserker
 * Manages GPU shaders for raycasting, sprite rendering, and post-processing
 */

export interface ShaderSource {
  vertex: string;
  fragment: string;
  name: string;
}

export interface ShaderUniform {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat3' | 'mat4' | 'int' | 'bool' | 'sampler2D';
  location: WebGLUniformLocation | null;
}

export interface ShaderAttribute {
  name: string;
  location: number;
  size: number; // Number of components (1-4)
  type: number; // GL type constant
}

export interface CompiledShader {
  name: string;
  program: WebGLProgram;
  uniforms: Map<string, ShaderUniform>;
  attributes: Map<string, ShaderAttribute>;
  vertexShader: WebGLShader;
  fragmentShader: WebGLShader;
}

/**
 * ShaderManager - High-performance shader compilation and management
 */
export class ShaderManager {
  private gl: WebGL2RenderingContext;
  private shaders: Map<string, CompiledShader> = new Map();
  private currentShader: CompiledShader | null = null;
  private shaderCache: Map<string, WebGLShader> = new Map();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initializeDefaultShaders();
  }

  /**
   * Initialize default shaders for arena combat
   */
  private initializeDefaultShaders(): void {
    // Raycasting shader for arena walls and environment
    const raycastingShader: ShaderSource = {
      name: 'raycasting',
      vertex: `#version 300 es
        in vec4 a_position;
        in vec2 a_texCoord;
        
        out vec2 v_texCoord;
        out vec2 v_screenPos;
        
        void main() {
          gl_Position = a_position;
          v_texCoord = a_texCoord;
          v_screenPos = a_position.xy;
        }`,
      fragment: `#version 300 es
        precision highp float;
        
        in vec2 v_texCoord;
        in vec2 v_screenPos;
        
        uniform vec2 u_resolution;
        uniform vec2 u_playerPos;
        uniform float u_playerAngle;
        uniform float u_time;
        uniform sampler2D u_wallTexture;
        
        out vec4 outColor;
        
        // Simple ray marching for arena walls
        float sdfBox(vec2 p, vec2 b) {
          vec2 d = abs(p) - b;
          return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        }
        
        float mapArena(vec2 p) {
          // Simple arena boundaries
          float arena = sdfBox(p, vec2(15.0, 15.0));
          return arena;
        }
        
        vec3 raycast(vec2 origin, vec2 direction) {
          float t = 0.0;
          vec3 color = vec3(0.1, 0.1, 0.15); // Background
          
          for (int i = 0; i < 64; i++) {
            vec2 pos = origin + direction * t;
            float d = mapArena(pos);
            
            if (d < 0.01) {
              // Hit wall
              float lighting = 1.0 - (t * 0.1);
              color = vec3(0.6, 0.6, 0.7) * lighting;
              break;
            }
            
            t += d;
            if (t > 50.0) break;
          }
          
          return color;
        }
        
        void main() {
          vec2 uv = (v_screenPos * 0.5 + 0.5);
          vec2 screenCoord = (uv - 0.5) * 2.0;
          screenCoord.x *= u_resolution.x / u_resolution.y;
          
          // Calculate ray direction from player perspective
          float angle = u_playerAngle + screenCoord.x * 0.8; // FOV
          vec2 rayDir = vec2(cos(angle), sin(angle));
          
          vec3 color = raycast(u_playerPos, rayDir);
          outColor = vec4(color, 1.0);
        }`
    };

    // Sprite shader for player and projectile rendering
    const spriteShader: ShaderSource = {
      name: 'sprite',
      vertex: `#version 300 es
        in vec3 a_position;
        in vec2 a_texCoord;
        in vec3 a_instancePos;
        in vec2 a_instanceScale;
        in float a_instanceRotation;
        in vec4 a_instanceColor;
        
        uniform mat4 u_projectionMatrix;
        uniform mat4 u_viewMatrix;
        uniform vec2 u_cameraPos;
        
        out vec2 v_texCoord;
        out vec4 v_color;
        
        mat2 rotate2D(float angle) {
          float c = cos(angle);
          float s = sin(angle);
          return mat2(c, -s, s, c);
        }
        
        void main() {
          // Billboard sprite to always face camera
          vec2 billboard = a_position.xy * a_instanceScale;
          billboard = rotate2D(a_instanceRotation) * billboard;
          
          vec3 worldPos = a_instancePos + vec3(billboard, 0.0);
          worldPos.xy -= u_cameraPos;
          
          gl_Position = u_projectionMatrix * u_viewMatrix * vec4(worldPos, 1.0);
          v_texCoord = a_texCoord;
          v_color = a_instanceColor;
        }`,
      fragment: `#version 300 es
        precision mediump float;
        
        in vec2 v_texCoord;
        in vec4 v_color;
        
        uniform sampler2D u_spriteTexture;
        uniform float u_alpha;
        
        out vec4 outColor;
        
        void main() {
          vec4 texColor = texture(u_spriteTexture, v_texCoord);
          
          // Alpha test for sprite transparency
          if (texColor.a < 0.1) {
            discard;
          }
          
          outColor = texColor * v_color * vec4(1.0, 1.0, 1.0, u_alpha);
        }`
    };

    // UI shader for HUD elements
    const uiShader: ShaderSource = {
      name: 'ui',
      vertex: `#version 300 es
        in vec2 a_position;
        in vec2 a_texCoord;
        in vec4 a_color;
        
        uniform mat4 u_projectionMatrix;
        
        out vec2 v_texCoord;
        out vec4 v_color;
        
        void main() {
          gl_Position = u_projectionMatrix * vec4(a_position, 0.0, 1.0);
          v_texCoord = a_texCoord;
          v_color = a_color;
        }`,
      fragment: `#version 300 es
        precision mediump float;
        
        in vec2 v_texCoord;
        in vec4 v_color;
        
        uniform sampler2D u_texture;
        uniform int u_hasTexture;
        
        out vec4 outColor;
        
        void main() {
          if (u_hasTexture == 1) {
            outColor = texture(u_texture, v_texCoord) * v_color;
          } else {
            outColor = v_color;
          }
        }`
    };

    // Compile default shaders
    this.compileShader(raycastingShader);
    this.compileShader(spriteShader);
    this.compileShader(uiShader);

    console.log('ShaderManager: Default shaders compiled');
  }

  /**
   * Compile and cache a shader program
   */
  compileShader(shaderSource: ShaderSource): CompiledShader | null {
    // Check if already compiled
    if (this.shaders.has(shaderSource.name)) {
      console.warn(`Shader '${shaderSource.name}' already compiled`);
      return this.shaders.get(shaderSource.name)!;
    }

    try {
      // Compile vertex shader
      const vertexShader = this.createShader(this.gl.VERTEX_SHADER, shaderSource.vertex, `${shaderSource.name}_vertex`);
      if (!vertexShader) {
        throw new Error(`Failed to compile vertex shader for '${shaderSource.name}'`);
      }

      // Compile fragment shader
      const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, shaderSource.fragment, `${shaderSource.name}_fragment`);
      if (!fragmentShader) {
        this.gl.deleteShader(vertexShader);
        throw new Error(`Failed to compile fragment shader for '${shaderSource.name}'`);
      }

      // Create and link program
      const program = this.createProgram(vertexShader, fragmentShader);
      if (!program) {
        this.gl.deleteShader(vertexShader);
        this.gl.deleteShader(fragmentShader);
        throw new Error(`Failed to link shader program for '${shaderSource.name}'`);
      }

      // Extract uniforms and attributes
      const uniforms = this.extractUniforms(program);
      const attributes = this.extractAttributes(program);

      const compiledShader: CompiledShader = {
        name: shaderSource.name,
        program,
        uniforms,
        attributes,
        vertexShader,
        fragmentShader
      };

      this.shaders.set(shaderSource.name, compiledShader);
      console.log(`Shader '${shaderSource.name}' compiled successfully:`, {
        uniforms: uniforms.size,
        attributes: attributes.size
      });

      return compiledShader;
    } catch (error) {
      console.error(`Error compiling shader '${shaderSource.name}':`, error);
      return null;
    }
  }

  /**
   * Create and compile individual shader
   */
  private createShader(type: number, source: string, name: string): WebGLShader | null {
    // Check cache first
    const cacheKey = `${type}_${name}`;
    if (this.shaderCache.has(cacheKey)) {
      return this.shaderCache.get(cacheKey)!;
    }

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader);
      console.error(`Shader compilation error (${name}):`, error);
      console.error('Source:', source);
      this.gl.deleteShader(shader);
      return null;
    }

    this.shaderCache.set(cacheKey, shader);
    return shader;
  }

  /**
   * Create and link shader program
   */
  private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
    const program = this.gl.createProgram();
    if (!program) return null;

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const error = this.gl.getProgramInfoLog(program);
      console.error('Program linking error:', error);
      this.gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  /**
   * Extract uniform locations from shader program
   */
  private extractUniforms(program: WebGLProgram): Map<string, ShaderUniform> {
    const uniforms = new Map<string, ShaderUniform>();
    const numUniforms = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);

    for (let i = 0; i < numUniforms; i++) {
      const uniformInfo = this.gl.getActiveUniform(program, i);
      if (!uniformInfo) continue;

      const location = this.gl.getUniformLocation(program, uniformInfo.name);
      const uniform: ShaderUniform = {
        name: uniformInfo.name,
        type: this.getUniformType(uniformInfo.type),
        location
      };

      uniforms.set(uniformInfo.name, uniform);
    }

    return uniforms;
  }

  /**
   * Extract attribute locations from shader program
   */
  private extractAttributes(program: WebGLProgram): Map<string, ShaderAttribute> {
    const attributes = new Map<string, ShaderAttribute>();
    const numAttributes = this.gl.getProgramParameter(program, this.gl.ACTIVE_ATTRIBUTES);

    for (let i = 0; i < numAttributes; i++) {
      const attributeInfo = this.gl.getActiveAttrib(program, i);
      if (!attributeInfo) continue;

      const location = this.gl.getAttribLocation(program, attributeInfo.name);
      const attribute: ShaderAttribute = {
        name: attributeInfo.name,
        location,
        size: this.getAttributeSize(attributeInfo.type),
        type: attributeInfo.type
      };

      attributes.set(attributeInfo.name, attribute);
    }

    return attributes;
  }

  /**
   * Convert GL uniform type to string
   */
  private getUniformType(glType: number): ShaderUniform['type'] {
    const gl = this.gl;
    switch (glType) {
      case gl.FLOAT: return 'float';
      case gl.FLOAT_VEC2: return 'vec2';
      case gl.FLOAT_VEC3: return 'vec3';
      case gl.FLOAT_VEC4: return 'vec4';
      case gl.FLOAT_MAT3: return 'mat3';
      case gl.FLOAT_MAT4: return 'mat4';
      case gl.INT: return 'int';
      case gl.BOOL: return 'bool';
      case gl.SAMPLER_2D: return 'sampler2D';
      default: return 'float';
    }
  }

  /**
   * Get attribute component size
   */
  private getAttributeSize(glType: number): number {
    const gl = this.gl;
    switch (glType) {
      case gl.FLOAT: return 1;
      case gl.FLOAT_VEC2: return 2;
      case gl.FLOAT_VEC3: return 3;
      case gl.FLOAT_VEC4: return 4;
      default: return 1;
    }
  }

  /**
   * Use a specific shader program
   */
  useShader(name: string): CompiledShader | null {
    const shader = this.shaders.get(name);
    if (!shader) {
      console.warn(`Shader '${name}' not found`);
      return null;
    }

    if (this.currentShader !== shader) {
      this.gl.useProgram(shader.program);
      this.currentShader = shader;
    }

    return shader;
  }

  /**
   * Get current active shader
   */
  getCurrentShader(): CompiledShader | null {
    return this.currentShader;
  }

  /**
   * Set uniform value
   */
  setUniform(name: string, value: any): boolean {
    if (!this.currentShader) {
      console.warn('No active shader to set uniform');
      return false;
    }

    const uniform = this.currentShader.uniforms.get(name);
    if (!uniform || !uniform.location) {
      console.warn(`Uniform '${name}' not found in shader '${this.currentShader.name}'`);
      return false;
    }

    try {
      switch (uniform.type) {
        case 'float':
          this.gl.uniform1f(uniform.location, value);
          break;
        case 'vec2':
          this.gl.uniform2fv(uniform.location, value);
          break;
        case 'vec3':
          this.gl.uniform3fv(uniform.location, value);
          break;
        case 'vec4':
          this.gl.uniform4fv(uniform.location, value);
          break;
        case 'mat3':
          this.gl.uniformMatrix3fv(uniform.location, false, value);
          break;
        case 'mat4':
          this.gl.uniformMatrix4fv(uniform.location, false, value);
          break;
        case 'int':
        case 'bool':
        case 'sampler2D':
          this.gl.uniform1i(uniform.location, value);
          break;
        default:
          console.warn(`Unknown uniform type: ${uniform.type}`);
          return false;
      }
      return true;
    } catch (error) {
      console.error(`Error setting uniform '${name}':`, error);
      return false;
    }
  }

  /**
   * Get shader by name
   */
  getShader(name: string): CompiledShader | null {
    return this.shaders.get(name) || null;
  }

  /**
   * Get all compiled shader names
   */
  getShaderNames(): string[] {
    return Array.from(this.shaders.keys());
  }

  /**
   * Hot reload shader (for development)
   */
  reloadShader(shaderSource: ShaderSource): boolean {
    try {
      // Remove old shader
      const oldShader = this.shaders.get(shaderSource.name);
      if (oldShader) {
        this.deleteShader(shaderSource.name);
      }

      // Compile new shader
      const newShader = this.compileShader(shaderSource);
      if (!newShader) {
        console.error(`Failed to reload shader '${shaderSource.name}'`);
        return false;
      }

      console.log(`Shader '${shaderSource.name}' reloaded successfully`);
      return true;
    } catch (error) {
      console.error(`Error reloading shader '${shaderSource.name}':`, error);
      return false;
    }
  }

  /**
   * Delete a shader program
   */
  deleteShader(name: string): boolean {
    const shader = this.shaders.get(name);
    if (!shader) return false;

    // Reset current shader if it's the one being deleted
    if (this.currentShader === shader) {
      this.currentShader = null;
      this.gl.useProgram(null);
    }

    // Clean up WebGL resources
    this.gl.deleteProgram(shader.program);
    this.gl.deleteShader(shader.vertexShader);
    this.gl.deleteShader(shader.fragmentShader);

    this.shaders.delete(name);
    console.log(`Shader '${name}' deleted`);
    return true;
  }

  /**
   * Get shader compilation statistics
   */
  getStats(): {
    totalShaders: number;
    compiledShaders: string[];
    totalUniforms: number;
    totalAttributes: number;
    cacheSize: number;
  } {
    let totalUniforms = 0;
    let totalAttributes = 0;

    for (const shader of this.shaders.values()) {
      totalUniforms += shader.uniforms.size;
      totalAttributes += shader.attributes.size;
    }

    return {
      totalShaders: this.shaders.size,
      compiledShaders: Array.from(this.shaders.keys()),
      totalUniforms,
      totalAttributes,
      cacheSize: this.shaderCache.size
    };
  }

  /**
   * Cleanup all shaders and resources
   */
  destroy(): void {
    // Delete all shader programs
    for (const [name] of this.shaders) {
      this.deleteShader(name);
    }

    // Clear cache
    for (const shader of this.shaderCache.values()) {
      this.gl.deleteShader(shader);
    }
    this.shaderCache.clear();

    this.currentShader = null;
    console.log('ShaderManager destroyed');
  }
}

/**
 * Shader source templates for common shader types
 */
export const ShaderTemplates = {
  /**
   * Basic vertex shader template
   */
  basicVertex: `#version 300 es
    in vec3 a_position;
    in vec2 a_texCoord;
    
    uniform mat4 u_projectionMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_modelMatrix;
    
    out vec2 v_texCoord;
    
    void main() {
      gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_position, 1.0);
      v_texCoord = a_texCoord;
    }`,

  /**
   * Basic fragment shader template
   */
  basicFragment: `#version 300 es
    precision mediump float;
    
    in vec2 v_texCoord;
    
    uniform sampler2D u_texture;
    uniform vec4 u_color;
    
    out vec4 outColor;
    
    void main() {
      outColor = texture(u_texture, v_texCoord) * u_color;
    }`
};