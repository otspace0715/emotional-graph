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
        
        this.temperature = 0.5;
        this.stress = 0.0;
        this.mBase = 1.0;
        this.massEff = 1.0;
        
        // Debug properties
        this.debug_centralForce = 0;
        this.debug_boundaryForce = 0;

        // 層による温度補正（外部層ほど高温に初期化）
        const layerTempBoost = 0; // layerIndex >= 4 ? 0.2 : 0;
        
        switch(this.type) {
            case 'drive':
                this.temperature = 0.7 + layerTempBoost; // Reverted from 0.85
                this.attractionBias = 1.2;
                break;
            case 'freeze':
                this.temperature = 0.4 + layerTempBoost;
                this.attractionBias = 0.8;
                break;
            case 'flow':
                this.temperature = 0.6 + layerTempBoost; // Reverted from 0.75
                this.attractionBias = 1.0;
                break;
        }
        
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
            stressIncrease += 0.01 * boundaryDiff;
        }
        
        const releaseRate = this.name === '楽' ? 0.15 : 0.1;
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
        this.stress += (stressIncrease + stressTransfer - stressReleased) * dt;
        
        // --- 熱伝導の計算 (可逆的・入れ子構造) ---
        const K_Cond = 0.08; // 層間熱伝導係数
        let heatTransfer = 0;

        if (this.layer === 0) {
            // L0粒子: 光源との熱交換
            const T_Source = core.temperature;
            heatTransfer = K_Cond * (T_Source - this.temperature);
        } else {
            // L1-L5粒子: 内側層との熱交換
            const T_avg_inner = globalParams.avg_temp_by_layer[this.layer - 1];
            heatTransfer = K_Cond * (T_avg_inner - this.temperature);
        }

        if (this.layer === 5) {
            // L5粒子: 外部環境との熱交換も追加
            const K_Env = 0.003;
            heatTransfer += K_Env * (T_env - this.temperature);
        }
        
        const speedFactor = 0.02 * (this.velocity.length() - (this.type === 'drive' ? 0.8 : (this.type === 'flow' ? 0.9 : 1.05)));
        const stressHeating = 0.3 * stressReleased;

        this.temperature += (speedFactor + heatTransfer + stressHeating) * dt;
        this.temperature = Math.max(0, Math.min(1.5, this.temperature));
        this.massEff = this.mBase * (1.0 + 0.5 * this.temperature + 0.3 * this.stress);

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
        const π_local = globalParams.pi_n_by_layer[this.layer];
        const axis = new THREE.Vector3(0, 0, 1);
        const omega_n = 2.8 * Math.exp(-0.65 * this.layer);
        const v_ideal = new THREE.Vector3().crossVectors(axis, this.position).normalize()
                          .multiplyScalar(omega_n * this.position.length());
        const alpha = 1.3 / (1 + 0.7 * this.layer);
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
        this.position.set(0, 0, 0);
        this.mesh.position.copy(this.position);

        // 2. 自身の状態更新
        // 2a. 質量(massEff)を動的に計算 (旧CoreLightのロジックを移植)
        if (globalParams.Gamma_n_by_layer && globalParams.Gamma_n_by_layer.length > 0) {
            // G-Forceの源泉を「全層平均」から「核層(L0)の状態」に修正 (哲学的一貫性のため)
            const gamma_L0 = globalParams.Gamma_n_by_layer[0];

            const G_MIN = 2.0;
            const K_RESPONSE = 50.0;
            this.massEff = G_MIN + K_RESPONSE * gamma_L0;
            this.massEff = Math.min(20.0, this.massEff); // 上限を設定
        }

        // 2b. 温度と輝度を更新 (SPEC.md準拠の自己回帰ロジック)
        const T_Base = 1.0;      // 基準温度
        const K_S = 0.8;         // ポテンシャルへの応答係数
        const S_Ref = 0.5;       // 安定基準ポテンシャル
        const S_Total = globalParams.systemPotential_Sn_total || 0;

        this.temperature = T_Base + K_S * (S_Total - S_Ref);
        this.temperature = Math.max(0.2, Math.min(2.5, this.temperature)); // 温度が極端にならないようにクランプ

        this.mesh.material.emissiveIntensity = 0.8 + this.temperature * 0.2;
        this.light.intensity = this.temperature * 2;

        // 4. スケールを動的に更新 (核層の粒子と同じロジック)
        const baseScale = 0.4 + 0.2 * this.massEff;
        const finalScale = baseScale * LAYER_SCALE_FACTORS[this.layer]; // this.layerは0
        this.mesh.scale.setScalar(finalScale);

        // 3. 熱源としての機能は、L0粒子がCoreParticleの温度を参照する形で実装されたため、ここでの一括処理は不要。
    }
}
