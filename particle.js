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
        this.stress += stressIncrease * (this.layer >= 4 ? 1.8 : 1.0);
        if (globalParams.globalExternalStress && this.layer >= 4) {
            this.stress += globalParams.globalExternalStress * (this.layer / 5) * dt;
        }
        const releaseRate = this.name === '楽' ? 0.15 : 0.1;
        const stressReleased = this.stress * releaseRate;
        this.stress *= (1 - releaseRate);

        const speedFactor = 0.02 * (this.velocity.length() - (this.type === 'drive' ? 0.8 : (this.type === 'flow' ? 0.9 : 1.05)));
        const envCooling = 0.15 * (this.temperature - T_env);
        const stressHeating = 0.3 * stressReleased;

        this.temperature += (speedFactor - envCooling + stressHeating) * dt;
        this.temperature = Math.max(0, Math.min(1.5, this.temperature));
        this.massEff = this.mBase * (1.0 + 0.5 * this.temperature + 0.3 * this.stress);

        // ----------------------------------------------------
        // --- 力の計算 (SPEC.md準拠)
        // ----------------------------------------------------
        
        // 1. 中心核引力 (創発重力) - 1/r 法則に変更
        const G_eff = 0.20 * globalParams.Gamma_n_by_layer[this.layer];
        const toCoreDir = core.position.clone().sub(this.position);
        const toCoreDist = toCoreDir.length();
        const centralForceMagnitude = (toCoreDist > 0.1) ? (G_eff * core.magneticMass * 1.2 / toCoreDist) : 0;
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

        const baseScale = 0.8 + 0.4 * this.massEff;
        const finalScale = baseScale * LAYER_SCALE_FACTORS[this.layer];
        this.mesh.scale.setScalar(finalScale);
    }
}
