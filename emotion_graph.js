

// Polyfill for requestAnimationFrame
window.requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || function(callback) { window.setTimeout(callback, 1000 / 60); };

document.addEventListener('DOMContentLoaded', (event) => {
    init();
});

// ===== 粒子定義（19粒子構成） =====
const PARTICLES_CONFIG = {
    l0: [ { name: '悩', type: 'freeze', color: 0x4444AA }, { name: '怒', type: 'drive', color: 0xFF4444 }, { name: '好', type: 'flow', color: 0xFF88FF } ],
    l1: [ { name: '哀', type: 'freeze', color: 0x6688DD }, { name: '激', type: 'drive', color: 0xFF6644 }, { name: '楽', type: 'flow', color: 0xFFDD66 } ],
    l2: [ { name: '嫌', type: 'freeze', color: 0x8844AA }, { name: '活', type: 'drive', color: 0x44FF44 }, { name: '融', type: 'flow', color: 0x44DDDD } ],
    l3: [ { name: '圧', type: 'freeze', color: 0x666666 }, { name: '喜', type: 'drive', color: 0xFFDD44 }, { name: '笑', type: 'flow', color: 0xFFAA88 } ],
    l4: [ { name: '調', type: 'flow', color: 0x88DDAA }, { name: '変', type: 'drive', color: 0xAAFF88 }, { name: '静', type: 'freeze', color: 0x88AADD } ],
    l5: [ { name: '観', type: 'flow', color: 0xCCCCFF }, { name: '響', type: 'drive', color: 0xFFCCCC }, { name: '隔', type: 'freeze', color: 0xCCFFCC } ]
};

// ===== 層構造定義 =====
const LAYERS = [
    { index: 0, name: '核層', radius: 8, color: 0xFFFFAA, opacity: 0.25 },
    { index: 1, name: '身体層', radius: 16, color: 0xFF8844, opacity: 0.22 },
    { index: 2, name: '思考層', radius: 24, color: 0x44DDFF, opacity: 0.2 },
    { index: 3, name: '文明層', radius: 32, color: 0x888888, opacity: 0.18 },
    { index: 4, name: '外部接合層', radius: 40, color: 0x88DDAA, opacity: 0.15 },
    { index: 5, name: '外部雰囲気層', radius: 50, color: 0xCCCCFF, opacity: 0.12 }
];

// ===== Global variables =====
let scene, camera, renderer;
let particles = [], weather, externalAuraCloud;

const globalParams = {
  // Physics parameters
  T_env: 0.6,
  globalExternalStress: 0.0,
  // Display parameters
  display_T_env: 0.6,
  display_GlobalStress: 0.0,
  // ---
  pi_n_by_layer: [], rho_n_by_layer: [], Gamma_n_by_layer: [],
  systemPotential_Sn_total: 0,
  season: "冬", auraWeather: "楽", internalAuraWeather: "楽",
  coreMagneticMass: 2.0,
  externalAuraVisible: true,
  dominantEmotion: "---",
  pi_n_average: 0,
  avg_temp_by_layer: [], // 層ごとの平均温度を格納
  avg_stress_by_layer: [] // 層ごとの平均ストレスを格納
};
let lastTime = Date.now();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.Fog(0x050510, 50, 200);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 30, 80);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('container').appendChild(renderer.domElement);

    drawLayerBoundaries();
    weather = new AuraWeather(scene);
    externalAuraCloud = new ExternalAuraCloud(scene); // Add this line
    createParticles();

    const ambientLight = new THREE.AmbientLight(0x333355, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xFFFFFF, 0.3);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    setupMouseControls();
    setupUIToggle();
    setupEmotionControls();
    setupToonInput();
    setupDebugToggle(); // 新しいデバッグ切替をセットアップ

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
}

function drawLayerBoundaries() {
    LAYERS.forEach(layer => {
        const geom = new THREE.SphereGeometry(layer.radius, 32, 32);
        const mat = new THREE.MeshPhongMaterial({ color: layer.color, transparent: true, opacity: layer.opacity, wireframe: false, side: THREE.DoubleSide, depthWrite: false });
        scene.add(new THREE.Mesh(geom, mat));
        const wireGeom = new THREE.SphereGeometry(layer.radius, 16, 16);
        const wireMat = new THREE.MeshBasicMaterial({ color: layer.color, wireframe: true, transparent: true, opacity: 0.4 });
        scene.add(new THREE.Mesh(wireGeom, wireMat));
    });
}

function createParticles() {
    Object.keys(PARTICLES_CONFIG).forEach((layerKey, idx) => {
        const outerRadius = LAYERS[idx].radius;
        const innerRadius = idx > 0 ? LAYERS[idx - 1].radius : 2; // Prevent layer 0 particles from spawning in the center
        
        // Use the midpoint of the shell as the base radius for physics
        const baseRadius = innerRadius + (outerRadius - innerRadius) / 2;

        PARTICLES_CONFIG[layerKey].forEach(config => {
            // Position randomly within the layer's shell volume
            const initialRadius = innerRadius + Math.random() * (outerRadius - innerRadius);
            // Pass the new midpoint baseRadius for physics.
            particles.push(new Particle(config, idx, initialRadius, baseRadius, scene));
        });
    });

    // 19番目の粒子「光体」を生成し、配列の先頭に追加
    const coreParticle = new CoreParticle(scene);
    particles.unshift(coreParticle);
}

function setupMouseControls() {
    let isDragging = false;
    renderer.domElement.addEventListener('mousedown', (e) => { if (e.target === renderer.domElement) isDragging = true; });
    document.addEventListener('mouseup', () => { isDragging = false; });
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.movementX || 0, deltaY = e.movementY || 0;
            const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * 0.005);
            const rotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deltaY * 0.005);
            camera.position.applyQuaternion(rotY.multiply(rotX));
            camera.lookAt(0, 0, 0);
        }
    });
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.position.z = Math.max(30, Math.min(150, camera.position.z + e.deltaY * 0.05));
    });
}

function setupUIToggle() {
    const footer = document.getElementById('fixed-footer'), button = document.getElementById('toggle-button'), icon = document.getElementById('toggle-icon');
    button.addEventListener('click', () => {
        const isCollapsed = footer.classList.toggle('collapsed');
        icon.textContent = isCollapsed ? '▲' : '▼';
        button.setAttribute('aria-expanded', String(!isCollapsed));
    });
}

function setupDebugToggle() {
    const button = document.getElementById('toggle-debug-button');
    const container = document.getElementById('debug-stats-container');
    button.addEventListener('click', () => {
        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
        button.textContent = isHidden ? 'デバッグ非表示' : 'デバッグ表示';
    });
}

function setupEmotionControls() {
    document.querySelectorAll('.emotion-button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.emotion-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            if (button.id === 'no-aura') {
                globalParams.externalAuraVisible = false;
                // 外部オーラの影響を物理的に無効化する
                const neutral_T = 0.6;
                const neutral_S = 0.0;
                globalParams.T_env = neutral_T;
                globalParams.globalExternalStress = neutral_S;
                globalParams.display_T_env = neutral_T;
                globalParams.display_GlobalStress = neutral_S;
            } else {
                globalParams.externalAuraVisible = true;
                let T = 0.6, S = 0.0;
                switch (button.id) {
                    case 'joy': T = 0.7; S = 0.5; break;
                    case 'anger': T = 0.5; S = 2.0; break;
                    case 'sadness': T = 0.4; S = 0.2; break;
                    case 'calm': T = 0.6; S = 0.0; break;
                }
                // Set both physics and display params
                globalParams.T_env = T;
                globalParams.globalExternalStress = S;
                globalParams.display_T_env = T;
                globalParams.display_GlobalStress = S;
            }
        });
    });
}

function setupToonInput() {
    document.getElementById('apply-prompt-button').addEventListener('click', () => {
        const toonString = document.getElementById('json-input-area').value, statusElement = document.getElementById('input-status-message');
        try {
            const params = parseToonInput(toonString);
            resetSimulation(params);
            statusElement.textContent = `✅ パラメータ適用成功`; statusElement.style.color = '#6ee7b7';
        } catch (error) {
            statusElement.textContent = `❌ TOON解析エラー: ${error.message}`; statusElement.style.color = '#f87171';
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
        if (line.trim().startsWith('system_parameters:')) { currentSection = data.system_parameters; continue; }
        if (line.trim().startsWith('external_field_analysis:')) { currentSection = data.external_field_analysis; continue; }
        if (currentSection) {
            const parts = line.trim().split(':');
            if (parts.length === 2) currentSection[parts[0].trim()] = parts[1].trim();
        }
    }
    if (Object.keys(data.system_parameters).length === 0) throw new Error("'system_parameters'セクションがありません。");
    const params = { T: parseFloat(data.system_parameters.T_activity_avg), M: parseFloat(data.system_parameters.M_inertia_avg), S: parseFloat(data.system_parameters.S_load_avg) };
    for (const key in params) if (isNaN(params[key])) throw new Error(`無効な数値: ${key}`);
    return params;
}

function resetSimulation(params) {
    particles.forEach(p => {
        scene.remove(p.mesh); scene.remove(p.label);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        if (p.mesh.material) p.mesh.material.dispose();
        if (p.label.material) p.label.material.dispose();
    });
    particles = [];
    createParticles();
    if (params) {
        particles.forEach(p => { p.temperature = params.T || 0.5; p.stress = params.S || 0.1; p.mBase = 1.0 + (params.M || 0.5); });
    }
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min((Date.now() - lastTime) / 1000, 0.1);
    lastTime = Date.now();
    // Decay the physics stress, but not the display stress
    globalParams.globalExternalStress = Math.max(0, globalParams.globalExternalStress * (1 - 2.5 * dt));

    // 層ごとの平均温度を計算してglobalParamsに格納
    const avgTemps = [], avgStresses = [];
    for (let i = 0; i < 6; i++) {
        const layerParticles = particles.filter(p => p.layer === i && !(p instanceof CoreParticle));
        if (layerParticles.length > 0) {
            avgTemps[i] = layerParticles.reduce((sum, p) => sum + p.temperature, 0) / layerParticles.length;
            avgStresses[i] = layerParticles.reduce((sum, p) => sum + p.stress, 0) / layerParticles.length;
        } else {
            avgTemps[i] = 0.5; // 粒子がいない場合はデフォルト値
            avgStresses[i] = 0.1; // 粒子がいない場合はデフォルト値
        }
    }
    globalParams.avg_temp_by_layer = avgTemps;
    globalParams.avg_stress_by_layer = avgStresses;

    updateGlobalDDD(particles, globalParams);
    
    // 光体（particles[0]）は他の粒子に影響を与えるため、最初に更新
    // 他の粒子は光体の影響を受けた状態で更新される
    const coreParticle = particles.find(p => p instanceof CoreParticle);
    particles.forEach(p => p.update(dt, particles, coreParticle, globalParams));

    weather.update(globalParams);
    
    externalAuraCloud.setVisible(globalParams.externalAuraVisible);
    externalAuraCloud.update(globalParams);

    // 支配的感情の決定ロジック (最もストレスが高い粒子)
    if (particles.length > 0) {
        // 光体は除外して計算
        const nonCoreParticles = particles.filter(p => !(p instanceof CoreParticle));
        const dominantParticle = nonCoreParticles.reduce((maxP, p) => p.stress > maxP.stress ? p : maxP, nonCoreParticles[0]);
        globalParams.dominantEmotion = dominantParticle.name;
    } else {
        globalParams.dominantEmotion = "---";
    }


    updateUI();
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
}

function updateUI() {
    const { pi_n_by_layer, rho_n_by_layer, Gamma_n_by_layer, systemPotential_Sn_total, season, internalAuraWeather, pi_n_average, dominantEmotion } = globalParams;
    const coreParticle = particles.find(p => p instanceof CoreParticle);

    if (coreParticle) {
        document.getElementById('luminosity').textContent = coreParticle.temperature.toFixed(3);
        document.getElementById('magnetic-mass').textContent = coreParticle.massEff.toFixed(3);
    }

    document.getElementById('system-potential').textContent = (systemPotential_Sn_total || 0).toFixed(3);

    const nonCoreParticles = particles.filter(p => !(p instanceof CoreParticle));
    const avgTemp = nonCoreParticles.length > 0 ? nonCoreParticles.reduce((sum, p) => sum + p.temperature, 0) / nonCoreParticles.length : 0;
    const avgStress = nonCoreParticles.length > 0 ? nonCoreParticles.reduce((sum, p) => sum + p.stress, 0) / nonCoreParticles.length : 0;
    document.getElementById('avg-temp').textContent = avgTemp.toFixed(3);
    document.getElementById('avg-stress').textContent = avgStress.toFixed(3);
    document.getElementById('avg-pi-n').textContent = (globalParams.pi_n_average || 0).toFixed(4);
    document.getElementById('dominant-emotion').textContent = dominantEmotion;

    // Determine display weather from display params
    let displayAuraWeather;
    let weatherColor = '#87CEEB'; // Default color for '楽'

    if (!globalParams.externalAuraVisible) {
        displayAuraWeather = '無し';
        weatherColor = '#999'; // Neutral color for "None"
    } else {
        if (globalParams.display_GlobalStress > 1.0) { displayAuraWeather = '怒'; weatherColor = '#FF6347'; }
        else if (globalParams.display_T_env >= 0.7 && globalParams.display_GlobalStress <= 0.6) { displayAuraWeather = '喜'; weatherColor = '#FFD700'; }
        else if (globalParams.display_T_env <= 0.45 && globalParams.display_GlobalStress <= 0.3) { displayAuraWeather = '哀'; weatherColor = '#9370DB'; }
        else { displayAuraWeather = '楽'; weatherColor = '#87CEEB'; }
    }

    const weatherEl = document.getElementById('weather');
    weatherEl.textContent = `${displayAuraWeather}`;
    weatherEl.style.color = weatherColor;

    const internalWeatherEl = document.getElementById('internal-weather');
    internalWeatherEl.textContent = `${season}・${internalAuraWeather}`;
    internalWeatherEl.style.color = internalAuraWeather === '喜' ? '#FFD700' : internalAuraWeather === '楽' ? '#87CEEB' : internalAuraWeather === '哀' ? '#9370DB' : '#FF6347';

    // Update DDD stats table
    const dddBody = document.getElementById('ddd-stats-body');
    let tableHTML = '';
    for (let i = 0; i < 6; i++) {
        tableHTML += `
            <tr>
                <td>L${i} (n=${i+2})</td>
                <td>${(pi_n_by_layer[i] || 0).toFixed(4)}</td>
                <td>${(rho_n_by_layer[i] || 0).toExponential(2)}</td>
                <td>${(Gamma_n_by_layer[i] || 0).toFixed(3)}</td>
            </tr>
        `;
    }
    dddBody.innerHTML = tableHTML;

    // Update Debug UI
    document.getElementById('debug-aura-weather').textContent = globalParams.auraWeather; // This shows the decaying physics weather
    document.getElementById('debug-l5-temp').textContent = (globalParams.l5_avg_temp || 0).toFixed(3);
    document.getElementById('debug-l5-stress').textContent = (globalParams.l5_avg_stress || 0).toFixed(3);

    if (particles.length >= 18) {
        for (let i = 0; i < 6; i++) {
            const layerParticles = particles.filter(p => p.layer === i);
            if (layerParticles.length > 0) {
                const avgCentral = layerParticles.reduce((sum, p) => sum + p.debug_centralForce, 0) / layerParticles.length;
                const avgBoundary = layerParticles.reduce((sum, p) => sum + p.debug_boundaryForce, 0) / layerParticles.length;
                document.getElementById(`debug-l${i}-central`).textContent = avgCentral.toFixed(3);
                document.getElementById(`debug-l${i}-boundary`).textContent = avgBoundary.toFixed(3);
            }
        }
    }
}
