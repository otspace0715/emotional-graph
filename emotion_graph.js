// Gamma function (Lanczos approximation) for n-sphere volume calculation
function gamma(n) {
    const p = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (n < 0.5) {
        return Math.PI / (Math.sin(Math.PI * n) * gamma(1 - n));
    }
    n--;
    let x = 0.99999999999980993;
    for (let i = 0; i < p.length; i++) {
        x += p[i] / (n + i + 1);
    }
    const t = n + p.length - 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, n + 0.5) * Math.exp(-t) * x;
}


// Polyfill for requestAnimationFrame
window.requestAnimationFrame = (function(){
    return  window.requestAnimationFrame       ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            function( callback ){
              window.setTimeout(callback, 1000 / 60);
            };
  })();
  
  // Wait for the DOM to be ready
  document.addEventListener('DOMContentLoaded', (event) => {
      if (typeof Particle === 'undefined' || typeof CoreLight === 'undefined' || typeof AuraWeather === 'undefined') {
          console.error('Required classes (Particle, CoreLight, AuraWeather) are not defined.');
          return;
      }
      init();
  });
  
  
  // ===== 粒子定義（19粒子構成） =====
  const PARTICLES_CONFIG = {
      core: { name: '光', layer: -1, type: 'flow', color: 0xFFFFAA },
      l0: [
          { name: '悩', type: 'freeze', color: 0x4444AA }, { name: '怒', type: 'drive', color: 0xFF4444 }, { name: '好', type: 'flow', color: 0xFF88FF }
      ],
      l1: [
          { name: '哀', type: 'freeze', color: 0x6688DD }, { name: '激', type: 'drive', color: 0xFF6644 }, { name: '楽', type: 'flow', color: 0xFFDD66 }
      ],
      l2: [
          { name: '嫌', type: 'freeze', color: 0x8844AA }, { name: '活', type: 'drive', color: 0x44FF44 }, { name: '融', type: 'flow', color: 0x44DDDD }
      ],
      l3: [
          { name: '圧', type: 'freeze', color: 0x666666 }, { name: '喜', type: 'drive', color: 0xFFDD44 }, { name: '笑', type: 'flow', color: 0xFFAA88 }
      ],
      l4: [
          { name: '調', type: 'flow', color: 0x88DDAA }, { name: '変', type: 'drive', color: 0xAAFF88 }, { name: '静', type: 'freeze', color: 0x88AADD }
      ],
      l5: [
          { name: '観', type: 'flow', color: 0xCCCCFF }, { name: '響', type: 'drive', color: 0xFFCCCC }, { name: '隔', type: 'freeze', color: 0xCCFFCC }
      ]
  };
  
  // ===== 層構造定義 =====
  const LAYERS = [
      { index: 0, name: '核層', radius: 8, phase: 'light', color: 0xFFFFAA, opacity: 0.25 },
      { index: 1, name: '身体層', radius: 16, phase: 'gas', color: 0xFF8844, opacity: 0.22 },
      { index: 2, name: '思考層', radius: 24, phase: 'liquid', color: 0x44DDFF, opacity: 0.2 },
      { index: 3, name: '文明層', radius: 32, phase: 'solid', color: 0x888888, opacity: 0.18 },
      { index: 4, name: '外部接合層', radius: 40, phase: 'liquid', color: 0x88DDAA, opacity: 0.15 },
      { index: 5, name: '外部雰囲気層', radius: 50, phase: 'gas', color: 0xCCCCFF, opacity: 0.12 }
  ];
  
  // ===== Global variables =====
  let scene, camera, renderer;
  let core, particles = [], weather;
  let currentEmotionPressure = 'calm';
  
  const globalParams = {
      T_env: 0.6,
      coreMagneticMass: 2.0,
      globalExternalStress: 0.0, // Stress from emotion buttons
      systemPotential_Sn: 0.0,   // E.D.D. 全系の総ポテンシャル
      n: 3.0,                    // E.D.D. 動的実効次元
      pi_n: 3.14,                // E.D.D. 多次元円周率
      rho_n: 0.0,                // E.D.D. 熱力学的密度
  };
  let lastTime = Date.now();
  
  
  function init() {
      // ===== シーン初期化 =====
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050510);
      scene.fog = new THREE.Fog(0x050510, 50, 200);
  
      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, 30, 80);
  
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      document.getElementById('container').appendChild(renderer.domElement);
  
      // ===== 層境界球の描画 =====
      drawLayerBoundaries();
  
      // ===== オブジェクトの初期化 =====
      core = new CoreLight(scene);
      weather = new AuraWeather(scene);
      createParticles();
  
      // ===== 照明 =====
      const ambientLight = new THREE.AmbientLight(0x333355, 0.5);
      scene.add(ambientLight);
      
      const dirLight = new THREE.DirectionalLight(0xFFFFFF, 0.3);
      dirLight.position.set(10, 20, 10);
      scene.add(dirLight);
  
      // ===== UIと操作 =====
      setupMouseControls();
      setupUIToggle();
      setupEmotionControls();
      setupToonInput();
  
      // ===== リサイズ処理 =====
      window.addEventListener('resize', () => {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
      });
  
      // ===== アニメーション開始 =====
      animate();
  }
  
  function drawLayerBoundaries() {
      LAYERS.forEach(layer => {
          const geometry = new THREE.SphereGeometry(layer.radius, 32, 32);
          const material = new THREE.MeshPhongMaterial({
              color: layer.color, transparent: true, opacity: layer.opacity,
              wireframe: false, side: THREE.DoubleSide, depthWrite: false
          });
          scene.add(new THREE.Mesh(geometry, material));
          
          const wireframeGeometry = new THREE.SphereGeometry(layer.radius, 16, 16);
          const wireframeMaterial = new THREE.MeshBasicMaterial({
              color: layer.color, wireframe: true, transparent: true, opacity: 0.4
          });
          scene.add(new THREE.Mesh(wireframeGeometry, wireframeMaterial));
      });
  }
  
  function createParticles() {
      ['l0', 'l1', 'l2', 'l3', 'l4', 'l5'].forEach((layerKey, idx) => {
          PARTICLES_CONFIG[layerKey].forEach(config => {
              particles.push(new Particle(config, idx, LAYERS[idx].radius, scene));
          });
      });
  }  function setupMouseControls() {
      let isDragging = false;
      let previousMousePosition = { x: 0, y: 0 };
      
      renderer.domElement.addEventListener('mousedown', (e) => { 
          if (e.target === renderer.domElement) isDragging = true; 
      });
      document.addEventListener('mouseup', () => { isDragging = false; });
      document.addEventListener('mousemove', (e) => {
          if (isDragging) {
              const deltaX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
              const deltaY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
              
              const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * 0.005);
              const rotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deltaY * 0.005);
              
              camera.position.applyQuaternion(rotY.multiply(rotX));
              camera.lookAt(0, 0, 0);
          }
          previousMousePosition = { x: e.offsetX, y: e.offsetY };
      });
      
      renderer.domElement.addEventListener('wheel', (e) => {
          e.preventDefault();
          camera.position.z += e.deltaY * 0.05;
          camera.position.z = Math.max(30, Math.min(150, camera.position.z));
      });
  }
  
  function setupUIToggle() {
      const footer = document.getElementById('fixed-footer');
      const button = document.getElementById('toggle-button');
      const icon = document.getElementById('toggle-icon');
      
      button.addEventListener('click', () => {
          const isCollapsed = footer.classList.toggle('collapsed');
          icon.textContent = isCollapsed ? '▲' : '▼';
          button.setAttribute('aria-expanded', String(!isCollapsed));
      });
  }
  
  function setupEmotionControls() {
      document.querySelectorAll('.emotion-button').forEach(button => {
          button.addEventListener('click', () => {
              currentEmotionPressure = button.id;
              document.querySelectorAll('.emotion-button').forEach(btn => btn.classList.remove('active'));
              button.classList.add('active');

              switch(currentEmotionPressure) {
                  case 'joy':
                      globalParams.T_env = 0.7;
                      globalParams.globalExternalStress = 0.5;
                      break;
                  case 'anger':
                      globalParams.T_env = 0.5;
                      globalParams.globalExternalStress = 2.0;
                      break;
                  case 'sadness':
                      globalParams.T_env = 0.4;
                      globalParams.globalExternalStress = 0.2;
                      break;
                  case 'calm':
                      globalParams.T_env = 0.6;
                      globalParams.globalExternalStress = 0.0;
                      break;
              }
          });
      });
  }
  
  function setupToonInput() {
      document.getElementById('apply-prompt-button').addEventListener('click', () => {
          const toonString = document.getElementById('json-input-area').value;
          const statusElement = document.getElementById('input-status-message');
          try {
              const params = parseToonInput(toonString);
              resetSimulation(params);
              statusElement.textContent = `✅ パラメータ適用成功`;
              statusElement.style.color = '#6ee7b7';
          } catch (error) {
              statusElement.textContent = `❌ TOON解析エラー: ${error.message}`;
              statusElement.style.color = '#f87171';
              console.error("Prompt Input Error:", error);
          }
      });
  }
  
  function parseToonInput(toonString) {
      if (!toonString || toonString.trim() === "") throw new Error("入力が空です。");
      const lines = toonString.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
      const data = { system_parameters: {}, external_field_analysis: {} };
      let currentSection = null;
      for (const line of lines) {
          const indentation = line.length - line.trimStart().length;
          if (indentation === 0) {
              const sectionName = line.trim().replace(':', '').trim();
              if (data.hasOwnProperty(sectionName)) currentSection = data[sectionName];
              else throw new Error(`無効なセクション: ${sectionName}`);
          } else {
              if (!currentSection) throw new Error("セクション外のインデント。");
              const parts = line.trim().split(':');
              if (parts.length !== 2) throw new Error(`無効なKey-Valueペア: ${line.trim()}`);
              currentSection[parts[0].trim()] = parts[1].trim();
          }
      }
      if (Object.keys(data.system_parameters).length === 0) throw new Error("'system_parameters'セクションがありません。");
      
      const params = {
          T: parseFloat(data.system_parameters.T_activity_avg),
          M: parseFloat(data.system_parameters.M_inertia_avg),
          S: parseFloat(data.system_parameters.S_load_avg),
      };
      for (const key in params) {
          if (isNaN(params[key])) throw new Error(`無効な数値: ${key}`);
      }
      return params;
  }
  
  function resetSimulation(params) {
      // Dispose and remove old particles
      particles.forEach(p => {
          scene.remove(p.mesh);
          scene.remove(p.label);
          if (p.mesh.geometry) p.mesh.geometry.dispose();
          if (p.mesh.material) p.mesh.material.dispose();
          if (p.label.material) p.label.material.dispose();
      });
      particles = [];
  
      // Create new particles
      createParticles();
  
      // Initialize with new parameters if provided
      if (params) {
          particles.forEach(p => {
              p.temperature = p.layer === 0 ? params.T : Math.max(0.2, params.T);
              p.stress = p.layer >= 4 ? params.S : params.S * (p.layer === 0 ? 0.5 : 0.3);
              p.mBase = 1.0 + (params.M * (p.layer >= 3 ? 0.8 : 0.2));
              p.massEff = p.mBase;
          });
      }
  }
  
  
  function animate() {
      requestAnimationFrame(animate);
      
      const currentTime = Date.now();
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;
      
      // Decay global stress
      globalParams.globalExternalStress *= (1 - 2.5 * dt);
      if (globalParams.globalExternalStress < 0.01) globalParams.globalExternalStress = 0;
  
      const nuclearParticles = particles.filter(p => p.layer === 0);
      const auraParticles = particles.filter(p => p.layer === 5);
      
      // --- Emotional Dimensional Dynamics (E.D.D.) ---
      if (particles.length > 0) {
          // Step 1: Calculate S_n (Total Potential)
          const avgTemp = particles.reduce((sum, p) => sum + p.temperature, 0) / particles.length;
          const avgStress = particles.reduce((sum, p) => sum + p.stress, 0) / particles.length;
          const avgMassEff = particles.reduce((sum, p) => sum + p.massEff, 0) / particles.length;
          const x = avgTemp;
          const y = 1.0 - avgStress;
          const Sn = x + 3 * y + avgMassEff;
          globalParams.systemPotential_Sn = Math.max(0.1, Sn); // Prevent Sn from being zero
  
          // Step 2: Determine n (Dynamic Dimension)
          const coreTemp = nuclearParticles.length > 0 ? nuclearParticles.reduce((sum, p) => sum + p.temperature, 0) / nuclearParticles.length : avgTemp;
          const k1 = 1.5, k2 = 2.5; // Coefficients for dimension calculation
          const n = 3.0 + k1 * avgStress + k2 * coreTemp;
          globalParams.n = Math.max(3.0, Math.min(7.0, n)); // Clamp n between 3 and 7
  
          // Step 3: Calculate pi_n (Dynamic Stability Constant)
          const term1 = 7 * globalParams.systemPotential_Sn + y;
          if (Math.abs(term1) > 1e-6) {
              globalParams.pi_n = (3 * term1 + globalParams.systemPotential_Sn) / term1;
          } else {
              globalParams.pi_n = 3.14; // Fallback
          }
  
          // Step 4: Calculate rho_n (Thermodynamic Density)
          const R = LAYERS[LAYERS.length - 1].radius; // System radius
          const V_n_numerator = Math.pow(R, globalParams.n) * Math.pow(globalParams.pi_n, globalParams.n / 2);
          const V_n_denominator = gamma(globalParams.n / 2 + 1);
          if (Math.abs(V_n_denominator) > 1e-9) {
              const V_n = V_n_numerator / V_n_denominator;
              if (Math.abs(V_n) > 1e-9) {
                  globalParams.rho_n = globalParams.systemPotential_Sn / V_n;
              } else {
                  globalParams.rho_n = 0; // Avoid division by zero
              }
          } else {
              globalParams.rho_n = 0; // Avoid division by zero
          }
      }
      // --- End of E.D.D. ---
  
      core.update(particles, globalParams);
      globalParams.coreMagneticMass = core.magneticMass;
  
      particles.forEach(p => p.update(dt, particles, core, globalParams));
      
      weather.update(auraParticles);
      
      updateUI();      
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
  }
  
  function updateUI() {
      const avgTemp = particles.length > 0 ? particles.reduce((sum, p) => sum + p.temperature, 0) / particles.length : 0;
      const avgStress = particles.length > 0 ? particles.reduce((sum, p) => sum + p.stress, 0) / particles.length : 0;
      
      document.getElementById('luminosity').textContent = core.luminosity.toFixed(3);
      document.getElementById('magnetic-mass').textContent = core.magneticMass.toFixed(3);
      document.getElementById('system-potential').textContent = globalParams.systemPotential_Sn.toFixed(3);
      document.getElementById('weather').textContent = weather.weatherType;
      document.getElementById('avg-temp').textContent = avgTemp.toFixed(3);
      document.getElementById('avg-stress').textContent = avgStress.toFixed(3);
      // New UI elements for E.D.D.
      document.getElementById('dynamic-dimension').textContent = globalParams.n.toFixed(3);
      document.getElementById('pi-n').textContent = globalParams.pi_n.toFixed(3);
      document.getElementById('rho-n').textContent = globalParams.rho_n.toExponential(3);
  
      const weatherEl = document.getElementById('weather');
      weatherEl.style.color = 
          weather.weatherType === '喜' ? '#FFD700' :
          weather.weatherType === '楽' ? '#87CEEB' :
          weather.weatherType === '哀' ? '#9370DB' :
          '#FF6347'; // 怒

      // --- Update Debug UI ---
      if (particles.length >= 18) {
        for (let i = 0; i < 6; i++) {
            const layerParticles = particles.slice(i * 3, i * 3 + 3);
            
            const avgCentral = layerParticles.reduce((sum, p) => sum + p.debug_centralForce, 0) / 3;
            const avgBoundary = layerParticles.reduce((sum, p) => sum + p.debug_boundaryForce, 0) / 3;

            const centralEl = document.getElementById(`debug-l${i}-central`);
            const boundaryEl = document.getElementById(`debug-l${i}-boundary`);
    
            if (centralEl) {
                centralEl.textContent = avgCentral.toFixed(3);
            }
            if (boundaryEl) {
                boundaryEl.textContent = avgBoundary.toFixed(3);
            }
        }
    }
  }
