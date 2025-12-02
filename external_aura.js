// external_aura.js

class ExternalAuraCloud {
    constructor(scene) {
        this.scene = scene;
        this.particleSystem = null;
        this.particles = [];
        this.createCloud();
    }

    createCloud() {
        const particleCount = 1500; // 雲の密度を上げる
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        const baseColor = new THREE.Color(0xffffff);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            
            // 外部に球状のシェルとしてパーティクルを配置
            const radius = 55 + Math.random() * 35; // 半径55から90の範囲
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);

            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;

            this.particles.push({
                initialPos: new THREE.Vector3(x, y, z),
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.1,
                    (Math.random() - 0.5) * 0.1,
                    (Math.random() - 0.5) * 0.1
                )
            });

            colors[i3] = baseColor.r;
            colors[i3 + 1] = baseColor.g;
            colors[i3 + 2] = baseColor.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 2.5, // パーティクルを少し小さくして、より繊細に見せる
            vertexColors: true,
            transparent: true,
            opacity: 0.1, // 少しだけ不透明度を上げる
            blending: THREE.AdditiveBlending, 
            depthWrite: false
        });

        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);
    }

    update(globalParams) {
        if (!this.particleSystem || !this.particleSystem.visible) return;

        // Determine display weather from display params to make it persistent
        let weatherType;
        if (globalParams.display_GlobalStress > 1.0) weatherType = '怒';
        else if (globalParams.display_T_env >= 0.7 && globalParams.display_GlobalStress <= 0.6) weatherType = '喜';
        else if (globalParams.display_T_env <= 0.45 && globalParams.display_GlobalStress <= 0.3) weatherType = '哀';
        else weatherType = '楽';

        const color = new THREE.Color();

        // 外部オーラ天気に従って色を決定
        switch (weatherType) {
            case '喜': color.set(0xFFD700); break; // Gold
            case '楽': color.set(0x87CEEB); break; // SkyBlue
            case '哀': color.set(0x9370DB); break; // MediumPurple
            case '怒': color.set(0xFF6347); break; // Tomato
            default: color.set(0x87CEEB);
        }

        const positions = this.particleSystem.geometry.attributes.position.array;
        const colors = this.particleSystem.geometry.attributes.color.array;

        this.particles.forEach((p, i) => {
            const i3 = i * 3;

            // ゆっくりと動かす
            positions[i3] += p.velocity.x * 0.1;
            positions[i3+1] += p.velocity.y * 0.1;
            positions[i3+2] += p.velocity.z * 0.1;

            const currentRadiusSq = positions[i3]**2 + positions[i3+1]**2 + positions[i3+2]**2;
            if (currentRadiusSq > 90*90 || currentRadiusSq < 55*55) {
                 p.velocity.x *= -1;
                 p.velocity.y *= -1;
                 p.velocity.z *= -1;
            }

            // 色を更新
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        });

        this.particleSystem.geometry.attributes.position.needsUpdate = true;
        this.particleSystem.geometry.attributes.color.needsUpdate = true;
        
        // 全体をゆっくりと回転させる
        this.particleSystem.rotation.y += 0.0002;
    }

    setVisible(visible) {
        if (this.particleSystem) {
            this.particleSystem.visible = visible;
        }
    }
}
