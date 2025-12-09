// ===== 層ごとの次元nの定義 =====
const LAYER_DIMENSIONS = [2, 3, 4, 5, 6, 7];

// ===== 層ごとの粒子サイズ倍率定義 =====
const LAYER_SCALE_FACTORS = [
    0.3, // Layer 0: 核層
    0.5, // Layer 1: 身体層
    0.7, // Layer 2: 思考層
    0.8, // Layer 3: 文明層
    0.9, // Layer 4: 外部接合層
    1.0  // Layer 5: 外部雰囲気層
];

// ===== Particle クラス =====
class Particle {
    constructor(config, layerIndex, initialRadius, baseLayerRadius, scene) {
        this.name = config.name;
        this.type = config.type;
        this.layer = layerIndex;
        this.baseRadius = baseLayerRadius;
        
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        this.position = new THREE.Vector3(
            initialRadius * Math.sin(phi) * Math.cos(theta),
            initialRadius * Math.sin(phi) * Math.sin(theta),
            initialRadius * Math.cos(phi)
        );
        
        const radial = this.position.clone().normalize();
        const tangent = new THREE.Vector3(-radial.y, radial.x, 0).normalize();
        const baseSpeed = 0.5 + Math.random() * 0.5;
        this.velocity = tangent.multiplyScalar(baseSpeed);
        
        // 提案: 粒子タイプに応じて初期状態を分岐させ、多様性を復活させる
        // 同時に、秋スタートとなるように全体の温度を引き上げる
        // 「楽」を基準点とし、各粒子の特性を再定義
        // 楽（秋）のターゲット：平均 T ≈ 0.79
        const T_OFFSET = 0.27; 
        switch(this.name) {
            // L0: 核層 (Light) - 根源的意志
            case '悩': this.temperature = 0.48 + T_OFFSET; this.stress = 0.28; this.mBase = 1.1;  break; // 0.75
            case '怒': this.temperature = 0.60 + T_OFFSET; this.stress = 0.25; this.mBase = 0.9;  break; // 0.87
            case '好': this.temperature = 0.55 + T_OFFSET; this.stress = 0.15; this.mBase = 1.0;  break; // 0.82

            // L1: 身体層 (Gas) - 本能・生理的反応
            case '哀': this.temperature = 0.45 + T_OFFSET; this.stress = 0.26; this.mBase = 1.15; break; // 0.72
            case '激': this.temperature = 0.58 + T_OFFSET; this.stress = 0.22; this.mBase = 0.95; break; // 0.85
            case '楽': this.temperature = 0.52 + T_OFFSET; this.stress = 0.10; this.mBase = 1.0;  break; // 0.79 (基準点)

            // L2: 思考層 (Liquid) - 認知プロセス
            case '嫌': this.temperature = 0.47 + T_OFFSET; this.stress = 0.27; this.mBase = 1.1;  break; // 0.74
            case '活': this.temperature = 0.56 + T_OFFSET; this.stress = 0.18; this.mBase = 0.95; break; // 0.83
            case '融': this.temperature = 0.53 + T_OFFSET; this.stress = 0.12; this.mBase = 1.0;  break; // 0.80

            // L3: 文明層 (Solid) - 社会的規範・責任
            case '圧': this.temperature = 0.46 + T_OFFSET; this.stress = 0.30; this.mBase = 1.2;  break; // 0.73
            case '喜': this.temperature = 0.57 + T_OFFSET; this.stress = 0.16; this.mBase = 0.9;  break; // 0.84
            case '笑': this.temperature = 0.54 + T_OFFSET; this.stress = 0.14; this.mBase = 1.0;  break; // 0.81

            // L4: 外部接合層 (Liquid) - 他者・環境との境界調整
            case '静': this.temperature = 0.49 + T_OFFSET; this.stress = 0.20; this.mBase = 1.05; break; // 0.76
            case '変': this.temperature = 0.55 + T_OFFSET; this.stress = 0.17; this.mBase = 0.95; break; // 0.82
            case '調': this.temperature = 0.51 + T_OFFSET; this.stress = 0.11; this.mBase = 1.0;  break; // 0.78

            // L5: 外部雰囲気層 (Gas) - オーラ・場の拡散
            case '隔': this.temperature = 0.50 + T_OFFSET; this.stress = 0.24; this.mBase = 1.0;  break; // 0.77
            case '響': this.temperature = 0.54 + T_OFFSET; this.stress = 0.19; this.mBase = 0.9;  break; // 0.81
            case '観': this.temperature = 0.52 + T_OFFSET; this.stress = 0.13; this.mBase = 1.0;  break; // 0.79

            default: // フォールバック
                this.temperature = 0.77; this.stress = 0.15; this.mBase = 1.0;
        }
        // ランダムノイズを加えることで、初期の熱ゆらぎを導入（必須）
        this.temperature += (Math.random() * 0.1 - 0.05); 
        this.stress += (Math.random() * 0.05 - 0.025);

        // 3タイプごとの引力バイアスを設定
        switch(this.type) {
            case 'drive':
                this.attractionBias = 1.2;
                break;
            case 'freeze':
                this.attractionBias = 0.8;
                break;
            case 'flow':
                this.attractionBias = 1.0;
                break;
        }
        this.massEff = this.mBase;
        
        const geometry = new THREE.SphereGeometry(0.8, 16, 16);
        const material = new THREE.MeshPhongMaterial({
            color: config.color,
            emissive: config.color,
            emissiveIntensity: 0.3
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        scene.add(this.mesh);
        
        // Debug properties
        this.debug_centralForce = 0;
        this.debug_boundaryForce = 0;

        this.createLabel(config.name, scene);
    }
    
    createLabel(text, scene) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 64;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'Bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(text, 64, 40);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        this.label = new THREE.Sprite(material);
        this.label.scale.set(4, 2, 1);
        scene.add(this.label);
    }
    
    update(dt, particles, core, globalParams) {
        // globalParamsの存在をチェック
        if (!globalParams.Gamma_n_by_layer || globalParams.Gamma_n_by_layer.length === 0 ||
            !globalParams.avg_temp_by_layer || globalParams.avg_temp_by_layer.length === 0 ||
            !globalParams.avg_stress_by_layer || globalParams.avg_stress_by_layer.length === 0 ||
            !globalParams.pi_n_by_layer || globalParams.pi_n_by_layer.length === 0) {
            // console.warn("globalParams not yet initialized for particle update.");
            return;
        }

        const { T_env } = globalParams;
        const force = new THREE.Vector3();

        // ----------------------------------------------------
        // --- 内部状態の更新（温度、ストレス）
        // ----------------------------------------------------
        let stressIncrease = 0;
        const distToCenter = this.position.length();
        const boundaryDiff = Math.abs(distToCenter - this.baseRadius);
        if (boundaryDiff > 2) {
            stressIncrease += 0.008 * boundaryDiff; // ストレス増加の感度を少し下げる
        }
        
        // 提案: 時間変化率に基づいてストレス解放率を動的に調整
        // システムが加熱・興奮している(tempChangeRate > 0)ほど、ストレスは解放されやすくなる
        const tempChangeRate = globalParams.tempChangeRate || 0;
        // 提案: ストレス解放レートを緩和 (ユーザー提案)
        const releaseRate_base = 0.05; // Was 0.05
        const releaseRate = releaseRate_base * (1.0 + Math.max(0, tempChangeRate * 5.0));
        const stressReleased = this.stress * releaseRate;
        
        // --- 応力伝導の計算 (可逆的・入れ子構造) ---
        const K_Stress_Cond = 0.008; // 層間応力伝導係数

        let stressTransfer = 0;
        if (this.layer === 0) {
            // L0粒子: 光源との応力交換
            stressTransfer = K_Stress_Cond * (core.stress - this.stress);
        } else {
            // L1-L5粒子: 内側層との応力交換
            const stress_avg_inner = globalParams.avg_stress_by_layer[this.layer - 1];
            stressTransfer = K_Stress_Cond * (stress_avg_inner - this.stress);
        }
        if (this.layer === 5) {
            // L5粒子: 外部環境との応力交換も追加
            const K_Stress_Env = 0.005;
            stressTransfer += K_Stress_Env * (globalParams.globalExternalStress - this.stress);
        }
        // 提案: 過剰な減衰を防ぐため stressDecay を削除 (ユーザー提案)
        this.stress += (stressIncrease + stressTransfer - stressReleased) * dt;
        
        // --- 熱伝導の計算 (可逆的・入れ子構造) ---
        const K_Cond = 0.08; // 層間熱伝導係数
        let heatTransfer = 0;

        // 提案: 光源の動的温度を熱交換の基準として使用 (ユーザー提案)
        const T_Source = globalParams.T_Source || globalParams.T_env;

        if (this.layer === 0) {
            // L0粒子: 光源との熱交換
            heatTransfer = K_Cond * (T_Source - this.temperature);
        } else {
            // L1-L5粒子: 内側層との熱交換
            const T_avg_inner = globalParams.avg_temp_by_layer[this.layer - 1];
            heatTransfer = K_Cond * (T_avg_inner - this.temperature);
        }
        
        // 提案: 運動エネルギーからの加熱（Speed Factor）の抑制
        const speedFactor = Math.max(0, 0.01 * (this.velocity.length() - (this.type === 'drive' ? 0.8 : (this.type === 'flow' ? 0.9 : 1.05))));
        // 提案: ストレスからの熱変換効率を調整
        const K_Stress_Heat_Conversion = 0.08; // 熱源を強化
        const stressHeating = this.stress * K_Stress_Heat_Conversion;
        
        // 提案: 輻射冷却（熱損失）
        const K_Radiation = 0.06; // 冷却係数を再調整
        const radiativeCooling = -K_Radiation * Math.pow(this.temperature, 2);

        // 温度を更新
        this.temperature += (speedFactor + stressHeating + radiativeCooling + heatTransfer) * dt;
        this.temperature = Math.max(0.1, this.temperature); // 物理的な最低温度を保証

        // --- 提案: 時間変化率に基づいて質量を動的に調整 ---
        // システムが冷却・沈静化している(tempChangeRate < 0)ほど、慣性が増して重くなる
        const massModulator = 1.0 + Math.max(0, -tempChangeRate * 10.0);
        this.massEff = this.mBase * (1.0 + 0.1 * this.stress) * massModulator;

        // ----------------------------------------------------
        // --- 力の計算 (SPEC.md準拠)
        // ----------------------------------------------------
        
        // 1. 中心核引力 (創発重力) - 1/r 法則に変更
        const G_eff = 0.20 * globalParams.Gamma_n_by_layer[this.layer];
        const toCoreDir = core.position.clone().sub(this.position);
        const toCoreDist = toCoreDir.length();
        const centralForceMagnitude = (toCoreDist > 0.1) ? (G_eff * core.massEff * 1.2 / toCoreDist) : 0;
        const centralForce = toCoreDir.normalize().multiplyScalar(centralForceMagnitude);
        force.add(centralForce);
        this.debug_centralForce = centralForce.length(); // Store for UI

        // 2. 粒子間相互作用 (斥力・引力)
        particles.forEach(other => {
            if (other === this) return;
            const diff = other.position.clone().sub(this.position);
            const dist = diff.length();
            if (dist < 0.1) return;
            const dir = diff.normalize();
            if (dist < 3) {
                force.add(dir.clone().multiplyScalar(-20 / Math.pow(dist, 3)));
            }
            if (Math.abs(other.layer - this.layer) === 1 && dist < 8) {
                force.add(dir.clone().multiplyScalar(0.3 * this.attractionBias / (dist * dist)));
            }
        });

        // 3. 境界力 (層からの逸脱を防ぐ) - バネモデル + 中心引力補正
        const radialDir = this.position.clone().normalize();
        const n_p = LAYER_DIMENSIONS[this.layer];
        const boundaryForceFactor = 5.0 / n_p;
        const displacement = this.baseRadius - distToCenter; // `distToCenter` is already calculated
        
        let boundaryForceScalar = boundaryForceFactor * displacement;

        // 中心引力の半分を、外側への引力(displacement < 0 の場合)に加える
        if (displacement < 0) {
            boundaryForceScalar -= 0.5 * centralForceMagnitude;
        }

        const boundaryForceVec = radialDir.multiplyScalar(boundaryForceScalar);
        force.add(boundaryForceVec);
        this.debug_boundaryForce = boundaryForceVec.length(); // Store for UI

        // 4. 次元曲率力 (F_πn) - SPEC.md Section 5
        // 脳波モデルに基づく変調項を導入
        const S_Total = globalParams.systemPotential_Sn_total || 0;
        const S_Ref = 0.5;
        // 安定ポテンシャル S_Ref に近いほど、次元曲率力による抵抗 α が強くなる
        // S_TotalがS_Refより低い場合（休息状態）に抵抗が強くなるように調整
        const S_Modulator = 1.0 + Math.max(0, 3.0 * (S_Ref - S_Total)); // 係数を3.0に設定

        const π_local = globalParams.pi_n_by_layer[this.layer];
        const axis = new THREE.Vector3(0, 0, 1);
        const omega_n = 2.8 * Math.exp(-0.65 * this.layer);
        const v_ideal = new THREE.Vector3().crossVectors(axis, this.position).normalize()
                          .multiplyScalar(omega_n * this.position.length());
        
        // 変調を適用
        const alpha = (1.3 / (1 + 0.7 * this.layer)) * S_Modulator;

        const F_pi_n = v_ideal.clone().sub(this.velocity)
                        .multiplyScalar(-alpha * π_local);
        force.add(F_pi_n);

        // 5. 量子ゆらぎ (Jitter) - SPEC.md Section 6
        const gamma_n_local = globalParams.Gamma_n_by_layer[this.layer];
        // ゼロ除算を避ける
        const jitterStrength = (gamma_n_local > 0.001) ? 0.055 / gamma_n_local : 0.055 / 0.001;
        force.add(new THREE.Vector3(
            (Math.random() - 0.5) * jitterStrength,
            (Math.random() - 0.5) * jitterStrength,
            (Math.random() - 0.5) * jitterStrength
        ));

        // 6. 運動学的減衰 (F_Damp) - S_7減少問題の最終解決
        const K_Damp = 0.2; // 減衰係数 (調整可能)
        const F_Damp = this.velocity.clone().multiplyScalar(-K_Damp);
        force.add(F_Damp);

        // ----------------------------------------------------
        // --- 運動の更新
        // ----------------------------------------------------
        const accel = force.divideScalar(this.massEff);
        this.velocity.add(accel.multiplyScalar(dt));
        
        // 6. 速度上限 (Velocity Clamp) - SPEC.md Section 6
        this.velocity.clampLength(0, 1.35 * Math.sqrt(this.temperature + 0.05));
        
        this.position.add(this.velocity.clone().multiplyScalar(dt));
        
        // ----------------------------------------------------
        // --- 可視化の更新
        // ----------------------------------------------------
        this.mesh.position.copy(this.position);
        this.label.position.copy(this.position).add(new THREE.Vector3(0, 2, 0));
        
        // globalParams.internalAuraWeatherに基づいて色を決定
        const auraColor = new THREE.Color();
        switch (globalParams.internalAuraWeather) {
            case '喜':
                auraColor.setRGB(1, 0.9, 0.5);
                break;
            case '楽':
                auraColor.setRGB(0.7, 0.9, 1);
                break;
            case '哀':
                auraColor.setRGB(0.5, 0.6, 0.9);
                break;
            case '怒':
                auraColor.setRGB(0.9, 0.3, 0.3);
                break;
            default:
                auraColor.setRGB(0.7, 0.9, 1); // デフォルトは'楽'
        }
        
        this.mesh.material.emissive.copy(auraColor);
        this.mesh.material.emissiveIntensity = 0.2 + 0.8 * this.temperature; // 温度で明度を調整

        const baseScale = 0.4 + 0.2 * this.massEff; // 係数を調整してサイズを縮小
        const finalScale = baseScale * LAYER_SCALE_FACTORS[this.layer];
        this.mesh.scale.setScalar(finalScale);
    }
}

// ===== コア粒子「光源」の実装 =====
class CoreParticle extends Particle {
    constructor(scene) {
        const config = { name: '光源', type: 'core', color: 0xFFFFAA };
        // CoreParticleは特定の層に属さないが、便宜上 layer 0 として扱う
        // 半径は0で、位置は常に原点
        super(config, 0, 0, 0, scene);

        this.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.temperature = 1.2; // 常に高温
        this.stress = 0.1; // 光源の基準応力 σ_Source (低い定数)
        this.massEff = 2.0; // 初期値。動的に更新される

        // メッシュの調整
        this.mesh.material.emissiveIntensity = 1.0;
        this.mesh.material.opacity = 0.9;
        // this.mesh.scale.setScalar(1.5); // 動的に変更するため、固定値設定を削除

        // ポイントライトを追加して光源としての役割を強調
        this.light = new THREE.PointLight(0xFFFFAA, 2, 100);
        this.light.castShadow = true;
        this.mesh.add(this.light); // メッシュの子として追加

        // ラベルは不要なので削除
        scene.remove(this.label);
        this.label = null;
    }

    update(dt, allParticles, core, globalParams) {
        // 1. 位置は常に原点に固定
        this.mesh.position.copy(this.position);

        // 質量(massEff)と温度(temperature)の計算は、emotion_graph.jsのメインループに移行された。
        // CoreParticleは、メインループによって設定された値を保持し、可視化を更新する役割のみを担う。
        // (輝度とライト強度の更新はメインループに移動済み)
    }
}
