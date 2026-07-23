// 웹 오디오 사운드 합성 엔진
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playSound(type) {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'attack') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'hit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'ult') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    // 플레이어 및 게임 상태 데이터
    const state = {
        gold: 0,
        level: 1,
        exp: 0,
        maxExp: 100,
        hp: 100,
        maxHp: 100,
        mp: 50,
        maxMp: 50,
        atk: 25,
        def: 5,
        crit: 10,
        speed: 1.0,
        stage: 1,
        questKills: 0,
        targetKills: 5,
        bossActive: false
    };

    // 1. Scene & Renderer 설정
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040814);
    scene.fog = new THREE.FogExp2(0x040814, 0.025);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 2. 조명
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00dfff, 1.2);
    dirLight.position.set(15, 25, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // 3. 바닥 및 그리드
    const grid = new THREE.GridHelper(100, 50, 0x00dfff, 0x112233);
    grid.position.y = 0.01;
    scene.add(grid);

    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x07111e, roughness: 0.8, metalness: 0.2 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 4. 플레이어 캐릭터 생성
    const playerGroup = new THREE.Group();
    
    // 몸체
    const pBodyGeo = new THREE.CylinderGeometry(0.5, 0.6, 1.6, 16);
    const pBodyMat = new THREE.MeshStandardMaterial({ color: 0x00dfff, roughness: 0.3 });
    const pBody = new THREE.Mesh(pBodyGeo, pBodyMat);
    pBody.position.y = 0.8;
    pBody.castShadow = true;
    playerGroup.add(pBody);

    // 무기 (검)
    const swordGeo = new THREE.BoxGeometry(0.1, 1.2, 0.2);
    const swordMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.1 });
    const sword = new THREE.Mesh(swordGeo, swordMat);
    sword.position.set(0.6, 0.8, 0.4);
    sword.rotation.x = Math.PI / 4;
    playerGroup.add(sword);

    scene.add(playerGroup);

    // 5. 파티클 이펙트
    const particles = [];
    function createHitEffect(pos, color = 0x00dfff) {
        for (let i = 0; i < 8; i++) {
            const pGeo = new THREE.SphereGeometry(0.1, 8, 8);
            const pMat = new THREE.MeshBasicMaterial({ color: color });
            const p = new THREE.Mesh(pGeo, pMat);
            p.position.copy(pos);
            p.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.3,
                Math.random() * 0.3,
                (Math.random() - 0.5) * 0.3
            );
            p.life = 1.0;
            scene.add(p);
            particles.push(p);
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.position.add(p.velocity);
            p.life -= 0.05;
            p.scale.multiplyScalar(0.92);
            if (p.life <= 0) {
                scene.remove(p);
                particles.splice(i, 1);
            }
        }
    }

    // 6. 몬스터 및 보스 AI 클래스
    const monsters = [];

    class Monster {
        constructor(isBoss = false) {
            this.isBoss = isBoss;
            this.hp = isBoss ? 500 : 50;
            this.maxHp = this.hp;
            this.atk = isBoss ? 20 : 8;

            const size = isBoss ? 2.5 : 1.0;
            const geo = new THREE.BoxGeometry(size, size, size);
            const mat = new THREE.MeshStandardMaterial({ color: isBoss ? 0xff0055 : 0xeb4d4b });
            this.mesh = new THREE.Mesh(geo, mat);
            this.mesh.castShadow = true;

            const angle = Math.random() * Math.PI * 2;
            const dist = isBoss ? 12 : 8 + Math.random() * 6;
            this.mesh.position.set(
                playerGroup.position.x + Math.cos(angle) * dist,
                size / 2,
                playerGroup.position.z + Math.sin(angle) * dist
            );

            scene.add(this.mesh);
        }

        update() {
            const dir = playerGroup.position.clone().sub(this.mesh.position).normalize();
            const speed = this.isBoss ? 0.02 : 0.035;
            this.mesh.position.x += dir.x * speed;
            this.mesh.position.z += dir.z * speed;
            this.mesh.lookAt(playerGroup.position);

            if (this.mesh.position.distanceTo(playerGroup.position) < (this.isBoss ? 2.2 : 1.2)) {
                state.hp -= this.atk * 0.05;
                if (state.hp < 0) state.hp = 0;
                updateUI();
            }
        }

        destroy() {
            scene.remove(this.mesh);
        }
    }

    function spawnMonsters() {
        if (state.stage % 5 === 0 && !state.bossActive) {
            state.bossActive = true;
            monsters.push(new Monster(true));
            document.getElementById('boss-hp-container').style.display = 'flex';
            showToast(`⚠️ BOSS APPEARED!`);
        } else if (!state.bossActive) {
            while (monsters.length < 4) {
                monsters.push(new Monster(false));
            }
        }
    }

    // 7. UI 업데이트 및 토스트 메시지
    function showToast(msg) {
        const toast = document.getElementById('toast-msg');
        toast.innerText = msg;
        toast.style.opacity = 1;
        setTimeout(() => toast.style.opacity = 0, 1800);
    }

    function updateUI() {
        document.getElementById('ui-level').innerText = `Lv.${state.level}`;
        document.getElementById('ui-gold').innerText = state.gold;
        document.getElementById('ui-stage').innerText = state.stage;
        document.getElementById('ui-hp-fill').style.width = `${(state.hp / state.maxHp) * 100}%`;
        document.getElementById('ui-mp-fill').style.width = `${(state.mp / state.maxMp) * 100}%`;
        document.getElementById('ui-exp-fill').style.width = `${(state.exp / state.maxExp) * 100}%`;
        
        document.getElementById('stat-atk').innerText = state.atk;
        document.getElementById('stat-def').innerText = state.def;

        if (state.bossActive && monsters[0] && monsters[0].isBoss) {
            const boss = monsters[0];
            document.getElementById('boss-hp-fill').style.width = `${(boss.hp / boss.maxHp) * 100}%`;
        } else {
            document.getElementById('boss-hp-container').style.display = 'none';
        }
    }

    function addExp(amount) {
        state.exp += amount;
        if (state.exp >= state.maxExp) {
            state.exp -= state.maxExp;
            state.level++;
            state.maxExp += 40;
            state.atk += 6;
            state.maxHp += 25;
            state.hp = state.maxHp;
            showToast(`🎉 LEVEL UP! Lv.${state.level}`);
        }
        updateUI();
    }

    // 8. 조이스틱 모바일 컨트롤
    let moveVector = { x: 0, z: 0 };
    const joyArea = document.getElementById('joystick-area');
    const joyHandle = document.getElementById('joystick-handle');
    let isDragging = false, startX = 0, startY = 0;

    function onTouchStart(e) {
        isDragging = true;
        const t = e.touches ? e.touches[0] : e;
        startX = t.clientX; startY = t.clientY;
    }

    function onTouchMove(e) {
        if (!isDragging) return;
        const t = e.touches ? e.touches[0] : e;
        let dx = t.clientX - startX, dy = t.clientY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy), maxR = 30;
        if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
        joyHandle.style.transform = `translate(${dx}px, ${dy}px)`;
        moveVector.x = dx / maxR; moveVector.z = dy / maxR;
    }

    function onTouchEnd() {
        isDragging = false;
        joyHandle.style.transform = `translate(0,0)`;
        moveVector.x = 0; moveVector.z = 0;
    }

    joyArea.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
    joyArea.addEventListener('mousedown', onTouchStart);
    window.addEventListener('mousemove', onTouchMove);
    window.addEventListener('mouseup', onTouchEnd);

    // 9. 전투 및 스킬 버튼
    document.getElementById('btn-attack').onclick = () => {
        playSound('attack');
        sword.rotation.x = -Math.PI / 2;
        setTimeout(() => sword.rotation.x = Math.PI / 4, 150);

        monsters.forEach((m, idx) => {
            if (playerGroup.position.distanceTo(m.mesh.position) < (m.isBoss ? 3.5 : 2.5)) {
                m.hp -= state.atk;
                createHitEffect(m.mesh.position, 0xff0055);
                playSound('hit');

                if (m.hp <= 0) {
                    m.destroy();
                    monsters.splice(idx, 1);
                    state.gold += m.isBoss ? 200 : 25;
                    addExp(m.isBoss ? 150 : 30);

                    if (m.isBoss) {
                        state.bossActive = false;
                        state.stage++;
                        showToast(`🏆 STAGE CLEAR!`);
                    } else {
                        state.questKills++;
                        if (state.questKills >= state.targetKills) {
                            state.stage++;
                            state.questKills = 0;
                            showToast(`STAGE ${state.stage} 진입!`);
                        }
                    }
                    updateUI();
                }
            }
        });
    };

    document.getElementById('btn-dodge').onclick = () => {
        playerGroup.position.x += moveVector.x * 3.5;
        playerGroup.position.z += moveVector.z * 3.5;
        createHitEffect(playerGroup.position, 0xffffff);
    };

    document.getElementById('btn-skill').onclick = () => {
        if (state.mp >= 15) {
            state.mp -= 15;
            playerGroup.position.x += moveVector.x * 6.0;
            playerGroup.position.z += moveVector.z * 6.0;
            playSound('ult');
            createHitEffect(playerGroup.position, 0x00dfff);
            updateUI();
        }
    };

    document.getElementById('btn-ult').onclick = () => {
        if (state.mp >= 40) {
            state.mp -= 40;
            playSound('ult');
            monsters.forEach(m => {
                m.hp -= state.atk * 2.5;
                createHitEffect(m.mesh.position, 0xff00ff);
            });
            showToast(`💥 ULTIMATE SKILL!`);
            updateUI();
        }
    };

    // 모달 이벤트
    const toggleModal = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';
    document.getElementById('btn-open-stat').onclick = () => toggleModal('modal-stat', true);
    document.getElementById('btn-close-stat').onclick = () => toggleModal('modal-stat', false);
    document.getElementById('btn-open-inv').onclick = () => toggleModal('modal-inv', true);
    document.getElementById('btn-close-inv').onclick = () => toggleModal('modal-inv', false);
    document.getElementById('btn-open-shop').onclick = () => toggleModal('modal-shop', true);
    document.getElementById('btn-close-shop').onclick = () => toggleModal('modal-shop', false);

    document.getElementById('buy-atk').onclick = () => {
        if (state.gold >= 100) { state.gold -= 100; state.atk += 5; updateUI(); }
    };
    document.getElementById('buy-hp').onclick = () => {
        if (state.gold >= 100) { state.gold -= 100; state.maxHp += 30; state.hp += 30; updateUI(); }
    };

    // 10. 메인 프레임 루프
    spawnMonsters();
    updateUI();

    function animate() {
        requestAnimationFrame(animate);

        // 이동 처리
        if (moveVector.x !== 0 || moveVector.z !== 0) {
            playerGroup.position.x += moveVector.x * 0.12 * state.speed;
            playerGroup.position.z += moveVector.z * 0.12 * state.speed;
            playerGroup.rotation.y = Math.atan2(moveVector.x, moveVector.z);
        }

        // MP 자동 회복
        if (state.mp < state.maxMp) {
            state.mp += 0.05;
            updateUI();
        }

        // 몬스터 추적
        spawnMonsters();
        monsters.forEach(m => m.update());
        updateParticles();

        // 카메라 추적
        camera.position.set(playerGroup.position.x, playerGroup.position.y + 10, playerGroup.position.z + 9);
        camera.lookAt(playerGroup.position);

        renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
});
