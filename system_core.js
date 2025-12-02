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
let lastL5AverageTemp = 0.5;
function determineSeason(l5Particles) {
    if (l5Particles.length === 0) return "冬";

    const avgTemp = l5Particles.reduce((sum, p) => sum + p.temperature, 0) / l5Particles.length;
    const tempChangeRate = avgTemp - lastL5AverageTemp;
    lastL5AverageTemp = avgTemp;

    if (avgTemp > 0.65) {
        return tempChangeRate > 0 ? "夏" : "秋";
    } else {
        return tempChangeRate > 0 ? "春" : "冬";
    }
}


// ===== ETCMコアロジック：動的次元力学（DDD）の更新 =====
function updateGlobalDDD(particles, globalParams) {
    // 外部オーラ天気を先に決定
    globalParams.auraWeather = determineExternalAuraWeather(globalParams.T_env, globalParams.globalExternalStress);

    // 0. 初期化
    const layerDefs = [
        { n: 2, name: "核", particles: [] },
        { n: 3, name: "身体", particles: [] },
        { n: 4, name: "思考", particles: [] },
        { n: 5, name: "文明", particles: [] },
        { n: 6, name: "外部接合", particles: [] },
        { n: 7, name: "外部雰囲気", particles: [] }
    ];

    particles.forEach(p => {
        if (p.layer >= 0 && p.layer < layerDefs.length) {
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
    
    const [a, c, d, e, f, g] = layerEnergies;
    const b = layerEnergies.reduce((s, val) => s + val, 0) / (layerEnergies.filter(v => v > 0).length || 1);

    // 2. S_n, π_n, V_n, ρ_n, Γ_n を層ごとに計算
    let S_n_total = 0; // 総ポテンシャルは別途計算
    const new_pi_n = [];
    const new_rho_n = [];
    const new_Gamma_n = [];

    // 2-1. ポテンシャルS_nを連鎖構造で計算
    // S_n = S_{n-1} + 3 * (layer_energy) の構造を実装
    const Sn_values = [];
    Sn_values[0] = a + 3 * b; // S_2
    Sn_values[1] = Sn_values[0] + 3 * c; // S_3
    Sn_values[2] = Sn_values[1] + 3 * d; // S_4
    Sn_values[3] = Sn_values[2] + 3 * e; // S_5
    Sn_values[4] = Sn_values[3] + 3 * f; // S_6
    Sn_values[5] = Sn_values[4] + 3 * g; // S_7
    S_n_total = Sn_values[5]; // S_7に相当するものが総ポテンシャル

    // 2-2. 各層のπ_n, ρ_n, Γ_nを計算
    for (let i = 0; i < 6; i++) {
        const n = layerDefs[i].n;
        const S_n_local = Sn_values[i]; // 各層固有のポテンシャルを使用
        
        // SPEC.mdの確定式 (22*S_n + 3*b) / (7*S_n + b) を使用
        const pi_n_numerator = 22 * S_n_local + 3 * b; // 3(7S_n+b)+S_n を展開した形
        const pi_n_denominator = 7 * S_n_local + b; // 
        const pi_n = (pi_n_denominator !== 0) ? pi_n_numerator / pi_n_denominator : 3.14;
        new_pi_n.push(pi_n);

        const vol_n = V_n(n, pi_n);
        const rho_n = (n > 0) ? vol_n / (n * n) : 0; // SPEC.mdに従い V_n / n^2 を維持
        new_rho_n.push(rho_n);
        
        const Gamma_n = Math.log(1 + rho_n);
        new_Gamma_n.push(Gamma_n);
    }
    
    // 3. globalParamsを更新
    globalParams.pi_n_by_layer = new_pi_n;
    globalParams.rho_n_by_layer = new_rho_n;
    globalParams.Gamma_n_by_layer = new_Gamma_n;
    globalParams.pi_n_average = new_pi_n.reduce((s, v) => s + v, 0) / (new_pi_n.length || 1);
    globalParams.systemPotential_Sn_total = S_n_total;

    // 4. 季節と「内部」オーラの決定
    const l5Particles = layerDefs[5].particles;
    globalParams.season = determineSeason(l5Particles);
    
    if (l5Particles.length > 0) {
        const avgTemp = l5Particles.reduce((sum, p) => sum + p.temperature, 0) / l5Particles.length;
        const avgStress = l5Particles.reduce((sum, p) => sum + p.stress, 0) / l5Particles.length;

        globalParams.l5_avg_temp = avgTemp;
        globalParams.l5_avg_stress = avgStress;

        // このロジックは「内部オーラ」を決定する
        if (avgTemp >= 0.75 && avgStress <= 0.4) globalParams.internalAuraWeather = '喜';
        else if (avgTemp >= 0.5 && avgStress <= 0.3) globalParams.internalAuraWeather = '楽';
        else if (avgTemp < 0.5 && avgStress <= 0.2) globalParams.internalAuraWeather = '哀';
        else if (avgStress > 0.4) globalParams.internalAuraWeather = '怒';
        // 論理の穴を埋めるため、いずれにも当てはまらない場合のデフォルトを定義
        else {
             globalParams.internalAuraWeather = '楽'; // or some other default
        }

    } else {
        globalParams.internalAuraWeather = '楽';
    }
}


// ===== 中心核「光」の実装 =====
// このクラスはCoreParticleに置き換えられたため、現在は使用されていません。
class CoreLight {
    constructor(scene) {
        this.position = new THREE.Vector3(0, 0, 0);
        this.luminosity = 0.8;
        this.magneticMass = 2.0;
        
        const geometry = new THREE.SphereGeometry(0.3, 32, 32);
        const material = new THREE.MeshPhongMaterial({
            color: 0xFFFFAA,
            emissive: 0xFFFFAA,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.9
        });
        this.mesh = new THREE.Mesh(geometry, material);
        scene.add(this.mesh);
        
        this.light = new THREE.PointLight(0xFFFFAA, 2, 100);
        this.light.castShadow = true;
        scene.add(this.light);
    }
    
    update(allParticles, globalParams) { 
        // 創発重力 G (magneticMass) の計算: Ｇは全層のΓnの平均に比例
        if (globalParams.Gamma_n_by_layer && globalParams.Gamma_n_by_layer.length > 0) {
            const avgGamma = globalParams.Gamma_n_by_layer.reduce((s,v) => s+v, 0) / globalParams.Gamma_n_by_layer.length;
            const G_MIN = 2.0;
            const K_RESPONSE = 50.0; // Γnはρnよりずっと大きいので係数を調整
            this.magneticMass = G_MIN + K_RESPONSE * avgGamma;
            this.magneticMass = Math.min(20.0, this.magneticMass);
        } else {
            this.magneticMass = 2.0;
        }

        // Luminosityの更新 (全体の平均温度とストレスに依存)
        if (allParticles.length > 0) {
            const avgTemp = allParticles.reduce((sum, p) => sum + p.temperature, 0) / allParticles.length;
            const avgStress = allParticles.reduce((sum, p) => sum + p.stress, 0) / allParticles.length;
            this.luminosity = 0.8 + 0.4 * avgTemp - 0.3 * avgStress;
            this.luminosity = Math.max(0.3, Math.min(1.5, this.luminosity));
        } else {
            this.luminosity = 0.3;
        }
        
        this.mesh.material.emissiveIntensity = this.luminosity;
        this.light.intensity = this.luminosity * 2;
        
        const scale = 1.0 + 0.5 * this.luminosity;
        this.mesh.scale.setScalar(scale);
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
