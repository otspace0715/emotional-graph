// ===== 中心核「光」の実装 =====
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
        
        if (allParticles.length === 0) {
            this.luminosity = 0.0;
            this.magneticMass = 0.0;
            
            this.mesh.material.emissiveIntensity = this.luminosity;
            this.light.intensity = this.luminosity * 2;
            const scale = 1.5 + 0.5 * this.luminosity;
            this.mesh.scale.setScalar(scale);

            return;
        }

        // 1. 核粒子の平均状態の計算 (全19粒子の平均を使用)
        const totalCount = allParticles.length; 
        const avgTemp = allParticles.reduce((sum, p) => sum + p.temperature, 0) / totalCount;
        const avgStress = allParticles.reduce((sum, p) => sum + p.stress, 0) / totalCount;
        const avgMassEff = allParticles.reduce((sum, p) => sum + p.massEff, 0) / totalCount;

        // 2. 安定性変数 x_S, y_S の計算
        const x_S = 0.5 * avgTemp + 0.5 * avgMassEff; // 動的安定性 (TとMの平均)
        const y_S = avgStress;                       // 潜在的不安定性 (ストレス)

        // 3. 創発重力 G (magneticMass) の計算: G ∝ ρ_n (E.D.D.仕様)
        const { rho_n } = globalParams;

        // Gの計算: magneticMassは熱力学的密度ρ_nに強く比例する
        const G_MIN = 2.0; // 最小重力
        const K_RESPONSE = 500000.0; // 応答強度 (感度) - ρ_nが小さいため大きな係数が必要

        this.magneticMass = G_MIN + K_RESPONSE * rho_n;
        this.magneticMass = Math.min(20.0, this.magneticMass); // 上限を20に引き上げ

        // 4. Luminosityの更新 (全平均値で再計算)
        this.luminosity = 0.8 + 0.4 * avgTemp - 0.3 * avgStress;
        this.luminosity = Math.max(0.3, Math.min(1.5, this.luminosity));
        
        // pi_nはemotion_graph.jsで計算されるようになったため、ここではglobalParamsから参照するのみ
        globalParams.pi_n = globalParams.pi_n || 0;
        
        this.mesh.material.emissiveIntensity = this.luminosity;
        this.light.intensity = this.luminosity * 2;
        
        const scale = 1.5 + 0.5 * this.luminosity;
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
        
        for (let i = 0; i < 500; i++) {
            const r = 48 + Math.random() * 8;
            const theta = Math.random() * Math.PI * 2; // 方位角
            const phi = Math.acos(2 * Math.random() - 1); // 天頂角（一様分布）

            this.particles.push({
                radius: r,
                theta: theta,
                phi: phi,
                speed: 0.002 + Math.random() * 0.008 // 個別の旋回速度
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
            size: 0.5, // サイズを0.3から0.5に拡大
            vertexColors: true,
            transparent: true,
            opacity: 0.7, // 少し濃くする
            blending: THREE.AdditiveBlending
        });
        
        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);
    }
    
    update(auraParticles) {
        if (auraParticles.length === 0) {
            this.weatherType = '楽';
        } else {
            const avgTemp = auraParticles.reduce((sum, p) => sum + p.temperature, 0) / auraParticles.length;
            const avgStress = auraParticles.reduce((sum, p) => sum + p.stress, 0) / auraParticles.length;
            
            if (avgTemp >= 0.75 && avgStress <= 0.4) this.weatherType = '喜';
            else if (avgTemp >= 0.5 && avgStress <= 0.3) this.weatherType = '楽';
            else if (avgTemp < 0.5 && avgStress <= 0.2) this.weatherType = '哀';
            else if (avgStress > 0.4) this.weatherType = '怒';
        }
        
        const positions = this.particleSystem.geometry.attributes.position.array;
        const colors = this.particleSystem.geometry.attributes.color.array;

        // 嵐のときは速く、平常時はゆっくり旋回
        const speedMultiplier = (this.weatherType === '怒' ? 4.0 : 1.0);

        this.particles.forEach((p, i) => {
            // 1. 旋回運動
            p.theta += p.speed * speedMultiplier;

            // 2. 新しい座標を計算
            const i3 = i * 3;
            positions[i3] = p.radius * Math.sin(p.phi) * Math.cos(p.theta);
            positions[i3 + 1] = p.radius * Math.sin(p.phi) * Math.sin(p.theta);
            positions[i3 + 2] = p.radius * Math.cos(p.phi);

            // 3. 風によるランダムな揺らぎを追加
            const windStrength = (this.weatherType === '怒' ? 0.2 : 0.05);
            positions[i3] += (Math.random() - 0.5) * windStrength;
            positions[i3 + 1] += (Math.random() - 0.5) * windStrength;
            positions[i3 + 2] += (Math.random() - 0.5) * windStrength;

            // 4. オーラカラーを設定
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
