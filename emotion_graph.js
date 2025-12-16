

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
  T_Source: 1.0, // 光源の動的温度を格納する変数を追加
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
  brainwaveState: "---", // 脳波状態を追加
  pi_n_average: 0,
  maxInfluenceIndex: 0, // E-1: K_EM計算用に最大影響度指数を格納
  avg_temp_by_layer: [], // 層ごとの平均温度を格納
  avg_stress_by_layer: [] // 層ごとの平均ストレスを格納
};

// U-1: Timeline-related global variables
let timelineData = null;
let simulationStartTime = 0;
let currentSegmentIndex = 0;
let nextKeyframeIndex = 0;
let wpm = 400; // Words Per Minute

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
    setupWpmSlider(); // WPMスライダーをセットアップ

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

function setupWpmSlider() {
    const slider = document.getElementById('wpm-slider');
    const valueDisplay = document.getElementById('wpm-value');
    slider.addEventListener('input', () => {
        wpm = parseInt(slider.value, 10);
        valueDisplay.textContent = wpm;
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
    // U-1: Advanced TOON Parser
    if (!toonString || toonString.trim() === "") throw new Error("TOON入力が空です。");

    const lines = toonString.split('\n').map(line => line.replace(/#.*$/, '').trimEnd());
    const result = {};
    const path = [];
    let currentIndent = -1;
    let inTable = null;

    function getIndent(line) { return line.match(/^\s*/)[0].length; }

    function getRef(obj, p) {
        let ref = obj;
        for (let i = 0; i < p.length; i++) {
            if (typeof ref[p[i]] === 'undefined') {
                if (i < p.length - 1 && typeof p[i+1] === 'number') ref[p[i]] = [];
                else ref[p[i]] = {};
            }
            ref = ref[p[i]];
        }
        return ref;
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue;

        const indent = getIndent(line);
        const content = line.trim();

        if (inTable) {
            if (indent > currentIndent) {
                const values = content.split(',').map(v => v.trim());
                const row = {};
                inTable.headers.forEach((h, idx) => {
                    const val = values[idx];
                    row[h] = !isNaN(parseFloat(val)) && isFinite(val) ? parseFloat(val) : val;
                });
                getRef(result, path).push(row);
                continue;
            } else {
                inTable = null;
            }
        }

        const pathDepth = Math.floor(indent / 2);
        path.splice(pathDepth);
        currentIndent = indent;

        if (content.startsWith('-')) {
            const arrayPath = path.slice(0, -1);
            const arrayKey = path[path.length - 1];
            const parent = getRef(result, arrayPath);
            if (!Array.isArray(parent[arrayKey])) parent[arrayKey] = [];
            parent[arrayKey].push({});
            path.push(parent[arrayKey].length - 1); // Correctly update path for the new object
            const itemContent = content.substring(1).trim();
            if (itemContent) {
                 const [key, value] = itemContent.split(/:(.*)/s).map(s => s.trim());
                 getRef(result, path)[key] = value;
            }
        } else {
            const [keyPart, value] = content.split(/:(.*)/s).map(s => s.trim());
            
            const tableMatch = keyPart.match(/^(.+)\[(\d+)\]\{(.+)\}$/);
            const arrayMatch = keyPart.match(/^(.+)\[(\d+)\]$/);

            if (tableMatch) {
                const [, key, , headers] = tableMatch;
                path.push(key);
                getRef(result, path.slice(0,-1))[key] = [];
                inTable = { headers: headers.split(',').map(h => h.trim()) };
            } else if (arrayMatch) {
                const [, key] = arrayMatch;
                path.push(key);
            } else {
                if (value !== undefined) {
                    // `highlight_range[2]: 0, 73` のような形式を正しくパースする
                    const simpleArrayMatch = keyPart.match(/^(.+)\[\d+\]$/);
                    if (simpleArrayMatch) {
                        const key = simpleArrayMatch[1];
                        getRef(result, path)[key] = value.split(',').map(v => parseFloat(v.trim()));
                    } else {
                        getRef(result, path)[keyPart] = !isNaN(parseFloat(value)) && isFinite(value) ? parseFloat(value) : value;
                    }
                } else {
                    path.push(keyPart);
                }
            }
        }
    }
    if (!result.metadata || !Array.isArray(result.metadata)) throw new Error("TOON形式にはトップレベルの`metadata`配列が必要です。");
    return result;
}

function resetSimulation(params) {
    // U-1: Reset timeline state
    timelineData = null;
    simulationStartTime = Date.now();
    currentSegmentIndex = 0;
    nextKeyframeIndex = 0;
    document.getElementById('narrative-display').style.display = 'none';
    document.getElementById('narrative-display').innerHTML = '';

    particles.forEach(p => {
        scene.remove(p.mesh); scene.remove(p.label);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        if (p.mesh.material) p.mesh.material.dispose();
        if (p.label && p.label.material) p.label.material.dispose();
    });
    particles = [];
    createParticles();

    if (params) {
        // New format handling
        if (params.metadata && params.metadata.length > 0) {
            timelineData = params; // Store the whole parsed object
            // Start with the first segment
            const firstSegment = timelineData.metadata[0];
            if (firstSegment.source_text) {
                document.getElementById('narrative-display').style.display = 'block';
                document.getElementById('narrative-display').innerHTML = firstSegment.source_text.replace(/\n/g, '<br>');
            }
        }
    } else {
        // Default to "楽" state if no params are provided
        document.querySelector('#calm').click();
    }
}

function animate() {
    requestAnimationFrame(animate);
    // この更新はループの先頭で必ず行う
    const dt = Math.min((Date.now() - lastTime) / 1000, 0.1);
    lastTime = Date.now();

    // U-1: Timeline processing
    if (timelineData && timelineData.metadata && timelineData.metadata[currentSegmentIndex]) {
        const segment = timelineData.metadata[currentSegmentIndex];
        if (segment.timeline && nextKeyframeIndex < segment.timeline.length) {
            const keyframe = segment.timeline[nextKeyframeIndex];
            
            // 動的なタイムスタンプ計算
            // 読了時間 = (文字数 / WPM) * 60秒
            let timestampSeconds = 0;
            if (keyframe.highlight_range && segment.source_text) {
                const textToRead = segment.source_text.substring(0, keyframe.highlight_range[1]);
                // 日本語は1文字を1単語と近似的に扱う
                const wordCount = textToRead.length; 
                timestampSeconds = (wordCount / wpm) * 60;
            } else {
                // highlight_rangeがない場合、前のキーフレームから一定時間後とする
                const prevKeyframeIndex = Math.max(0, nextKeyframeIndex - 1);
                const prevKeyframe = segment.timeline[prevKeyframeIndex];
                // A small fixed duration is added if the previous keyframe also lacks timing info.
                timestampSeconds = ((prevKeyframe.timestampSeconds || 0) + 3); 
            }
            keyframe.timestampSeconds = timestampSeconds; // Store calculated time for next frame
            
            const elapsedTime = (Date.now() - simulationStartTime) / 1000;
            if (elapsedTime >= timestampSeconds) {
                // Apply external aura
                if (keyframe.external_aura) {
                    globalParams.T_env = keyframe.external_aura.T;
                    globalParams.globalExternalStress = keyframe.external_aura.S;
                    globalParams.display_T_env = keyframe.external_aura.T;
                    globalParams.display_GlobalStress = keyframe.external_aura.S;
                }

                // Apply particle overrides
                if (keyframe.particle_overrides) {
                    keyframe.particle_overrides.forEach(override => {
                        const targetParticle = particles.find(p => p.name === override.name);
                        if (targetParticle) {
                            if (typeof override.T !== 'undefined') targetParticle.temperature = override.T;
                            if (typeof override.S !== 'undefined') targetParticle.stress = override.S;
                            if (typeof override.M !== 'undefined') targetParticle.mBase = override.M;
                        }
                    });
                }
                
                // Update UI text highlight
                if (segment.source_text && keyframe.highlight_range && keyframe.highlight_range.length === 2) {
                    const text = segment.source_text;
                    const [start, end] = keyframe.highlight_range;
                    const highlightedText = text.substring(0, start) + `<span class="highlight">${text.substring(start, end)}</span>` + text.substring(end);
                    document.getElementById('narrative-display').innerHTML = highlightedText.replace(/\n/g, '<br>');
                }
                nextKeyframeIndex++;
            }
        } else {
            // 現在のセグメントのタイムラインが終了。次のセグメントに移行する。
            currentSegmentIndex++;
            if (timelineData.metadata[currentSegmentIndex]) {
                // 次のセグメントの準備
                nextKeyframeIndex = 0;
                simulationStartTime = Date.now(); // タイマーをリセット
                const newSegment = timelineData.metadata[currentSegmentIndex];
                if (newSegment.source_text) {
                    document.getElementById('narrative-display').innerHTML = newSegment.source_text.replace(/\n/g, '<br>');
                }
            } else {
                // 全セグメントが終了したらループする
                currentSegmentIndex = 0;
                nextKeyframeIndex = 0;
                simulationStartTime = Date.now();
                const firstSegment = timelineData.metadata[0];
                if (firstSegment && firstSegment.source_text) {
                    document.getElementById('narrative-display').innerHTML = firstSegment.source_text.replace(/\n/g, '<br>');
                }
            }
        }
    }

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

    // 提案: T_Sourceの計算をメインループに移動し、フィードバック遅延を解消
    if (coreParticle) {
        const S_Total = globalParams.systemPotential_Sn_total || 0;
        const S_Ref = 0.5;
        const T_Base = 1.0;
        const K_S_Strong = 1.0;
        let T_Source = T_Base - K_S_Strong * (S_Total - S_Ref);
        globalParams.T_Source = Math.max(0.1, Math.min(1.5, T_Source));
        // 光源自体の温度と輝度も更新
        coreParticle.temperature = globalParams.T_Source;
        // These were moved from CoreParticle.update
        // P-1: 創発重力の実装。system_coreで計算された動的質量を適用する
        coreParticle.massEff = globalParams.coreMagneticMass;

        coreParticle.mesh.material.emissiveIntensity = 0.8 + coreParticle.temperature * 0.2;
        coreParticle.light.intensity = coreParticle.temperature * 2;
    }

    particles.forEach(p => p.update(dt, particles, coreParticle, globalParams));

    weather.update(globalParams);
    
    externalAuraCloud.setVisible(globalParams.externalAuraVisible);
    externalAuraCloud.update(globalParams);

    // U-3: Dominant Emotion 統一判定ロジックの実装
    // 「影響度指数 (Influence Index)」が最大の粒子を特定し、SPEC.mdの仕様に合わせて表示する
    if (particles.length > 0) {
        // 光源を除く18粒子で計算
        const nonCoreParticles = particles.filter(p => !(p instanceof CoreParticle));
        
        let maxInfluenceIndex = -Infinity;
        let dominantEmotionName = "---";

        if (nonCoreParticles.length > 0) {
            // システム全体の平均値（影響度を相対的に評価するため）
            const avgTemp = nonCoreParticles.reduce((s, p) => s + p.temperature, 0) / nonCoreParticles.length;
            const avgStress = nonCoreParticles.reduce((s, p) => s + p.stress, 0) / nonCoreParticles.length;

            nonCoreParticles.forEach(p => {
                // 影響度指数 = (相対温度) * (ストレスの低さ) * (質量の大きさ)
                // 温度が高く、ストレスが低く、質量が大きいほど影響力が強いと定義
                const relativeTemp = p.temperature / (avgTemp + 1e-6);
                const stressFactor = 1.0 - p.stress;
                const influenceIndex = relativeTemp * stressFactor * p.massEff;

                if (influenceIndex > maxInfluenceIndex) {
                    maxInfluenceIndex = influenceIndex;
                    dominantEmotionName = p.name;
                }
            });
            // E-1: K_EM計算用に最大影響度指数をグローバルパラメータに格納
            globalParams.maxInfluenceIndex = maxInfluenceIndex;
        }
        // SPEC.mdの仕様通り「粒子名（季節・天気）」の形式で格納
        globalParams.dominantEmotion = `${dominantEmotionName}（${globalParams.season}・${globalParams.internalAuraWeather}）`;
    } else {
        globalParams.dominantEmotion = "---";
    }

    if (coreParticle) {
        document.getElementById('luminosity').textContent = coreParticle.temperature.toFixed(3);
        document.getElementById('magnetic-mass').textContent = coreParticle.massEff.toFixed(3);
    }

    document.getElementById('system-potential').textContent = (globalParams.systemPotential_Sn_total || 0).toFixed(3);

    updateUI();
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
}

function updateUI() {
    const { pi_n_by_layer, rho_n_by_layer, Gamma_n_by_layer, systemPotential_Sn_total, season, internalAuraWeather, pi_n_average, dominantEmotion, brainwaveState } = globalParams;

    const nonCoreParticles = particles.filter(p => !(p instanceof CoreParticle));
    const avgTemp = nonCoreParticles.length > 0 ? nonCoreParticles.reduce((sum, p) => sum + p.temperature, 0) / nonCoreParticles.length : 0;
    const avgStress = nonCoreParticles.length > 0 ? nonCoreParticles.reduce((sum, p) => sum + p.stress, 0) / nonCoreParticles.length : 0;
    document.getElementById('avg-temp').textContent = avgTemp.toFixed(3);
    document.getElementById('avg-stress').textContent = avgStress.toFixed(3);
    document.getElementById('avg-pi-n').textContent = (globalParams.pi_n_average || 0).toFixed(4);
    document.getElementById('dominant-emotion').textContent = dominantEmotion;
    document.getElementById('brainwave-state').textContent = brainwaveState;

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
