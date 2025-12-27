// system_core.js

function determineExternalAuraWeather(T_env, externalStress) {
    // 外部環境のTとSに基づいて外部オーラの天候を決定する
    // このロジックは emotion_graph.js の setupEmotionControls にある程度基づく
    if (externalStress > 1.0) return '怒'; // 高ストレスは「怒」
    if (T_env >= 0.7 && externalStress <= 0.6) return '喜'; // 高温・中低ストレスは「喜」
    if (T_env <= 0.45 && externalStress <= 0.3) return '哀'; // 低温・低ストレスは「哀」
    return '楽'; // 上記以外は「楽」
}

// Γ(n)の近似
function gamma(n) {
    if (n === 1) return 1;
    if (n === 0.5) return Math.sqrt(Math.PI);
    return (n - 1) * gamma(n - 1);
}

// n次元球体の体積計算
function V_n(n, pi_n) {
    const n_over_2 = n / 2;
    if (n <= 0) return 0;
    try {
        const gamma_val = gamma(n_over_2 + 1);
        if (gamma_val === 0 || !isFinite(gamma_val)) {
            // console.warn(`Gamma function returned non-finite value for n=${n}`);
            return 0; // ゼロ除算や発散を避ける
        }
        return Math.pow(pi_n, n_over_2) / gamma_val;
    } catch (e) {
        // console.error(`Error calculating V_n for n=${n}`, e);
        return 0;
    }
}


// ===== 季節判定 =====
let lastL5AverageTemp = 0.5; // 変化率計算用の前回値
let lastL5AverageStress = 0.1; // 変化率計算用の前回値
function determineSystemState(l5Particles) {
    if (l5Particles.length === 0) {
        return { brainwave: "δ波 (哀/冬)", season: "冬", weather: "哀" };
    }

    const avgTemp = l5Particles.reduce((s, p) => s + p.temperature, 0) / l5Particles.length;
    const avgStress = l5Particles.reduce((s, p) => s + p.stress, 0) / l5Particles.length;

    // 定義パラメータ - エネルギー安定化後の現実に即した値に再調整
    const T_HIGH = 0.8;  // β/αの境界
    const T_MID = 0.6;  // α/θの境界
    const T_LOW = 0.45;   // θ/δの境界
    const S_HIGH = 0.5;  // 怒の境界
    const S_MID = 0.2;  // 楽/喜の境界

    // 時間変化率を計算
    const tempChangeRate = avgTemp - lastL5AverageTemp;

    // 1. 非常に高温・高ストレス -> β波 (怒/夏)
    if (avgTemp >= T_HIGH && avgStress >= S_HIGH) {
        return { brainwave: "β波 (怒/夏)", season: "夏", weather: "怒" };
    }
    
    // 2. 中温域で低ストレス -> θ波 (楽/秋) - 先に評価する
    if (avgTemp >= T_LOW) {
        if (avgStress <= S_MID) {
            return { brainwave: "θ波 (楽/秋)", season: "秋", weather: "楽" };
        }
    }

    // 3. 高温または中温でストレスが中程度 -> α波 (喜/春)
    if (avgTemp >= T_MID) {
        const season = (tempChangeRate > 0) ? "春" : "秋";
        return { brainwave: `α波 (喜/${season})`, season: season, weather: "喜" };
    }
    
    // 4. 低温 (T < 0.4)
    return { brainwave: "δ波 (哀/冬)", season: "冬", weather: "哀" };
}

// ===== ETCMコアロジック：動的次元力学（DDD）の更新 =====
function updateGlobalDDD(particles, globalParams) {
    // 外部オーラ天気を先に決定
    globalParams.auraWeather = determineExternalAuraWeather(globalParams.T_env, globalParams.globalExternalStress);

    // 0. 初期化
    const layerDefs = [
        { n: 3, name: "核層", particles: [] },       // L0
        { n: 4, name: "身体層", particles: [] },     // L1
        { n: 5, name: "思考層", particles: [] },     // L2
        { n: 6, name: "文明層", particles: [] },     // L3
        { n: 7, name: "外部接合層", particles: [] }, // L4
        { n: 8, name: "外部雰囲気層", particles: [] }  // L5
    ];

    particles.forEach(p => {
        if (p.layer >= 0 && p.layer < layerDefs.length && !(p instanceof CoreParticle)) {
            layerDefs[p.layer].particles.push(p);
        }
    });

    // 1. 各層の基本エネルギー(a,b,c...)を計算
    // Tとσの平均値。粒子がいない層はデフォルト値0
    const layerEnergies = layerDefs.map(layer => {
        if (layer.particles.length === 0) return 0;
        const avgT = layer.particles.reduce((s, p) => s + p.temperature, 0) / layer.particles.length;
        const avgS = layer.particles.reduce((s, p) => s + p.stress, 0) / layer.particles.length;
        return avgT + avgS; // 仮にエネルギーをT+Sとする
    });
    
    // SPEC.md 3. 核心数理 に基づくエネルギー変数の定義
    // 新しい解釈: aは中心核のエネルギー、b-gは各層のエネルギー
    const a = globalParams.T_Source || 1.0; // a: 中心核のエネルギー (T_Source)
    const b = layerEnergies[0]; // b: L0のエネルギー
    const c = layerEnergies[1]; // c: L1のエネルギー
    const d = layerEnergies[2]; // d: L2のエネルギー
    const e = layerEnergies[3]; // e: L3のエネルギー
    const f = layerEnergies[4]; // f: L4のエネルギー
    const g = layerEnergies[5]; // g: L5のエネルギー
    // h は L6 のエネルギーに相当するが、現在は未定義

    // 2. B_n, S_n, π_n, V_n, ρ_n, Γ_n を層ごとに計算
    const new_pi_n = [];
    const new_rho_n = [];
    const new_Gamma_n = [];

    // 2-1. SPEC.md 3. に基づき、B_n (偏移パラメータの累積和) を計算
    const B_values = [];
    B_values[0] = b;                   // B_3 (L0)
    B_values[1] = b + c;               // B_4 (L1)
    B_values[2] = b + c + d;           // B_5 (L2)
    B_values[3] = b + c + d + e;       // B_6 (L3)
    B_values[4] = b + c + d + e + f;   // B_7 (L4)
    B_values[5] = b + c + d + e + f + g; // B_8 (L5)

    // 2-2. 各層のπ_n, ρ_n, Γ_nを計算 (SPEC.md 3.2 統一式)
    for (let i = 0; i < 6; i++) {
        const n = layerDefs[i].n;
        const B_n = B_values[i];
        
        // SPEC.md 3.2 統一式: π_n = (22a + 69B_n) / (7a + 22B_n)
        const pi_n_numerator = 22 * a + 69 * B_n;
        const pi_n_denominator = 7 * a + 22 * B_n;

        // ゼロ除算を防止し、極限値に収束させる
        let pi_n;
        if (pi_n_denominator !== 0) {
            pi_n = pi_n_numerator / pi_n_denominator;
        } else {
            // aが厳密に0の場合は下限値(69/22)に、それ以外(B_nが原因)は上限値(22/7)にフォールバック
            pi_n = (a === 0) ? (69 / 22) : (22 / 7);
        }
        new_pi_n.push(pi_n);

        const vol_n = V_n(n, pi_n);
        const rho_n = (n > 0) ? vol_n / (n * n) : 0; // SPEC.mdに従い V_n / n^2 を維持
        new_rho_n.push(rho_n);
        
        const Gamma_n = Math.log(1 + rho_n);
        new_Gamma_n.push(Gamma_n);
    }
    
    // 2-3. 総ポテンシャル S_n_total を計算 (SPEC.md 3.1)
    // S_8 = a + 3*B_8
    const S_n_total = a + 3 * B_values[5];

    // P-1: 創発重力 (M_Core) の動的計算
    const l0Particles = layerDefs[0].particles;
    if (l0Particles.length > 0) {
        const sumMassEff = l0Particles.reduce((sum, p) => sum + p.massEff, 0);
        const sumStress = l0Particles.reduce((sum, p) => sum + p.stress, 0);
        const sumTemp = l0Particles.reduce((sum, p) => sum + p.temperature, 0);

        // M_Core = (Σ m_eff) * (1 + Σ σ) / (1 + Σ T)
        // 熱が高いと質量が減少し、ストレスが高いと質量が増加するモデル
        // 分母が0になるのを防ぐ (temperatureは常に0.1以上なので安全)
        const denominator = 1 + sumTemp;
        const newCoreMass = sumMassEff * (1 + sumStress) / denominator;

        // 計算結果をglobalParamsに格納
        globalParams.coreMagneticMass = Math.max(0.1, newCoreMass); // 質量が負にならないように保護
    } else {
        // フォールバック
        globalParams.coreMagneticMass = 2.0;
    }

    // 3. globalParamsを更新
    globalParams.pi_n_by_layer = new_pi_n;
    globalParams.rho_n_by_layer = new_rho_n;
    globalParams.Gamma_n_by_layer = new_Gamma_n;
    globalParams.pi_n_average = new_pi_n.reduce((s, v) => s + v, 0) / (new_pi_n.length || 1);
    globalParams.systemPotential_Sn_total = S_n_total;

    // 4. 季節と「内部」オーラの決定
    const l5Particles = layerDefs[5].particles;
    const systemState = determineSystemState(l5Particles);
    globalParams.season = systemState.season;
    globalParams.brainwaveState = systemState.brainwave;
    globalParams.internalAuraWeather = systemState.weather;
    
    if (l5Particles.length > 0) {
        const avgTemp = l5Particles.reduce((sum, p) => sum + p.temperature, 0) / l5Particles.length;
        const avgStress = l5Particles.reduce((sum, p) => sum + p.stress, 0) / l5Particles.length;

        globalParams.l5_avg_temp = avgTemp;
        globalParams.l5_avg_stress = avgStress;

        // 時間変化率を計算してグローバルパラメータに格納
        globalParams.tempChangeRate = avgTemp - lastL5AverageTemp;
        globalParams.stressChangeRate = avgStress - lastL5AverageStress;

        // 次のフレームのために現在値を保存
        lastL5AverageTemp = avgTemp;
        lastL5AverageStress = avgStress;
    }
}

// ===== オーラ天気システム =====
class AuraWeather {
    constructor(scene) {
        this.weatherType = '楽'; // デフォルトは楽（快晴微風）
        this.scene = scene;
        this.createWeatherParticles();
    }
    
    createWeatherParticles() {
        this.particles = [];
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        
        for (let i = 0; i < 2000; i++) { // パーティクル数を増やす
            const r = 48 + Math.random() * 8;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            this.particles.push({
                radius: r,
                theta: theta,
                phi: phi,
                speed: 0.002 + Math.random() * 0.008
            });
            
            positions.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta),
                r * Math.cos(phi)
            );
            
            colors.push(1, 1, 1);
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 0.5, // パーティクルサイズを調整
            vertexColors: true,
            transparent: true,
            opacity: 0.5, // 透明度を調整
            blending: THREE.AdditiveBlending
        });
        
        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);
    }
    
    update(globalParams) { // 引数をauraParticlesからglobalParamsに変更
        this.weatherType = globalParams.internalAuraWeather || '楽';
        
        const positions = this.particleSystem.geometry.attributes.position.array;
        const colors = this.particleSystem.geometry.attributes.color.array;
        const speedMultiplier = (this.weatherType === '怒' ? 4.0 : 1.0);

        this.particles.forEach((p, i) => {
            p.theta += p.speed * speedMultiplier;

            const i3 = i * 3;
            positions[i3] = p.radius * Math.sin(p.phi) * Math.cos(p.theta);
            positions[i3 + 1] = p.radius * Math.sin(p.phi) * Math.sin(p.theta);
            positions[i3 + 2] = p.radius * Math.cos(p.phi);

            const windStrength = (this.weatherType === '怒' ? 0.2 : 0.05);
            positions[i3] += (Math.random() - 0.5) * windStrength;
            positions[i3 + 1] += (Math.random() - 0.5) * windStrength;
            positions[i3 + 2] += (Math.random() - 0.5) * windStrength;

            const color = new THREE.Color();
            if (this.weatherType === '喜') color.setRGB(1, 0.9, 0.5);
            else if (this.weatherType === '楽') color.setRGB(0.7, 0.9, 1);
            else if (this.weatherType === '哀') color.setRGB(0.5, 0.6, 0.9);
            else /* 怒 */ color.setRGB(0.9, 0.3, 0.3);
            
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        });
        
        this.particleSystem.geometry.attributes.position.needsUpdate = true;
        this.particleSystem.geometry.attributes.color.needsUpdate = true;
    }
}
