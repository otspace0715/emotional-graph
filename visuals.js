// GLSL (OpenGL Shading Language) for noise generation
const noiseShader = `
  // 2D Random
  float random (vec2 st) {
      return fract(sin(dot(st.xy,
                           vec2(12.9898,78.233)))*
          43758.5453123);
  }

  // 2D Noise based on Morgan McGuire @morgan3d
  // https://www.shadertoy.com/view/4dS3Wd
  float noise (vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);

      // Four corners in 2D of a tile
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));

      // Smooth interpolation
      vec2 u = f*f*(3.0-2.0*f);

      return mix(a, b, u.x) +
              (c - a)* u.y * (1.0 - u.x) +
              (d - b) * u.x * u.y;
  }
`;

const fbmShader = `
#define OCTAVES 6
float fbm (vec2 st) {
    // Initial values
    float value = 0.0;
    float amplitude = .5;
    float frequency = 0.;
    // Loop of octaves
    for (int i = 0; i < OCTAVES; i++) {
        value += amplitude * noise(st);
        st *= 2.;
        amplitude *= .5;
    }
    return value;
}
`;

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 color;
  uniform float time;
  uniform float opacity;
  varying vec2 vUv;

  ${noiseShader}
  ${fbmShader}

  void main() {
    vec2 st = vUv;
    st.x *= 2.0; // Stretch the noise horizontally
    st += time * 0.01; // Move the noise over time
    float noise = fbm(st);
    gl_FragColor = vec4(color, noise * opacity);
  }
`;

function createCloudBackground(scene) {
    const cloudMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 },
            opacity: { value: 0.0 }, // Start with zero opacity
            color: { value: new THREE.Color(0x333344) } // Pressure cloud color
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
    });

    const cloudGeometry = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);
    const cloudPlane = new THREE.Mesh(cloudGeometry, cloudMaterial);
    
    // Position it far behind other objects but in front of the clear color
    cloudPlane.position.z = -150;
    cloudPlane.renderOrder = -1; // Ensure it renders first (in the back)
    
    scene.add(cloudPlane);

    // Keep the plane scaled to the viewport
    function updateCloudSize(camera) {
        const distance = Math.abs(camera.position.z - cloudPlane.position.z);
        const vFOV = (camera.fov * Math.PI) / 180;
        const height = 2 * Math.tan(vFOV / 2) * distance;
        const width = height * camera.aspect;
        cloudPlane.scale.set(width / window.innerWidth, height / window.innerHeight, 1);
    }

    return { cloudMaterial, updateCloudSize };
}
