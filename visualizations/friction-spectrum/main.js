/**
 * The Friction Spectrum
 * Self-Exploratory 3D Visualization
 *
 * Design: River/Dam metaphor — AI as water that flows freely,
 * then is channeled, then constrained, then blocked.
 * Glass chambers become progressively more opaque.
 *
 * Interaction: Hover to highlight, click to explore details.
 */

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
    colors: {
        bg: 0x06080c,

        // Cool to Warm progression
        seamless: 0x22d3ee,     // Cyan
        visible: 0x60a5fa,      // Blue
        gated: 0xfbbf24,        // Amber
        humanOnly: 0xf59e0b,    // Warm gold

        // Flow colors
        flow: 0x67e8f9,         // Light cyan
        flowGlow: 0xa5f3fc,     // Lighter cyan glow
        barrier: 0xfcd34d,      // Golden barrier
    },

    // Chamber positions (isometric arrangement)
    chambers: {
        seamless: { x: -5, z: -2 },
        visible: { x: -1.5, z: -0.5 },
        gated: { x: 2, z: 1 },
        humanOnly: { x: 5.5, z: 2.5 },
    },

    chamberSize: 2.5,
    chamberHeight: 3,
};

// Zone data with descriptions
const ZONES = [
    {
        id: 'seamless',
        title: 'Seamless',
        stakes: 'Low Stakes',
        description: 'AI flows freely through transparent walls. Errors are cheap, trust is implicit, friction dissolves.',
        details: 'Here, automation should be invisible. The glass is nearly transparent because we don\'t need to see the seams. Email sorting, auto-complete, background sync—the AI works and we barely notice.',
        examples: 'Auto-save, spell-check, spam filtering, code formatting, calendar scheduling',
        color: CONFIG.colors.seamless,
        position: CONFIG.chambers.seamless,
        glassOpacity: 0.08,
    },
    {
        id: 'visible',
        title: 'Visible',
        stakes: 'Learning Stakes',
        description: 'The glass reveals the flow. We see where AI contributed. Learning happens at these illuminated seams.',
        details: 'The seams become visible—not to slow us down, but to teach. We see what AI did and why. These are "beautiful seams" that build understanding over time.',
        examples: 'Code suggestions with explanations, writing assistants showing changes, learning apps revealing AI reasoning',
        color: CONFIG.colors.visible,
        position: CONFIG.chambers.visible,
        glassOpacity: 0.2,
    },
    {
        id: 'gated',
        title: 'Gated',
        stakes: 'High Stakes',
        description: 'Gates emerge. The flow must pause, await approval. Human judgment opens each passage.',
        details: 'Stakes are high enough that we need checkpoints. AI prepares, humans approve. The gate ensures no action proceeds without conscious human decision.',
        examples: 'Financial transactions requiring approval, medical recommendations needing physician sign-off, legal document review',
        color: CONFIG.colors.gated,
        position: CONFIG.chambers.gated,
        glassOpacity: 0.4,
    },
    {
        id: 'human-only',
        title: 'Human-Only',
        stakes: 'Constitutional Stakes',
        description: 'The barrier holds. AI informs but cannot cross. Some decisions belong to humans alone.',
        details: 'The final barrier is opaque and solid. AI may observe, analyze, even advise—but it cannot act. These are decisions that define who we are: ethical judgments, creative direction, relationship choices.',
        examples: 'Hiring decisions, criminal sentencing, end-of-life care, artistic vision, strategic direction',
        color: CONFIG.colors.humanOnly,
        position: CONFIG.chambers.humanOnly,
        glassOpacity: 0.85,
    },
];

// ============================================================
// Global State
// ============================================================
let scene, camera, renderer, controls;
let chambers = [];
let flowParticles = [];
let riverMesh = null;
let raycaster, mouse;
let hoveredChamber = null;
let selectedZone = null;

// ============================================================
// Touch Detection
// ============================================================
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ============================================================
// Performance Mode
// ============================================================
const PerformanceMode = {
    isLowFi: false,

    detect() {
        const urlParams = new URLSearchParams(window.location.search);
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const hasLowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;

        this.isLowFi = isMobile || hasLowCores;
        if (urlParams.get('lowfi') === 'true') this.isLowFi = true;
        if (urlParams.get('lowfi') === 'false') this.isLowFi = false;

        return this.isLowFi;
    }
};

// ============================================================
// Audio Manager
// ============================================================
const AudioManager = {
    context: null,
    masterGain: null,
    enabled: false,
    initialized: false,
    ambientNodes: [],

    init() {
        if (this.initialized) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContextClass();
            this.masterGain = this.context.createGain();
            this.masterGain.gain.value = 0;
            this.masterGain.connect(this.context.destination);
            this.initialized = true;
        } catch (e) {
            console.warn('Audio not available');
        }
    },

    toggle() {
        if (!this.initialized) this.init();
        if (!this.context) return;

        this.enabled = !this.enabled;

        const btn = document.getElementById('audioBtn');
        if (btn) {
            btn.classList.toggle('active', this.enabled);
            const label = btn.querySelector('.audio-label');
            if (label) label.textContent = this.enabled ? 'Sound On' : 'Sound';
        }

        if (this.enabled) {
            if (this.context.state === 'suspended') this.context.resume();
            this.startAmbient();
            gsap.to(this.masterGain.gain, { value: 0.12, duration: 2 });
        } else {
            gsap.to(this.masterGain.gain, { value: 0, duration: 1 });
        }
    },

    startAmbient() {
        if (this.ambientNodes.length > 0) return;

        // Ethereal pad
        const frequencies = [65.41, 98.00, 130.81];
        frequencies.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.value = 0.08 / (i + 1);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start();
            this.ambientNodes.push({ osc, gain });
        });
    },

    playHoverTone(zoneIndex) {
        if (!this.enabled || !this.context) return;
        const frequencies = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequencies[zoneIndex] || 392;
        gain.gain.setValueAtTime(0.08, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(this.context.destination);
        osc.start();
        osc.stop(this.context.currentTime + 0.3);
    },

    playSelectTone(zoneIndex) {
        if (!this.enabled || !this.context) return;
        const frequencies = [261.63, 329.63, 392.00, 523.25];
        const base = frequencies[zoneIndex] || 392;

        // Two-note chime
        [base, base * 1.5].forEach((freq, i) => {
            setTimeout(() => {
                const osc = this.context.createOscillator();
                const gain = this.context.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.12, this.context.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.5);
                osc.connect(gain);
                gain.connect(this.context.destination);
                osc.start();
                osc.stop(this.context.currentTime + 0.5);
            }, i * 100);
        });
    },
};

// ============================================================
// Initialization
// ============================================================
window.addEventListener('DOMContentLoaded', init);

function init() {
    PerformanceMode.detect();

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.bg);
    scene.fog = new THREE.FogExp2(CONFIG.colors.bg, 0.035);

    // Camera - isometric-ish angle
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(8, 8, 12);
    camera.lookAt(0, 0, 0);

    // Renderer
    const canvas = document.getElementById('canvas');
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !PerformanceMode.isLowFi,
        alpha: false
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !PerformanceMode.isLowFi;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 25;
    controls.maxPolarAngle = Math.PI * 0.65;
    controls.target.set(0, 0.5, 0);

    // Raycaster for interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Build scene
    setupLighting();
    createGround();
    createChambers();
    createRiver();
    createFlowParticles();

    // Events
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);

    if (isTouchDevice) {
        window.addEventListener('touchstart', onTouchStart);
    }

    // Start animation
    animate();

    // Intro sequence
    playIntro();
}

// ============================================================
// Lighting
// ============================================================
function setupLighting() {
    // Soft ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambient);

    // Cool light from seamless side
    const coolLight = new THREE.PointLight(CONFIG.colors.seamless, 0.5, 25);
    coolLight.position.set(-10, 6, -5);
    scene.add(coolLight);

    // Warm light from human-only side
    const warmLight = new THREE.PointLight(CONFIG.colors.humanOnly, 0.5, 25);
    warmLight.position.set(10, 6, 5);
    scene.add(warmLight);

    // Key light from above
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.3);
    keyLight.position.set(5, 12, 5);
    keyLight.castShadow = !PerformanceMode.isLowFi;
    scene.add(keyLight);
}

// ============================================================
// Ground
// ============================================================
function createGround() {
    const geometry = new THREE.PlaneGeometry(60, 60);
    const material = new THREE.MeshStandardMaterial({
        color: 0x080a0e,
        roughness: 1,
        metalness: 0
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    // Subtle grid
    const grid = new THREE.GridHelper(40, 40, 0x12151a, 0x0c0e12);
    grid.position.y = -0.49;
    grid.material.opacity = 0.3;
    grid.material.transparent = true;
    scene.add(grid);
}

// ============================================================
// Glass Chambers
// ============================================================
function createChambers() {
    ZONES.forEach((zone, index) => {
        const group = new THREE.Group();
        group.userData = { zone, index, isInteractive: true };

        const { x, z } = zone.position;
        const size = CONFIG.chamberSize;
        const height = CONFIG.chamberHeight;

        // Glass walls (4 sides)
        const wallGeometry = new THREE.PlaneGeometry(size, height);

        // Glass material - opacity increases with zone
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: zone.color,
            transparent: true,
            opacity: zone.glassOpacity,
            roughness: 0.1,
            metalness: 0.1,
            transmission: 1 - zone.glassOpacity,
            thickness: 0.5,
            side: THREE.DoubleSide,
        });

        // Front wall
        const frontWall = new THREE.Mesh(wallGeometry, glassMaterial.clone());
        frontWall.position.set(0, height / 2, size / 2);
        frontWall.userData.parentChamber = group;
        group.add(frontWall);

        // Back wall
        const backWall = new THREE.Mesh(wallGeometry, glassMaterial.clone());
        backWall.position.set(0, height / 2, -size / 2);
        backWall.userData.parentChamber = group;
        group.add(backWall);

        // Left wall
        const leftWall = new THREE.Mesh(wallGeometry, glassMaterial.clone());
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(-size / 2, height / 2, 0);
        leftWall.userData.parentChamber = group;
        group.add(leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(wallGeometry, glassMaterial.clone());
        rightWall.rotation.y = Math.PI / 2;
        rightWall.position.set(size / 2, height / 2, 0);
        rightWall.userData.parentChamber = group;
        group.add(rightWall);

        // Invisible interaction box (easier to hit)
        const hitboxGeometry = new THREE.BoxGeometry(size, height, size);
        const hitboxMaterial = new THREE.MeshBasicMaterial({
            visible: false,
        });
        const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
        hitbox.position.y = height / 2;
        hitbox.userData.parentChamber = group;
        group.add(hitbox);

        // Base platform (glowing)
        const baseGeometry = new THREE.BoxGeometry(size + 0.2, 0.1, size + 0.2);
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: zone.color,
            emissive: zone.color,
            emissiveIntensity: 0.15,
            roughness: 0.5,
            metalness: 0.3,
        });

        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = -0.05;
        base.receiveShadow = true;
        base.userData.parentChamber = group;
        group.add(base);

        // Edge glow lines
        const edgeGeometry = new THREE.BoxGeometry(size + 0.3, 0.02, 0.02);
        const edgeMaterial = new THREE.MeshBasicMaterial({
            color: zone.color,
            transparent: true,
            opacity: 0.5,
        });

        // Four edge lines at base
        const edges = [
            { pos: [0, 0, size / 2 + 0.15], rot: [0, 0, 0] },
            { pos: [0, 0, -size / 2 - 0.15], rot: [0, 0, 0] },
            { pos: [size / 2 + 0.15, 0, 0], rot: [0, Math.PI / 2, 0] },
            { pos: [-size / 2 - 0.15, 0, 0], rot: [0, Math.PI / 2, 0] },
        ];

        edges.forEach(({ pos, rot }) => {
            const edge = new THREE.Mesh(edgeGeometry, edgeMaterial.clone());
            edge.position.set(...pos);
            edge.rotation.set(...rot);
            group.add(edge);
        });

        // Position the chamber group
        group.position.set(x, 0, z);
        scene.add(group);

        chambers.push({
            group,
            glassMaterial,
            baseMaterial,
            zone,
            walls: [frontWall, backWall, leftWall, rightWall],
            hitbox,
        });
    });
}

// ============================================================
// River of Light (connecting chambers)
// ============================================================
function createRiver() {
    // Create a path that flows through all chambers
    const points = [];
    const zonePositions = ZONES.map(z => z.position);

    // Start point (before first chamber)
    points.push(new THREE.Vector3(zonePositions[0].x - 3, 0.5, zonePositions[0].z - 1));

    // Through each chamber
    zonePositions.forEach((pos) => {
        points.push(new THREE.Vector3(pos.x, 0.5, pos.z));
    });

    // End point (at barrier - but fades)
    const lastPos = zonePositions[zonePositions.length - 1];
    points.push(new THREE.Vector3(lastPos.x + 1.5, 0.5, lastPos.z + 0.8));

    const curve = new THREE.CatmullRomCurve3(points);

    // River tube
    const tubeGeometry = new THREE.TubeGeometry(curve, 100, 0.12, 8, false);

    const riverMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            colorStart: { value: new THREE.Color(CONFIG.colors.seamless) },
            colorEnd: { value: new THREE.Color(CONFIG.colors.humanOnly) },
            flowSpeed: { value: 1.0 },
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vPosition;

            void main() {
                vUv = uv;
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 colorStart;
            uniform vec3 colorEnd;
            uniform float flowSpeed;

            varying vec2 vUv;
            varying vec3 vPosition;

            void main() {
                // Color gradient along the river
                vec3 color = mix(colorStart, colorEnd, vUv.x);

                // Flowing wave pattern
                float wave = sin(vUv.x * 20.0 - time * flowSpeed * 3.0) * 0.5 + 0.5;
                wave *= sin(vUv.x * 8.0 - time * flowSpeed * 1.5) * 0.5 + 0.5;

                // Base opacity with wave modulation
                float baseOpacity = 0.25 + wave * 0.35;

                // Fade at the barrier (last 15%)
                float barrierFade = 1.0 - smoothstep(0.82, 0.98, vUv.x);
                baseOpacity *= barrierFade;

                gl_FragColor = vec4(color, baseOpacity);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    riverMesh = new THREE.Mesh(tubeGeometry, riverMaterial);
    scene.add(riverMesh);

    // Store curve for particle paths
    riverMesh.userData.curve = curve;
}

// ============================================================
// Flow Particles (ambient river particles)
// ============================================================
function createFlowParticles() {
    const particleCount = PerformanceMode.isLowFi ? 30 : 50;

    for (let i = 0; i < particleCount; i++) {
        const geometry = new THREE.SphereGeometry(0.04, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: CONFIG.colors.flow,
            transparent: true,
            opacity: 0.5,
        });

        const particle = new THREE.Mesh(geometry, material);

        // Random position along the river path
        particle.userData = {
            progress: Math.random(),
            speed: 0.015 + Math.random() * 0.025,
            offset: new THREE.Vector3(
                (Math.random() - 0.5) * 0.25,
                (Math.random() - 0.5) * 0.15,
                (Math.random() - 0.5) * 0.25
            ),
        };

        scene.add(particle);
        flowParticles.push({ mesh: particle, material });
    }
}

// ============================================================
// Animation Loop
// ============================================================
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now() * 0.001;

    controls.update();

    // Update river shader
    if (riverMesh && riverMesh.material.uniforms) {
        riverMesh.material.uniforms.time.value = time;
    }

    // Animate flow particles
    if (riverMesh && riverMesh.userData.curve) {
        const curve = riverMesh.userData.curve;

        flowParticles.forEach(({ mesh }) => {
            mesh.userData.progress += mesh.userData.speed * 0.01;

            // Loop back to start
            if (mesh.userData.progress > 0.88) {
                mesh.userData.progress = 0;
            }

            const pos = curve.getPointAt(mesh.userData.progress);
            mesh.position.copy(pos).add(mesh.userData.offset);

            // Color shifts along path
            const t = mesh.userData.progress;
            const color = new THREE.Color().lerpColors(
                new THREE.Color(CONFIG.colors.seamless),
                new THREE.Color(CONFIG.colors.humanOnly),
                t
            );
            mesh.material.color = color;
        });
    }

    // Subtle chamber breathing
    chambers.forEach(({ group, zone }, i) => {
        const isHovered = hoveredChamber === group;
        const breatheSpeed = isHovered ? 0.8 : 0.4;
        const breatheAmount = isHovered ? 0.02 : 0.008;
        const breathe = Math.sin(time * breatheSpeed + i * 0.8) * breatheAmount;
        group.scale.setScalar(1 + breathe);
    });

    // Update labels
    updateLabels();

    renderer.render(scene, camera);
}

// ============================================================
// Interaction: Hover
// ============================================================
function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    checkHover();
}

function onTouchStart(event) {
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        checkHover();
    }
}

function checkHover() {
    raycaster.setFromCamera(mouse, camera);

    // Get all interactive objects
    const interactiveObjects = [];
    chambers.forEach(({ group }) => {
        group.traverse((child) => {
            if (child.isMesh) {
                interactiveObjects.push(child);
            }
        });
    });

    const intersects = raycaster.intersectObjects(interactiveObjects);

    let newHovered = null;

    if (intersects.length > 0) {
        // Find the parent chamber group
        let obj = intersects[0].object;
        while (obj && !obj.userData.isInteractive) {
            obj = obj.userData.parentChamber || obj.parent;
        }
        if (obj && obj.userData.isInteractive) {
            newHovered = obj;
        }
    }

    if (newHovered !== hoveredChamber) {
        // Unhover previous
        if (hoveredChamber) {
            unhoverChamber(hoveredChamber);
        }

        // Hover new
        if (newHovered) {
            hoverChamber(newHovered);
        }

        hoveredChamber = newHovered;

        // Update cursor
        document.body.style.cursor = newHovered ? 'pointer' : 'default';
    }
}

function hoverChamber(group) {
    const chamberData = chambers.find(c => c.group === group);
    if (!chamberData) return;

    const { baseMaterial, zone } = chamberData;
    const index = ZONES.findIndex(z => z.id === zone.id);

    // Highlight base
    gsap.to(baseMaterial, {
        emissiveIntensity: 0.45,
        duration: 0.4,
        ease: 'power2.out',
    });

    // Show tooltip
    showTooltip(zone);

    // Play hover sound
    AudioManager.playHoverTone(index);

    // Update label to emphasized state
    const label = document.getElementById(`label-${zone.id}`);
    if (label) {
        label.classList.add('hovered');
    }
}

function unhoverChamber(group) {
    const chamberData = chambers.find(c => c.group === group);
    if (!chamberData) return;

    const { baseMaterial, zone } = chamberData;

    // Dim base
    gsap.to(baseMaterial, {
        emissiveIntensity: 0.15,
        duration: 0.4,
        ease: 'power2.out',
    });

    // Hide tooltip
    hideTooltip();

    // Remove label emphasis
    const label = document.getElementById(`label-${zone.id}`);
    if (label) {
        label.classList.remove('hovered');
    }
}

// ============================================================
// Interaction: Click
// ============================================================
function onClick(event) {
    // Ignore if dragging
    if (controls.isDragging) return;

    if (hoveredChamber) {
        const chamberData = chambers.find(c => c.group === hoveredChamber);
        if (chamberData) {
            openDetail(chamberData.zone);
        }
    }
}

// ============================================================
// Tooltip (hover info)
// ============================================================
function showTooltip(zone) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;

    document.getElementById('tooltipTitle').textContent = zone.title;
    document.getElementById('tooltipStakes').textContent = zone.stakes;
    document.getElementById('tooltipDescription').textContent = zone.description;

    // Set accent color
    const color = `#${zone.color.toString(16).padStart(6, '0')}`;
    tooltip.style.setProperty('--accent-color', color);

    tooltip.classList.add('visible');
}

function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
        tooltip.classList.remove('visible');
    }
}

// ============================================================
// Detail Panel (click for full info)
// ============================================================
function openDetail(zone) {
    selectedZone = zone;
    const index = ZONES.findIndex(z => z.id === zone.id);

    const overlay = document.getElementById('detailOverlay');
    const color = `#${zone.color.toString(16).padStart(6, '0')}`;

    document.getElementById('detailStakes').textContent = zone.stakes;
    document.getElementById('detailStakes').style.color = color;
    document.getElementById('detailTitle').textContent = zone.title;
    document.getElementById('detailTitle').style.color = color;
    document.getElementById('detailDescription').textContent = zone.details;
    document.getElementById('detailExamples').textContent = zone.examples;
    document.querySelector('.detail-panel__examples').style.borderColor = color;

    overlay.classList.add('visible');

    // Play select tone
    AudioManager.playSelectTone(index);

    // Animate camera to focus on this chamber
    gsap.to(camera.position, {
        x: zone.position.x + 5,
        y: 5,
        z: zone.position.z + 8,
        duration: 1.5,
        ease: 'power2.inOut',
    });

    gsap.to(controls.target, {
        x: zone.position.x,
        y: 1,
        z: zone.position.z,
        duration: 1.5,
        ease: 'power2.inOut',
    });
}

function closeDetail() {
    document.getElementById('detailOverlay').classList.remove('visible');
    selectedZone = null;

    // Return to overview
    gsap.to(camera.position, {
        x: 8,
        y: 8,
        z: 12,
        duration: 1.5,
        ease: 'power2.inOut',
    });

    gsap.to(controls.target, {
        x: 0,
        y: 0.5,
        z: 0,
        duration: 1.5,
        ease: 'power2.inOut',
    });
}

// ============================================================
// Labels
// ============================================================
function updateLabels() {
    ZONES.forEach(zone => {
        const label = document.getElementById(`label-${zone.id}`);
        if (!label) return;

        const pos = new THREE.Vector3(zone.position.x, CONFIG.chamberHeight + 0.3, zone.position.z);
        pos.project(camera);

        const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;

        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
    });
}

// ============================================================
// Intro
// ============================================================
function playIntro() {
    // Start camera position
    camera.position.set(12, 10, 16);

    // Animate to initial view
    gsap.to(camera.position, {
        x: 8,
        y: 8,
        z: 12,
        duration: 2.5,
        ease: 'power2.out',
    });

    // UI reveals with stagger
    setTimeout(() => document.getElementById('header')?.classList.add('visible'), 600);
    setTimeout(() => document.getElementById('legend')?.classList.add('visible'), 1000);
    setTimeout(() => document.getElementById('audioBtn')?.classList.add('visible'), 1200);
    setTimeout(() => document.getElementById('controlsHint')?.classList.add('visible'), 1400);
    setTimeout(() => document.getElementById('tooltip')?.classList.add('ready'), 1600);

    // Show all zone labels
    ZONES.forEach((zone, i) => {
        setTimeout(() => {
            document.getElementById(`label-${zone.id}`)?.classList.add('visible');
        }, 1000 + i * 200);
    });
}

// ============================================================
// Events
// ============================================================
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
// Global Functions
// ============================================================
window.closeDetail = closeDetail;
window.toggleAudio = () => AudioManager.toggle();

// Close detail on escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
});

// Close detail on overlay click
document.addEventListener('click', (e) => {
    if (e.target.id === 'detailOverlay') closeDetail();
});
