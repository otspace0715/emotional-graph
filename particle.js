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
    constructor(config, layerIndex, layerRadius, scene) {
        this.name = config.name;
        this.type = config.type;
        this.layer = layerIndex;
        this.baseRadius = layerRadius;
        
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        this.position = new THREE.Vector3(
            layerRadius * Math.sin(phi) * Math.cos(theta),
            layerRadius * Math.sin(phi) * Math.sin(theta),
            layerRadius * Math.cos(phi)
        );
        
        const radial = this.position.clone().normalize();
        const tangent = new THREE.Vector3(-radial.y, radial.x, 0).normalize();
        const baseSpeed = 0.5 + Math.random() * 0.5;
        this.velocity = tangent.multiplyScalar(baseSpeed);
        
        this.temperature = 0.5;
        this.stress = 0.0;
        this.mBase = 1.0;
        this.massEff = 1.0;
        
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
        const { T_env, coreMagneticMass } = globalParams;
        
        let stressIncrease = 0;
        const distToCenter = this.position.length();
        const boundaryDiff = Math.abs(distToCenter - this.baseRadius);
        if (boundaryDiff > 2) {
            stressIncrease += 0.01 * boundaryDiff;
        }
        
        const layerSensitivity = this.layer >= 4 ? 1.8 : 1.0;
        this.stress += stressIncrease * layerSensitivity;
        
        // Add stress from external UI controls
        if (globalParams.globalExternalStress && this.layer >= 4) {
            this.stress += globalParams.globalExternalStress * (this.layer / 5) * dt;
        }
        
        const releaseRate = this.name === '楽' ? 0.15 : 0.1;
        const stressReleased = this.stress * releaseRate;
        this.stress *= (1 - releaseRate);
        
        // New physics: Heat from motion based on particle type
        let equilibriumSpeed = 1.05; // Freeze particles need to move faster to generate heat
        if (this.type === 'drive') {
            equilibriumSpeed = 0.8; 
        } else if (this.type === 'flow') {
            equilibriumSpeed = 0.9;
        }
        // const speedFactor = 0.1 * (this.velocity.length() - equilibriumSpeed); // (修正前)
        const speedFactor = 0.02 * (this.velocity.length() - equilibriumSpeed); // 熱生成係数を 0.1 から 0.05 に下げて温度の過剰上昇を抑制

        // New physics: Heat retention based on particle type
        let coolingCoeff = 0.15; // 冷却係数を0.15に均一化
        const envCooling = coolingCoeff * (this.temperature - T_env);
        const stressHeating = 0.3 * stressReleased;
        
        let heatTransfer = 0;
        particles.forEach(other => {
            if (other !== this && Math.abs(other.layer - this.layer) === 1) {
                const dist = this.position.distanceTo(other.position);
                if (dist < 5) {
                    heatTransfer += 0.02 * (other.temperature - this.temperature) / (dist + 1);
                }
            }
        });
        
        this.temperature += (speedFactor - envCooling + stressHeating + heatTransfer) * dt;
        this.temperature = Math.max(0, Math.min(1.5, this.temperature));
        
        this.massEff = this.mBase * (1.0 + 0.5 * this.temperature + 0.3 * this.stress);
        this.debug_centralForce = 0;
        this.debug_boundaryForce = 0;
        
        const force = new THREE.Vector3();
        
        const toCoreDir = core.position.clone().sub(this.position);
        const toCoreDistSq = toCoreDir.lengthSq() + 1;
        const centralForce = toCoreDir.normalize().multiplyScalar(
            coreMagneticMass * 5.0 / toCoreDistSq // 係数を0.5から5.0に増やして引力を強化
        );
        force.add(centralForce);
        this.debug_centralForce = centralForce.length();
        
        particles.forEach(other => {
            if (other === this) return;
            
            const diff = other.position.clone().sub(this.position);
            const dist = diff.length();
            if (dist < 0.1) return;
            
            const dir = diff.normalize();
            
            if (dist < 3) {
                const repulsion = 20 / Math.pow(dist, 3);
                force.add(dir.clone().multiplyScalar(-repulsion));
            }
            
            if (Math.abs(other.layer - this.layer) === 1 && dist < 8) {
                const attraction = 0.3 * this.attractionBias / (dist * dist);
                force.add(dir.clone().multiplyScalar(attraction));
            }
        });
        
        const radialDir = this.position.clone().normalize();
        // --- (ユーザー指定により修正) ---
        // 各層に固定された次元 n_p を使用して斥力を計算
        const n_p = LAYER_DIMENSIONS[this.layer];
        // nが大きいほど境界力が弱まるように係数を調整。基本強度を10.0に設定
        const boundaryForceFactor = 10.0 / n_p;
        const boundaryForceScalar = boundaryForceFactor * Math.max(0, 2 - boundaryDiff) * (distToCenter < this.baseRadius ? 1 : -1);
        const boundaryForceVec = radialDir.multiplyScalar(boundaryForceScalar);
        force.add(boundaryForceVec);
        this.debug_boundaryForce = boundaryForceVec.length();

        // --- 次元曲率力 (Dimensional Curvature Force) ---
        // 博士の提案に基づき、粒子を安定した左回転軌道に引き戻す力を導入。
        // 力の強さは、系の安定定数 π_n に比例する。
        const { pi_n } = globalParams;
        if (pi_n > 0) {
            const rotationAxis = new THREE.Vector3(0, 0, 1); // Z軸を中心とした左回転
            const targetDir = rotationAxis.clone().cross(this.position).normalize();
            
            // 目標とする軌道速度を定義 (基本速度1.5)
            const targetOrbitalSpeed = 1.5;
            const targetVelocity = targetDir.multiplyScalar(targetOrbitalSpeed);

            // 現在の速度と目標速度の差から、修正ベクトルを計算
            const velocityDifference = targetVelocity.sub(this.velocity);

            // 修正力は速度差とπ_nに比例する
            const curvatureForceCoefficient = 0.5; // 秩序を強制する力の係数
            const curvatureForce = velocityDifference.multiplyScalar(pi_n * curvatureForceCoefficient);
            
            force.add(curvatureForce);
        }
        
        const jitterStrength = 0.5 * this.stress;
        force.add(new THREE.Vector3(
            (Math.random() - 0.5) * jitterStrength,
            (Math.random() - 0.5) * jitterStrength,
            (Math.random() - 0.5) * jitterStrength
        ));
        
        const accel = force.divideScalar(this.massEff);
        this.velocity.add(accel.multiplyScalar(dt));
        
        const maxSpeed = 2.0 + 0.5 * this.temperature;
        if (this.velocity.length() > maxSpeed) {
            this.velocity.normalize().multiplyScalar(maxSpeed);
        }
        
        this.position.add(this.velocity.clone().multiplyScalar(dt));
        
        this.mesh.position.copy(this.position);
        this.label.position.copy(this.position);
        this.label.position.y += 2;
        
        const heatColor = new THREE.Color().setHSL(
            this.temperature > T_env ? 0.05 : 0.6,
            0.8,
            0.4 + 0.3 * this.temperature
        );
        this.mesh.material.emissive.copy(heatColor);
        this.mesh.material.emissiveIntensity = 0.2 + 0.5 * this.temperature;
        
        // --- (修正前) 層ごとのサイズ変更 ---
        // let scale = 0.8 + 0.4 * this.massEff;
        // if (this.layer === 0) {
        //     // scale *= 0.6; // 核層の粒子を60%のサイズにする (修正前)
        //     scale *= 0.3; // 核層の粒子をさらに小さくする (30%に)
        // }
        // this.mesh.scale.setScalar(scale);
        // --- (修正後) 全層のサイズを倍率で変更 ---
        const baseScale = 0.8 + 0.4 * this.massEff;
        const finalScale = baseScale * LAYER_SCALE_FACTORS[this.layer];
        this.mesh.scale.setScalar(finalScale);
    }
}
