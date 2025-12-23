/**
 * The Complementarity View
 * Isometric 3D visualization with street lamp metaphor
 */

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
    colors: {
        bg: 0x08080c,
        ground: 0x1a1a24,
        lampPost: 0x3a3a44,
        lampLight: 0xf0f6ff,    // Cool white LED (slight blue tint)
        lampGlow: 0xd8e8ff,     // LED blue/white glow
        ai: 0x22d3ee,
        human: 0x34d399,
        unobservable: 0xf59e0b, // Amber - now distinct from lamp
    },

    // Unobservables positioned in human's perception area (x=0 to x=7, centered at x=3.5)
    // All OUTSIDE AI's light cone (which ends at x=1.5)
    // Arranged in a pleasing arc around the human figure
    unobservables: [
        { id: 'intuition', symbol: '◎', title: 'Intuition',
          description: 'Knowing something is wrong before you can articulate why.',
          position: { x: 2.5, z: -2.5 } },
        { id: 'presence', symbol: '◈', title: 'Physical Presence',
          description: 'The weight of a handshake, the tension in a room.',
          position: { x: 4.5, z: 2 } },
        { id: 'room', symbol: '◇', title: 'Reading the Room',
          description: 'The collective mood. Energy that shifts without anyone speaking.',
          position: { x: 5.5, z: -1.5 } },
        { id: 'trust', symbol: '∞', title: 'Relationship Capital',
          description: 'Trust built through years.',
          position: { x: 3.5, z: 2.5 } },
        { id: 'memory', symbol: '⌘', title: 'Institutional Memory',
          description: 'How things actually work, beyond the org chart.',
          position: { x: 6, z: 0.5 } },
        { id: 'context', symbol: '⟡', title: 'Contextual Meaning',
          description: 'Understanding what "fine" really means.',
          position: { x: 4.5, z: -2 } },
        { id: 'timing', symbol: '◐', title: 'Timing & Rhythm',
          description: 'Knowing when to push and when to wait.',
          position: { x: 5, z: 1 } },
        { id: 'silence', symbol: '○', title: "What's Not Said",
          description: 'The pause that speaks volumes.',
          position: { x: 6.5, z: -0.5 } },
    ],
};

// ============================================================
// Touch Device Detection
// ============================================================

const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ============================================================
// Performance & Embed Mode Detection
// ============================================================

const PerformanceMode = {
    isLowFi: false,
    isEmbed: false,

    // Detect performance capabilities and embed context
    detect() {
        // Check for embed mode via URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        this.isEmbed = urlParams.get('embed') === 'true';

        // Check for low-performance device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const hasLowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
        const hasLowMemory = navigator.deviceMemory && navigator.deviceMemory <= 2;

        this.isLowFi = isMobile || hasLowCores || hasLowMemory;

        // Also check URL parameter override
        if (urlParams.get('lowfi') === 'true') this.isLowFi = true;
        if (urlParams.get('lowfi') === 'false') this.isLowFi = false;

        console.log('Performance mode:', this.isLowFi ? 'Low-Fi' : 'Full');
        console.log('Embed mode:', this.isEmbed);

        return { isLowFi: this.isLowFi, isEmbed: this.isEmbed };
    },

    // Apply performance optimizations
    apply() {
        if (this.isLowFi) {
            // Disable shadows
            if (renderer) {
                renderer.shadowMap.enabled = false;
            }

            // Hide dust particles
            if (dustParticles) {
                dustParticles.visible = false;
            }

            // Simplify animations in animate loop (handled by checking isLowFi)
        }

        if (this.isEmbed) {
            // Hide UI elements for embedded view
            document.querySelector('.header')?.classList.add('hidden');
            document.querySelector('.legend')?.classList.add('hidden');
            document.querySelector('.controls-hint')?.classList.add('hidden');
            document.querySelector('.footer-quote')?.classList.add('hidden');
            document.querySelector('.view-mode-toggle')?.classList.add('hidden');
            document.querySelector('.audio-btn')?.classList.add('hidden');

            // Show minimal embed controls instead
            this.createEmbedControls();
        }
    },

    createEmbedControls() {
        const controls = document.createElement('div');
        controls.className = 'embed-controls';
        controls.innerHTML = `
            <button class="embed-btn" onclick="transitionToPreset('overview')" title="Reset view">⟲</button>
            <button class="embed-btn" onclick="document.documentElement.requestFullscreen()" title="Fullscreen">⛶</button>
        `;
        document.body.appendChild(controls);
    }
};

// ============================================================
// Audio Manager
// ============================================================

const AudioManager = {
    context: null,
    masterGain: null,
    ambientNodes: [],
    lfoNode: null,
    enabled: false,
    initialized: false,

    // Initialize audio context (must be called after user interaction)
    init() {
        if (this.initialized) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContextClass();
            this.masterGain = this.context.createGain();
            this.masterGain.gain.value = 0;
            this.masterGain.connect(this.context.destination);
            this.initialized = true;
            console.log('Audio Manager initialized, state:', this.context.state);

            // Handle Safari audio interruptions (phone calls, etc.)
            this.context.addEventListener('statechange', () => {
                console.log('AudioContext state changed:', this.context.state);
                if (this.context.state === 'interrupted' && this.enabled) {
                    // Audio was interrupted - update UI to reflect this
                    const btn = document.getElementById('audioToggle');
                    if (btn) {
                        btn.classList.remove('audio-btn--active');
                        const label = btn.querySelector('.audio-btn__label');
                        if (label) label.textContent = 'Sound Off';
                    }
                    this.enabled = false;
                    this.stopAmbientSoundscape();
                }
            });
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
        }
    },

    // Toggle ambient soundscape
    async toggleAmbient() {
        if (!this.initialized) this.init();
        if (!this.context) return;

        this.enabled = !this.enabled;

        // Update UI immediately for responsiveness
        const btn = document.getElementById('audioToggle');
        if (btn) {
            btn.classList.toggle('audio-btn--active', this.enabled);
            const label = btn.querySelector('.audio-btn__label');
            if (label) label.textContent = this.enabled ? 'Sound On' : 'Sound Off';
        }

        if (this.enabled) {
            // Resume context if suspended or interrupted (Safari)
            if (this.context.state === 'suspended' || this.context.state === 'interrupted') {
                try {
                    await this.context.resume();
                    console.log('AudioContext resumed, state:', this.context.state);
                } catch (e) {
                    console.warn('Failed to resume AudioContext:', e);
                    // Revert UI state on failure
                    this.enabled = false;
                    if (btn) {
                        btn.classList.remove('audio-btn--active');
                        const label = btn.querySelector('.audio-btn__label');
                        if (label) label.textContent = 'Sound Off';
                    }
                    return;
                }
            }

            // Create ambient soundscape after context is running
            this.createAmbientSoundscape();

            // Fade in
            this.masterGain.gain.cancelScheduledValues(this.context.currentTime);
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.context.currentTime);
            this.masterGain.gain.linearRampToValueAtTime(0.12, this.context.currentTime + 2);
        } else {
            // Fade out
            this.masterGain.gain.cancelScheduledValues(this.context.currentTime);
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.context.currentTime);
            this.masterGain.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.5);

            // Stop all nodes after fade
            setTimeout(() => {
                this.stopAmbientSoundscape();
            }, 600);
        }
    },

    createAmbientSoundscape() {
        if (this.ambientNodes.length > 0) return; // Already playing

        // Create a rich, evolving ambient pad with multiple layers

        // Layer 1: Deep drone with slight movement
        const droneFrequencies = [55, 82.5, 110]; // A1, E2, A2 - perfect fifth harmony
        droneFrequencies.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            const filter = this.context.createBiquadFilter();

            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.detune.value = Math.random() * 8 - 4;

            // Low-pass filter for warmth
            filter.type = 'lowpass';
            filter.frequency.value = 400 + i * 100;
            filter.Q.value = 1;

            gain.gain.value = 0.15 / (i + 1);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);
            osc.start();

            this.ambientNodes.push({ node: osc, gain, filter });
        });

        // Layer 2: Ethereal high harmonics with tremolo
        const highFrequencies = [440, 659.25, 880]; // A4, E5, A5
        highFrequencies.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            const filter = this.context.createBiquadFilter();
            const tremolo = this.context.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.detune.value = Math.random() * 15 - 7.5;

            // High-pass filter for airiness
            filter.type = 'highpass';
            filter.frequency.value = 200;

            // Very quiet
            gain.gain.value = 0.02 / (i + 1);

            // Create LFO for tremolo
            const lfo = this.context.createOscillator();
            const lfoGain = this.context.createGain();
            lfo.type = 'sine';
            lfo.frequency.value = 0.1 + i * 0.05; // Slow modulation
            lfoGain.gain.value = 0.5;
            lfo.connect(lfoGain);
            lfoGain.connect(tremolo.gain);
            tremolo.gain.value = 0.5;
            lfo.start();

            osc.connect(filter);
            filter.connect(tremolo);
            tremolo.connect(gain);
            gain.connect(this.masterGain);
            osc.start();

            this.ambientNodes.push({ node: osc, gain, filter, lfo });
        });

        // Layer 3: Subtle noise texture (filtered pink noise simulation)
        this.createNoiseLayer();
    },

    createNoiseLayer() {
        // Create filtered noise for texture
        const bufferSize = 2 * this.context.sampleRate;
        const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        // Generate pink-ish noise
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            output[i] *= 0.11;
            b6 = white * 0.115926;
        }

        const noiseSource = this.context.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;

        const noiseFilter = this.context.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 800;
        noiseFilter.Q.value = 0.5;

        const noiseGain = this.context.createGain();
        noiseGain.gain.value = 0.015;

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noiseSource.start();

        this.ambientNodes.push({ node: noiseSource, gain: noiseGain, filter: noiseFilter });
    },

    stopAmbientSoundscape() {
        this.ambientNodes.forEach(({ node, gain, filter, lfo }) => {
            try {
                node.stop();
                node.disconnect();
                gain?.disconnect();
                filter?.disconnect();
                lfo?.stop();
                lfo?.disconnect();
            } catch (e) {}
        });
        this.ambientNodes = [];
    },

    // Play hover sound for an orb
    playHoverSound(orbIndex) {
        if (!this.enabled || !this.context) return;

        // Create a short ethereal tone with harmonics
        const baseFreq = 220 + orbIndex * 40;

        // Main tone
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        const filter = this.context.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.value = baseFreq;

        // Soft filter
        filter.type = 'lowpass';
        filter.frequency.value = 2000;

        // Envelope
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, this.context.currentTime);
        gain.gain.linearRampToValueAtTime(0.06, this.context.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.6);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.context.currentTime + 0.6);

        // Add subtle harmonic
        const osc2 = this.context.createOscillator();
        const gain2 = this.context.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = baseFreq * 2;
        gain2.gain.value = 0;
        gain2.gain.setValueAtTime(0, this.context.currentTime);
        gain2.gain.linearRampToValueAtTime(0.02, this.context.currentTime + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.4);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start();
        osc2.stop(this.context.currentTime + 0.4);
    },

    // Play focus/zoom-in sound
    playFocusSound() {
        if (!this.enabled || !this.context) return;

        // Rising ethereal sweep
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        const filter = this.context.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.context.currentTime + 0.8);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, this.context.currentTime);
        filter.frequency.exponentialRampToValueAtTime(1500, this.context.currentTime + 0.8);

        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, this.context.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, this.context.currentTime + 0.15);
        gain.gain.linearRampToValueAtTime(0.05, this.context.currentTime + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 1.2);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.context.currentTime + 1.2);

        // Add shimmering harmonic
        const osc2 = this.context.createOscillator();
        const gain2 = this.context.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(300, this.context.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(800, this.context.currentTime + 0.8);
        gain2.gain.value = 0;
        gain2.gain.setValueAtTime(0, this.context.currentTime + 0.1);
        gain2.gain.linearRampToValueAtTime(0.03, this.context.currentTime + 0.3);
        gain2.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 1.0);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start();
        osc2.stop(this.context.currentTime + 1.0);
    }
};

// ============================================================
// State Manager
// ============================================================

const StateManager = {
    // View mode: 'normal' | 'ai-view' | 'human-view'
    mode: 'normal',

    // Currently focused unobservable (null or orb id)
    focusedOrb: null,

    // Camera state
    currentPreset: 'overview',
    idleTime: 0,
    isAutoOrbit: false,

    // Audio
    audioEnabled: false,

    // Detail level: 'full' | 'reduced'
    detailLevel: 'full',

    // Interaction state
    lastInteractionTime: Date.now(),

    // Listeners for state changes
    listeners: [],

    // Subscribe to state changes
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    },

    // Notify all listeners
    notify(key, value) {
        this.listeners.forEach(callback => callback(key, value));
    },

    // Set mode with notification
    setMode(mode) {
        if (this.mode !== mode) {
            this.mode = mode;
            this.notify('mode', mode);
        }
    },

    // Set focused orb with notification
    setFocusedOrb(orbId) {
        if (this.focusedOrb !== orbId) {
            this.focusedOrb = orbId;
            this.notify('focusedOrb', orbId);
        }
    },

    // Record user interaction (resets idle timer)
    recordInteraction() {
        this.lastInteractionTime = Date.now();
        if (this.isAutoOrbit) {
            this.isAutoOrbit = false;
            this.notify('isAutoOrbit', false);
        }
    },

    // Check if idle (no interaction for specified ms)
    isIdle(thresholdMs = 30000) {
        return Date.now() - this.lastInteractionTime > thresholdMs;
    },

    // Set camera preset
    setPreset(presetName) {
        if (this.currentPreset !== presetName) {
            this.currentPreset = presetName;
            this.notify('currentPreset', presetName);
        }
    }
};

// ============================================================
// Camera Presets
// ============================================================

const CAMERA_PRESETS = {
    overview: {
        position: { x: 12, y: 12, z: 14 },
        target: { x: 2, y: 0, z: 0 }
    },
    ai: {
        position: { x: -5, y: 8, z: 5 },
        target: { x: -2, y: 1, z: 0 }
    },
    human: {
        position: { x: 8, y: 6, z: 8 },
        target: { x: 3, y: 0.5, z: 0 }
    }
};

// ============================================================
// View Mode System
// ============================================================

function setViewMode(mode) {
    StateManager.setMode(mode);
    StateManager.recordInteraction();

    // Update button states
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('view-btn--active');
    });

    if (mode === 'normal') {
        document.getElementById('viewNormal')?.classList.add('view-btn--active');
        transitionToPreset('overview', 1.5);
    } else if (mode === 'ai-view') {
        document.getElementById('viewAI')?.classList.add('view-btn--active');
        transitionToPreset('ai', 1.5);
    } else if (mode === 'human-view') {
        document.getElementById('viewHuman')?.classList.add('view-btn--active');
        transitionToPreset('human', 1.5);
    }

    // Apply visual changes based on mode
    applyViewMode(mode);
}

function applyViewMode(mode) {
    if (typeof gsap === 'undefined') return;

    // Phase 1: ALL transitions go dark first (like AI view)
    // This happens during camera movement
    if (scene.fog) {
        gsap.to(scene.fog, { near: 8, far: 20, duration: 0.5 });
    }
    if (lightCone) {
        gsap.to(lightCone.material, { opacity: 0.25, duration: 0.5 });
    }
    // Shrink orbs during transition
    unobservableObjects.forEach(group => {
        gsap.to(group.scale, { x: 0, y: 0, z: 0, duration: 0.4, ease: 'power2.in' });
    });
    document.querySelectorAll('.unobservable-label').forEach(el => {
        el.style.opacity = '0';
    });

    // Phase 2: After dark transition, apply target state
    // Timed to happen as camera arrives
    setTimeout(() => {
        switch(mode) {
            case 'ai-view':
                // Stay dark - AI can't see unobservables
                document.getElementById('labelUnobservable')?.classList.remove('visible');
                break;

            case 'human-view':
                // Reveal expanded perception
                unobservableObjects.forEach((group, i) => {
                    gsap.to(group.scale, {
                        x: 1.2, y: 1.2, z: 1.2,
                        duration: 0.6,
                        delay: i * 0.05,
                        ease: 'back.out(1.5)'
                    });
                });
                document.querySelectorAll('.unobservable-label').forEach(el => {
                    el.style.opacity = '1';
                });
                if (lightCone) {
                    gsap.to(lightCone.material, { opacity: 0.08, duration: 0.6 });
                }
                if (scene.fog) {
                    gsap.to(scene.fog, { near: 20, far: 50, duration: 0.8 });
                }
                document.getElementById('labelUnobservable')?.classList.add('visible');
                break;

            case 'normal':
            default:
                // Restore normal balanced view
                unobservableObjects.forEach((group, i) => {
                    gsap.to(group.scale, {
                        x: 1, y: 1, z: 1,
                        duration: 0.5,
                        delay: i * 0.03,
                        ease: 'power2.out'
                    });
                });
                document.querySelectorAll('.unobservable-label').forEach(el => {
                    el.style.opacity = '';
                });
                if (lightCone) {
                    gsap.to(lightCone.material, { opacity: 0.15, duration: 0.6 });
                }
                if (scene.fog) {
                    gsap.to(scene.fog, { near: 15, far: 40, duration: 0.8 });
                }
                document.getElementById('labelUnobservable')?.classList.add('visible');
                break;
        }
    }, 700); // Delay matches camera transition midpoint
}

// ============================================================
// Camera Transitions
// ============================================================

function transitionToPreset(presetName, duration = 1.5) {
    const preset = CAMERA_PRESETS[presetName];
    if (!preset || typeof gsap === 'undefined') return;

    StateManager.setPreset(presetName);
    StateManager.recordInteraction();

    gsap.to(camera.position, {
        x: preset.position.x,
        y: preset.position.y,
        z: preset.position.z,
        duration: duration,
        ease: 'power2.inOut',
        onUpdate: () => {
            if (controls) controls.update();
        }
    });

    gsap.to(controls.target, {
        x: preset.target.x,
        y: preset.target.y,
        z: preset.target.z,
        duration: duration,
        ease: 'power2.inOut'
    });
}

function transitionToPosition(position, target, duration = 1.2) {
    if (typeof gsap === 'undefined') return;

    StateManager.recordInteraction();

    gsap.to(camera.position, {
        x: position.x,
        y: position.y,
        z: position.z,
        duration: duration,
        ease: 'power2.inOut',
        onUpdate: () => {
            if (controls) controls.update();
        }
    });

    gsap.to(controls.target, {
        x: target.x,
        y: target.y,
        z: target.z,
        duration: duration,
        ease: 'power2.inOut'
    });
}

// ============================================================
// Focus System
// ============================================================

function focusOnOrb(orbId) {
    const orbData = CONFIG.unobservables.find(u => u.id === orbId);
    const orbObject = unobservableObjects.find(g => g.userData.unobservable.id === orbId);

    if (!orbData || !orbObject) return;

    StateManager.setFocusedOrb(orbId);

    // Play focus sound
    AudioManager.playFocusSound();

    // Calculate camera position for focus (offset from orb)
    const orbPos = orbObject.position;
    const focusPosition = {
        x: orbPos.x + 3,
        y: orbPos.y + 4,
        z: orbPos.z + 4
    };
    const focusTarget = {
        x: orbPos.x,
        y: orbPos.y + 0.5,
        z: orbPos.z
    };

    transitionToPosition(focusPosition, focusTarget, 1.0);

    // Show detail panel
    showDetailPanel(orbData);

    // Dim other elements
    setSceneDimming(true, orbId);
}

function exitFocus() {
    if (!StateManager.focusedOrb) return;

    StateManager.setFocusedOrb(null);

    // Return to overview
    transitionToPreset('overview', 1.0);

    // Hide detail panel
    hideDetailPanel();

    // Restore scene
    setSceneDimming(false, null);
}

function setSceneDimming(dimmed, exceptOrbId) {
    const dimOpacity = 0.3;
    const normalOpacity = 1.0;

    // Dim/restore unobservable orbs
    unobservableObjects.forEach(group => {
        const isException = group.userData.unobservable.id === exceptOrbId;
        const targetOpacity = dimmed && !isException ? dimOpacity : normalOpacity;

        group.children.forEach(child => {
            if (child.material && child.material.opacity !== undefined) {
                gsap.to(child.material, {
                    opacity: targetOpacity * (child.userData?.baseOpacity || child.material.opacity),
                    duration: 0.5
                });
            }
        });
    });

    // Dim light cone when focused
    if (lightCone && lightCone.material) {
        gsap.to(lightCone.material, {
            opacity: dimmed ? 0.03 : 0.15,
            duration: 0.5
        });
    }
}

function showDetailPanel(orbData) {
    const panel = document.getElementById('detailPanel');
    const title = document.getElementById('detailTitle');
    const symbol = document.getElementById('detailSymbol');
    const description = document.getElementById('detailDescription');

    if (!panel) return;

    symbol.textContent = orbData.symbol;
    title.textContent = orbData.title;
    description.textContent = orbData.description;

    panel.classList.add('visible');
}

function hideDetailPanel() {
    const panel = document.getElementById('detailPanel');
    if (panel) {
        panel.classList.remove('visible');
    }
}

// ============================================================
// Connection Lines
// ============================================================

function createConnectionLine(fromPosition, toPosition) {
    // Remove existing line
    removeConnectionLine();

    // Create curved path from orb to human
    const midPoint = new THREE.Vector3(
        (fromPosition.x + toPosition.x) / 2,
        Math.max(fromPosition.y, toPosition.y) + 1,
        (fromPosition.z + toPosition.z) / 2
    );

    const curve = new THREE.QuadraticBezierCurve3(
        fromPosition,
        midPoint,
        toPosition
    );

    const points = curve.getPoints(30);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineDashedMaterial({
        color: CONFIG.colors.unobservable,
        dashSize: 0.15,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.6
    });

    connectionLine = new THREE.Line(geometry, material);
    connectionLine.computeLineDistances();
    scene.add(connectionLine);
}

function removeConnectionLine() {
    if (connectionLine) {
        scene.remove(connectionLine);
        connectionLine.geometry.dispose();
        connectionLine.material.dispose();
        connectionLine = null;
    }
}

function updateConnectionLine() {
    // Show connection line when hovering OR when focused on an orb
    const activeOrb = StateManager.focusedOrb || hoveredUnobservable;

    if (activeOrb) {
        const orbObject = unobservableObjects.find(
            g => g.userData.unobservable.id === activeOrb
        );
        if (orbObject) {
            createConnectionLine(
                orbObject.position.clone(),
                humanFigurePosition.clone()
            );

            // Animate dash offset for flowing effect
            if (connectionLine && connectionLine.material) {
                connectionLine.material.dashOffset -= 0.02;
            }
        }
    } else {
        removeConnectionLine();
    }
}

// ============================================================
// Global variables
// ============================================================

let scene, camera, renderer, controls;
let humanFigurePosition = new THREE.Vector3(2, 0.8, 0); // Human figure center
let connectionLine = null; // For hover connection lines
let time = 0;
let mouse = { x: 0, y: 0 };
let mouseClient = { x: 0, y: 0 };
let hoveredUnobservable = null;
let unobservableObjects = [];
let labelElements = [];
let lightCone, humanGlow, aiEye, humanArm, humanBody;
let aiRobot = null; // Robot group for movement
let aiWheels = []; // Wheel meshes for rotation animation
let aiShield = null; // Legacy - removed from new design
let aiShieldMaterial = null; // Legacy - removed from new design
let aiHeadMaterial = null; // Legacy - replaced by aiInnerHeadMaterial
let aiEyeMaterial = null;
let aiRobotState = {
    targetPos: { x: -2, z: 0 },
    currentPos: { x: -2, z: 0 },
    phase: 'paused', // 'paused', 'turning', 'moving'
    phaseTimer: 0,
    pauseDuration: 2,
    turnDuration: 0.6, // Dynamic based on angle
    moveDuration: 3,
    startPos: { x: -2, z: 0 },
    // Head rotation tracking for smooth interpolation
    startHeadAngle: 0,
    targetHeadAngle: 0,
    currentHeadAngle: 0
};

// ============================================================
// Initialize
// ============================================================

function init() {
    console.log('Initializing Three.js scene...');

    // Detect performance and embed mode
    PerformanceMode.detect();

    try {
        // Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(CONFIG.colors.bg);
        scene.fog = new THREE.Fog(CONFIG.colors.bg, 15, 40);
        console.log('Scene created');

        // Camera - isometric corner view
        const aspect = window.innerWidth / window.innerHeight;
        camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        // Position at corner diagonal - adjusted to frame the full scene
        camera.position.set(12, 12, 14);
        // Note: camera.lookAt is managed by OrbitControls
        console.log('Camera created');

        // Renderer
        const canvas = document.getElementById('canvas');
        if (!canvas) {
            console.error('Canvas element not found!');
            return;
        }

        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        console.log('Renderer created');

        // OrbitControls for pan/tilt/zoom
        if (typeof THREE.OrbitControls !== 'undefined') {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.screenSpacePanning = true;
            controls.minDistance = 5;
            controls.maxDistance = 50;
            controls.maxPolarAngle = Math.PI / 2.1; // Prevent going below ground
            controls.target.set(2, 0, 0); // Look at center of scene
            controls.update();
            console.log('OrbitControls initialized');
        } else {
            console.warn('OrbitControls not available - using static camera');
            camera.lookAt(2, 0, 0);
        }

        // Lights - brighter for better visibility
        const ambient = new THREE.AmbientLight(0x606080, 1.2);
        scene.add(ambient);

        // Add directional light for better definition
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight.position.set(10, 15, 10);
        scene.add(dirLight);

        // Create scene elements
        createGround();
        createStreetLamp();
        createAIFigure();
        createHumanFigure();
        createUnobservables();
        createSceneLabels();
        createConstellationLines();

        // Events
        setupEvents();

        // Apply performance optimizations
        PerformanceMode.apply();

        // Start animation
        animate();

        // UI intro
        playIntro();

        console.log('Initialization complete!');

    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// ============================================================
// Ground
// ============================================================

function createGround() {
    const groundGeom = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.ground,
        roughness: 0.9,
        metalness: 0.1,
    });

    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid - more visible
    const grid = new THREE.GridHelper(30, 40, 0x3a3a48, 0x2a2a38);
    grid.position.y = 0.01;
    scene.add(grid);

    console.log('Ground created');
}

// ============================================================
// Street Lamp
// ============================================================

function createStreetLamp() {
    const lampGroup = new THREE.Group();

    // Post
    const postGeom = new THREE.CylinderGeometry(0.08, 0.12, 4, 8);
    const postMat = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.lampPost,
        roughness: 0.6,
        metalness: 0.4,
    });
    const post = new THREE.Mesh(postGeom, postMat);
    post.position.y = 2;
    post.castShadow = true;
    lampGroup.add(post);

    // Arm
    const armGeom = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6);
    const arm = new THREE.Mesh(armGeom, postMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.5, 3.8, 0);
    lampGroup.add(arm);

    // Housing
    const housingGeom = new THREE.ConeGeometry(0.4, 0.5, 8);
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    const housing = new THREE.Mesh(housingGeom, housingMat);
    housing.position.set(1, 3.6, 0);
    lampGroup.add(housing);

    // Bulb
    const bulbGeom = new THREE.SphereGeometry(0.15, 16, 16);
    const bulbMat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.lampLight });
    const bulb = new THREE.Mesh(bulbGeom, bulbMat);
    bulb.position.set(1, 3.35, 0);
    lampGroup.add(bulb);

    // Spot light - brighter
    const spotLight = new THREE.SpotLight(CONFIG.colors.lampGlow, 4);
    spotLight.position.set(1, 3.3, 0);
    spotLight.angle = Math.PI / 3.5;
    spotLight.penumbra = 0.4;
    spotLight.decay = 1.2;
    spotLight.distance = 18;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.target.position.set(1, 0, 0);
    lampGroup.add(spotLight);
    lampGroup.add(spotLight.target);

    // Point light for glow
    const pointLight = new THREE.PointLight(CONFIG.colors.lampLight, 0.8, 8);
    pointLight.position.set(1, 3.3, 0);
    lampGroup.add(pointLight);

    lampGroup.position.set(-3, 0, 0);
    scene.add(lampGroup);

    // Light cone visual
    createLightCone();

    console.log('Street lamp created');
}

function createLightCone() {
    // Cone starts at lamp bulb and expands DOWN to ground
    // Lamp bulb is at world position (-2, 3.35, 0)
    const coneHeight = 3.35;
    const coneRadius = 3.5;

    const coneGeom = new THREE.ConeGeometry(coneRadius, coneHeight, 32, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
        color: CONFIG.colors.lampGlow,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    lightCone = new THREE.Mesh(coneGeom, coneMat);
    // Position so tip is at bulb (y=3.35) and base is at ground (y=0)
    // Cone center needs to be at y = coneHeight/2
    lightCone.position.set(-2, coneHeight / 2, 0);
    // No rotation needed - cone tip points UP by default, which is towards lamp
    scene.add(lightCone);

    // Ground circle - matches cone base, this is AI's observable domain
    const circleGeom = new THREE.CircleGeometry(coneRadius, 32);
    const circleMat = new THREE.MeshBasicMaterial({
        color: CONFIG.colors.lampGlow,
        transparent: true,
        opacity: 0.2,
    });
    const circle = new THREE.Mesh(circleGeom, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(-2, 0.02, 0);
    scene.add(circle);

    // Create dust particles in light beam
    createDustParticles();
}

// ============================================================
// Dust Particles in Light Beam
// ============================================================

let dustParticles = null;
let dustVelocities = [];

function createDustParticles() {
    const count = 50; // Reduced from 150 for subtler effect
    const positions = new Float32Array(count * 3);
    dustVelocities = [];

    // Light cone parameters: center at (-2, 0, 0), radius 3.5 at ground, height 3.35
    // Lamp bulb is at top (y = 3.35), cone spreads down to ground (y = 0)
    const coneCenter = new THREE.Vector3(-2, 0, 0);
    const coneRadius = 3.5;
    const coneHeight = 3.35;

    for (let i = 0; i < count; i++) {
        // Random position within cone (start scattered throughout)
        const y = Math.random() * coneHeight;
        const radiusAtHeight = coneRadius * (1 - y / coneHeight);
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * radiusAtHeight;

        positions[i * 3] = coneCenter.x + Math.cos(angle) * r;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = coneCenter.z + Math.sin(angle) * r;

        // Velocity: slow drift DOWNWARD from lamp, spreading outward to fill cone
        const outwardSpeed = (Math.random() * 0.001 + 0.0008); // Slower radial expansion
        dustVelocities.push({
            angle: angle,
            outwardSpeed: outwardSpeed,
            y: -(Math.random() * 0.002 + 0.001), // Slower downward drift
        });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: CONFIG.colors.lampLight,
        size: 0.03,
        transparent: true,
        opacity: 0.5,
        sizeAttenuation: true,
        depthWrite: false
    });

    dustParticles = new THREE.Points(geometry, material);
    scene.add(dustParticles);

    console.log('Dust particles created');
}

function updateDustParticles() {
    if (!dustParticles) return;

    const positions = dustParticles.geometry.attributes.position.array;
    const coneCenter = new THREE.Vector3(-2, 0, 0);
    const coneRadius = 3.5;
    const coneHeight = 3.35;

    for (let i = 0; i < dustVelocities.length; i++) {
        const vel = dustVelocities[i];

        // Get current position relative to cone center
        const x = positions[i * 3] - coneCenter.x;
        const z = positions[i * 3 + 2] - coneCenter.z;
        const currentRadius = Math.sqrt(x * x + z * z);

        // Move outward radially (spread to fill cone)
        const newRadius = currentRadius + vel.outwardSpeed;
        if (currentRadius > 0.01) {
            positions[i * 3] = coneCenter.x + (x / currentRadius) * newRadius;
            positions[i * 3 + 2] = coneCenter.z + (z / currentRadius) * newRadius;
        } else {
            // If at center, pick a direction based on stored angle
            positions[i * 3] = coneCenter.x + Math.cos(vel.angle) * newRadius;
            positions[i * 3 + 2] = coneCenter.z + Math.sin(vel.angle) * newRadius;
        }

        // Move downward
        positions[i * 3 + 1] += vel.y;

        const y = positions[i * 3 + 1];
        const maxRadiusAtHeight = coneRadius * (1 - y / coneHeight);

        // Reset if particle hits ground OR exceeds cone boundary
        if (y < 0 || newRadius > maxRadiusAtHeight) {
            // Respawn near the lamp bulb (top of cone, small radius)
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 0.3; // Start with small radius near bulb
            positions[i * 3] = coneCenter.x + Math.cos(angle) * r;
            positions[i * 3 + 1] = coneHeight - 0.1; // Just below the bulb
            positions[i * 3 + 2] = coneCenter.z + Math.sin(angle) * r;

            // New velocity (slow drift)
            vel.angle = angle;
            vel.outwardSpeed = (Math.random() * 0.001 + 0.0008);
            vel.y = -(Math.random() * 0.002 + 0.001);
        }
    }

    dustParticles.geometry.attributes.position.needsUpdate = true;
}

// ============================================================
// Constellation Mode (lines connecting orbs when zoomed out)
// ============================================================

let constellationLines = null;

function createConstellationLines() {
    // Define connections between orbs (pairs of indices)
    const connections = [
        [0, 2], [2, 5], [5, 7], // Main arc
        [1, 3], [3, 4], [4, 6], // Secondary arc
        [0, 1], [2, 3], [5, 6], // Cross connections
    ];

    const points = [];
    connections.forEach(([a, b]) => {
        if (unobservableObjects[a] && unobservableObjects[b]) {
            points.push(unobservableObjects[a].position.clone());
            points.push(unobservableObjects[b].position.clone());
        }
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: CONFIG.colors.unobservable,
        transparent: true,
        opacity: 0,
        depthWrite: false
    });

    constellationLines = new THREE.LineSegments(geometry, material);
    scene.add(constellationLines);
}

function updateConstellationLines() {
    if (!constellationLines || !camera) return;

    // Calculate camera distance from scene center
    const sceneCenter = new THREE.Vector3(2, 0, 0);
    const distance = camera.position.distanceTo(sceneCenter);

    // Show constellation when zoomed out (distance > 20)
    const fadeStart = 18;
    const fadeEnd = 25;

    let targetOpacity = 0;
    if (distance > fadeStart) {
        targetOpacity = Math.min((distance - fadeStart) / (fadeEnd - fadeStart), 0.3);
    }

    // Smooth transition
    const currentOpacity = constellationLines.material.opacity;
    constellationLines.material.opacity = currentOpacity + (targetOpacity - currentOpacity) * 0.05;

    // Update line positions based on orb positions
    const positions = constellationLines.geometry.attributes.position.array;
    const connections = [
        [0, 2], [2, 5], [5, 7],
        [1, 3], [3, 4], [4, 6],
        [0, 1], [2, 3], [5, 6],
    ];

    let idx = 0;
    connections.forEach(([a, b]) => {
        if (unobservableObjects[a] && unobservableObjects[b]) {
            const posA = unobservableObjects[a].position;
            const posB = unobservableObjects[b].position;
            positions[idx++] = posA.x;
            positions[idx++] = posA.y;
            positions[idx++] = posA.z;
            positions[idx++] = posB.x;
            positions[idx++] = posB.y;
            positions[idx++] = posB.z;
        }
    });

    constellationLines.geometry.attributes.position.needsUpdate = true;
}

// ============================================================
// Proximity Glow (orbs glow brighter when camera is close)
// ============================================================

function updateProximityGlow() {
    if (!camera || unobservableObjects.length === 0) return;

    unobservableObjects.forEach(group => {
        const distance = camera.position.distanceTo(group.position);

        // Closer = brighter (between 3 and 15 units)
        const minDist = 3;
        const maxDist = 15;
        const normalizedDist = Math.max(0, Math.min(1, (distance - minDist) / (maxDist - minDist)));

        // Inverse: closer = higher intensity
        const glowIntensity = 1 - normalizedDist;

        // Apply to glow sphere (second child)
        const glow = group.children[1];
        if (glow && glow.material) {
            const baseOpacity = 0.12;
            const maxOpacity = 0.35;
            glow.material.opacity = baseOpacity + glowIntensity * (maxOpacity - baseOpacity);
        }
    });
}

// ============================================================
// AI Figure - R4X Robot
// ============================================================

// Store references for animations
let aiBodyMesh = null;
let aiInnerHead = null;
let aiInnerHeadMaterial = null;
let aiGlassDome = null;
let aiEyeLeft = null;
let aiEyeRight = null;
let aiEyeLookTarget = { x: 0, y: 0 };
let aiAntenna1 = null;
let aiAntenna2 = null;
let aiGradientOffset = 0;
let aiHeadGroup = null; // Head group for rotation
let aiTargetHeadAngle = 0; // Target angle for head to face

function createAIFigure() {
    aiRobot = new THREE.Group();
    aiWheels = [];

    // ===== PROPORTIONS (head ~65-70% of body size) =====
    const bodyRadius = 0.32;
    const headOuterRadius = 0.22;
    const headInnerRadius = 0.18;

    // ===== BODY TEXTURE (speckle pattern) =====
    const bodyCanvas = document.createElement('canvas');
    bodyCanvas.width = 512;
    bodyCanvas.height = 512;
    const ctx = bodyCanvas.getContext('2d');

    // Base color #BEBEBE
    ctx.fillStyle = '#BEBEBE';
    ctx.fillRect(0, 0, 512, 512);

    // Dark speckles
    for (let i = 0; i < 400; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const radius = Math.random() * 1.5 + 0.5;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(60, 60, 60, ${Math.random() * 0.35 + 0.1})`;
        ctx.fill();
    }

    // Light speckles
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const radius = Math.random() * 2 + 1;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210, 210, 210, ${Math.random() * 0.25 + 0.1})`;
        ctx.fill();
    }

    const bodyTexture = new THREE.CanvasTexture(bodyCanvas);

    // Body material
    const bodyMat = new THREE.MeshStandardMaterial({
        map: bodyTexture,
        color: 0xBEBEBE,
        roughness: 0.55,
        metalness: 0.12,
    });

    // ===== INNER HEAD SHADER MATERIAL (smooth animated gradient) =====
    aiInnerHeadMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
        },
        vertexShader: `
            varying vec3 vPosition;
            void main() {
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            varying vec3 vPosition;

            vec3 hsl2rgb(float h, float s, float l) {
                vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
                return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
            }

            void main() {
                // Use Z position for back-to-front gradient (no seam)
                float t = vPosition.z * 2.5 + 0.5 + uTime * 0.15; // Slower animation

                // Smooth color cycling through spectrum
                float hue = mod(t * 0.6 + 0.75, 1.0);
                vec3 color = hsl2rgb(hue, 0.75, 0.55);

                gl_FragColor = vec4(color, 1.0);
            }
        `,
    });

    // Glass dome material (transparent outer shell)
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.25,
        roughness: 0.05,
        metalness: 0.1,
        side: THREE.DoubleSide,
    });

    // Collar material (rubber/silicone look)
    const collarMat = new THREE.MeshStandardMaterial({
        color: 0x555555, // Darker gray like rubber
        roughness: 0.7, // Matte rubber finish
        metalness: 0.0, // No metallic sheen
    });

    // Antenna material
    const antennaMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.4,
        metalness: 0.3,
    });

    // Eye material
    aiEyeMaterial = new THREE.MeshBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.9,
    });

    // ===== BODY (large sphere that rolls) =====
    const bodyGeom = new THREE.SphereGeometry(bodyRadius, 64, 64);
    aiBodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    aiBodyMesh.position.y = bodyRadius;
    aiBodyMesh.castShadow = true;
    aiBodyMesh.receiveShadow = true;
    aiRobot.add(aiBodyMesh);

    // ===== COLLAR (rubber gasket that holds both spheres) =====
    // Use a torus to create the rubber/silicone look that wraps around the junction
    const collarTubeRadius = 0.035; // Thickness of the rubber ring
    const collarMajorRadius = bodyRadius * 0.38; // Distance from center to tube center

    // Position collar so it overlaps with both body (below) and head (above)
    // This creates the "tucking in" effect
    const collarY = bodyRadius * 2 - collarTubeRadius * 0.3; // Slightly embedded in body top

    const collarGeom = new THREE.TorusGeometry(collarMajorRadius, collarTubeRadius, 24, 48);
    const collar = new THREE.Mesh(collarGeom, collarMat);
    collar.rotation.x = Math.PI / 2; // Lay flat (torus is vertical by default)
    collar.position.y = collarY;
    collar.castShadow = true;
    collar.receiveShadow = true;
    aiRobot.add(collar);

    // ===== HEAD ASSEMBLY (glass dome + inner sphere) =====
    aiHeadGroup = new THREE.Group();
    // Position head so it sits just above the collar, slightly embedded
    aiHeadGroup.position.y = collarY + collarTubeRadius * 0.5 + headOuterRadius * 0.85;

    // Glass dome (outer transparent shell)
    const glassDomeGeom = new THREE.SphereGeometry(headOuterRadius, 48, 48);
    aiGlassDome = new THREE.Mesh(glassDomeGeom, glassMat);
    aiHeadGroup.add(aiGlassDome);

    // Inner gradient sphere
    const innerHeadGeom = new THREE.SphereGeometry(headInnerRadius, 48, 48);
    aiInnerHead = new THREE.Mesh(innerHeadGeom, aiInnerHeadMaterial);
    aiHeadGroup.add(aiInnerHead);

    // ===== EYES (simple torus scaled to be oval/capsule shaped) =====
    const eyeOutlineMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
    });
    aiEyeMaterial = eyeOutlineMat;

    // Simple torus, scaled to be taller than wide (capsule-like)
    const eyeRadius = 0.018;
    const eyeTube = 0.004;
    const eyeGeom = new THREE.TorusGeometry(eyeRadius, eyeTube, 8, 32);

    // Position eyes on front of inner sphere, facing forward
    const eyeY = 0;
    const eyeZ = headInnerRadius + 0.001; // Just outside the sphere surface
    const eyeSpacing = 0.045;

    aiEyeLeft = new THREE.Mesh(eyeGeom, eyeOutlineMat);
    aiEyeLeft.scale.set(0.6, 1.4, 1); // Narrower and taller (capsule shape)
    aiEyeLeft.position.set(-eyeSpacing, eyeY, eyeZ);
    aiHeadGroup.add(aiEyeLeft);

    aiEyeRight = new THREE.Mesh(eyeGeom, eyeOutlineMat);
    aiEyeRight.scale.set(0.6, 1.4, 1);
    aiEyeRight.position.set(eyeSpacing, eyeY, eyeZ);
    aiHeadGroup.add(aiEyeRight);

    aiRobot.add(aiHeadGroup);

    // ===== ANTENNA EARS (circular cap with antenna like cordless phone) =====
    // Cap - circular disc attached to side of helmet
    const capRadius = 0.022;
    const capThickness = 0.01;
    const capGeom = new THREE.CylinderGeometry(capRadius, capRadius, capThickness, 16);

    // Antenna - thin cylinder extending from cap
    const antennaLength = 0.07; // Double length
    const antennaRadius = 0.004;
    const antennaGeom = new THREE.CylinderGeometry(antennaRadius * 0.6, antennaRadius, antennaLength, 8);

    // Left antenna assembly - added to headGroup so it rotates with head
    aiAntenna1 = new THREE.Group();
    const leftCap = new THREE.Mesh(capGeom, antennaMat);
    leftCap.rotation.z = Math.PI / 2; // Flat against head
    aiAntenna1.add(leftCap);
    const leftAntenna = new THREE.Mesh(antennaGeom, antennaMat);
    // Point straight up from the cap
    leftAntenna.position.set(0, antennaLength / 2, 0);
    aiAntenna1.add(leftAntenna);
    // Position relative to headGroup (Y=0 since headGroup is already at head height)
    aiAntenna1.position.set(-headOuterRadius - capThickness / 2, 0, 0);
    aiHeadGroup.add(aiAntenna1);

    // Right antenna assembly - added to headGroup so it rotates with head
    aiAntenna2 = new THREE.Group();
    const rightCap = new THREE.Mesh(capGeom, antennaMat);
    rightCap.rotation.z = Math.PI / 2; // Flat against head
    aiAntenna2.add(rightCap);
    const rightAntenna = new THREE.Mesh(antennaGeom, antennaMat);
    // Point straight up from the cap
    rightAntenna.position.set(0, antennaLength / 2, 0);
    aiAntenna2.add(rightAntenna);
    // Position relative to headGroup (Y=0 since headGroup is already at head height)
    aiAntenna2.position.set(headOuterRadius + capThickness / 2, 0, 0);
    aiHeadGroup.add(aiAntenna2);

    // Store eye reference for legacy code
    aiEye = { left: aiEyeLeft, right: aiEyeRight, material: aiEyeMaterial };

    // Position robot in lamp light area
    aiRobot.position.set(-2, 0, 0);
    scene.add(aiRobot);

    createLabel('AI', new THREE.Vector3(-2, 1.8, 0), '#22d3ee');

    console.log('AI R4X robot created with glass dome head');
}

// Lamp pole position (avoid this area)
const LAMP_POLE_POS = { x: -3, z: 0 };
const LAMP_POLE_RADIUS = 0.5; // Avoidance radius around pole

// Check if a path from start to end crosses near the lamp pole
function pathCrossesLampPole(startX, startZ, endX, endZ) {
    // Check if direct line passes too close to lamp pole
    const dx = endX - startX;
    const dz = endZ - startZ;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) return false;

    // Normalized direction
    const dirX = dx / len;
    const dirZ = dz / len;

    // Vector from start to lamp pole
    const toPolX = LAMP_POLE_POS.x - startX;
    const toPolZ = LAMP_POLE_POS.z - startZ;

    // Project lamp pole onto line
    const proj = toPolX * dirX + toPolZ * dirZ;

    // Clamp to segment
    const clampedProj = Math.max(0, Math.min(len, proj));

    // Closest point on segment to lamp pole
    const closestX = startX + dirX * clampedProj;
    const closestZ = startZ + dirZ * clampedProj;

    // Distance from closest point to lamp pole
    const distX = closestX - LAMP_POLE_POS.x;
    const distZ = closestZ - LAMP_POLE_POS.z;
    const dist = Math.sqrt(distX * distX + distZ * distZ);

    return dist < LAMP_POLE_RADIUS;
}

// Pick a random patrol point within the light cone area, avoiding lamp pole
function pickNewPatrolTarget() {
    // Light cone area: roughly x from -5 to 1, z from -2.5 to 2.5
    const currentX = aiRobotState.currentPos.x;
    const currentZ = aiRobotState.currentPos.z;

    // Try up to 10 times to find a valid target
    for (let attempts = 0; attempts < 10; attempts++) {
        const x = -4.5 + Math.random() * 4; // -4.5 to -0.5
        const z = -1.8 + Math.random() * 3.6; // -1.8 to 1.8

        // Check if point is too close to lamp pole
        const distToPole = Math.sqrt(
            (x - LAMP_POLE_POS.x) ** 2 + (z - LAMP_POLE_POS.z) ** 2
        );
        if (distToPole < LAMP_POLE_RADIUS) continue;

        // Check if path would cross lamp pole
        if (pathCrossesLampPole(currentX, currentZ, x, z)) continue;

        return { x, z };
    }

    // Fallback: return a safe point away from pole
    return { x: -1, z: 1.5 };
}

// Smooth ease-in-out curve (cubic)
function smoothEase(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Normalize angle to [-PI, PI]
function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

// Update robot patrol movement
function updateAIRobotMovement(deltaTime) {
    if (!aiRobot) return;

    const bodyRadius = 0.32; // Must match createAIFigure
    const time = Date.now() * 0.001; // Time in seconds for organic movement

    // ===== ANIMATE GRADIENT (shader uniform) =====
    if (aiInnerHeadMaterial && aiInnerHeadMaterial.uniforms) {
        aiInnerHeadMaterial.uniforms.uTime.value += deltaTime;
    }

    // ===== GENTLE ANTENNA BREATHING (always, varies by phase) =====
    if (aiAntenna1 && aiAntenna2) {
        let swayAmount, swaySpeed;
        if (aiRobotState.phase === 'paused') {
            swayAmount = 0.04;
            swaySpeed = 0.002;
        } else if (aiRobotState.phase === 'turning') {
            swayAmount = 0.05;
            swaySpeed = 0.003;
        } else {
            swayAmount = 0.06;
            swaySpeed = 0.008;
        }
        const sway1 = Math.sin(time * swaySpeed * 1000) * swayAmount;
        const sway2 = Math.sin(time * swaySpeed * 1000 + 0.5) * swayAmount * 0.8;
        aiAntenna1.rotation.x = sway1;
        aiAntenna2.rotation.x = sway2;
    }

    // ===== PHASE: PAUSED =====
    if (aiRobotState.phase === 'paused') {
        aiRobotState.phaseTimer += deltaTime;

        // Gentle eye look-around while paused
        if (aiInnerHead) {
            const lookX = Math.sin(time * 0.4) * 0.12;
            const lookY = Math.cos(time * 0.5) * 0.08;
            aiInnerHead.rotation.y = lookX;
            aiInnerHead.rotation.x = lookY;
        }

        // Transition to turning when pause is complete
        if (aiRobotState.phaseTimer >= aiRobotState.pauseDuration) {
            // Pick new target
            aiRobotState.startPos = { ...aiRobotState.currentPos };
            aiRobotState.targetPos = pickNewPatrolTarget();

            // Calculate direction and angles
            const dx = aiRobotState.targetPos.x - aiRobotState.startPos.x;
            const dz = aiRobotState.targetPos.z - aiRobotState.startPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            // Store current head angle and calculate target
            aiRobotState.startHeadAngle = aiRobotState.currentHeadAngle;
            aiRobotState.targetHeadAngle = Math.atan2(dx, dz);

            // Calculate turn amount (normalized)
            const angleDiff = Math.abs(normalizeAngle(
                aiRobotState.targetHeadAngle - aiRobotState.startHeadAngle
            ));

            // Dynamic turn duration: more time for larger turns (0.4 to 1.0 seconds)
            aiRobotState.turnDuration = 0.4 + (angleDiff / Math.PI) * 0.6;

            // Move duration based on distance
            aiRobotState.moveDuration = 2.0 + dist * 0.6;

            // Next pause duration
            aiRobotState.pauseDuration = 1.8 + Math.random() * 1.5;

            // Transition to turning
            aiRobotState.phase = 'turning';
            aiRobotState.phaseTimer = 0;
        }
    }

    // ===== PHASE: TURNING =====
    else if (aiRobotState.phase === 'turning') {
        aiRobotState.phaseTimer += deltaTime;
        const t = Math.min(aiRobotState.phaseTimer / aiRobotState.turnDuration, 1);

        // Smooth eased head rotation
        const eased = smoothEase(t);

        // Calculate the shortest rotation path
        let angleDiff = normalizeAngle(
            aiRobotState.targetHeadAngle - aiRobotState.startHeadAngle
        );

        // Interpolate head angle smoothly
        aiRobotState.currentHeadAngle = aiRobotState.startHeadAngle + angleDiff * eased;

        // Apply to head group
        if (aiHeadGroup) {
            aiHeadGroup.rotation.y = aiRobotState.currentHeadAngle;
        }

        // Eyes settle to forward during turn
        if (aiInnerHead) {
            aiInnerHead.rotation.y *= 0.92;
            aiInnerHead.rotation.x *= 0.92;
        }

        // Transition to moving when turn complete
        if (t >= 1) {
            aiRobotState.phase = 'moving';
            aiRobotState.phaseTimer = 0;
        }
    }

    // ===== PHASE: MOVING =====
    else if (aiRobotState.phase === 'moving') {
        aiRobotState.phaseTimer += deltaTime;
        const t = Math.min(aiRobotState.phaseTimer / aiRobotState.moveDuration, 1);

        // Smooth eased movement
        const eased = smoothEase(t);

        // Store previous position for rolling
        const prevX = aiRobotState.currentPos.x;
        const prevZ = aiRobotState.currentPos.z;

        // Interpolate position
        aiRobotState.currentPos.x = aiRobotState.startPos.x +
            (aiRobotState.targetPos.x - aiRobotState.startPos.x) * eased;
        aiRobotState.currentPos.z = aiRobotState.startPos.z +
            (aiRobotState.targetPos.z - aiRobotState.startPos.z) * eased;

        // Update robot position
        aiRobot.position.x = aiRobotState.currentPos.x;
        aiRobot.position.z = aiRobotState.currentPos.z;

        // ===== BODY ROLLING =====
        if (aiBodyMesh) {
            const moveX = aiRobotState.currentPos.x - prevX;
            const moveZ = aiRobotState.currentPos.z - prevZ;
            const moveDistance = Math.sqrt(moveX * moveX + moveZ * moveZ);

            if (moveDistance > 0.0001) {
                const rollAngle = moveDistance / bodyRadius;
                const moveDir = new THREE.Vector3(moveX, 0, moveZ).normalize();
                const rollAxis = new THREE.Vector3(-moveDir.z, 0, moveDir.x);

                const quaternion = new THREE.Quaternion();
                quaternion.setFromAxisAngle(rollAxis, rollAngle);
                aiBodyMesh.quaternion.premultiply(quaternion);
            }
        }

        // Eyes stay centered while moving
        if (aiInnerHead) {
            aiInnerHead.rotation.y *= 0.95;
            aiInnerHead.rotation.x *= 0.95;
        }

        // Transition to paused when movement complete
        if (t >= 1) {
            aiRobotState.phase = 'paused';
            aiRobotState.phaseTimer = 0;
        }
    }
}

// ============================================================
// Human Figure (3D Model with Walk Animation)
// ============================================================

let humanModel = null;
let humanMixer = null;
let humanWalkAction = null;
let humanMaterial = null; // Keep for compatibility
let humanModelYOffset = 0; // Y offset to keep feet on ground

// Human patrol state (similar to AI robot)
const HUMAN_AREA_CENTER = { x: 3.5, z: 0 };
const HUMAN_AREA_RADIUS = 2.8; // Slightly smaller than perception circle

let humanState = {
    phase: 'paused', // 'paused', 'turning', 'moving'
    phaseTimer: 0,
    pauseDuration: 2.5,
    turnDuration: 0.5,
    moveDuration: 3,
    startPos: { x: 3.5, z: 0 },
    currentPos: { x: 3.5, z: 0 },
    targetPos: { x: 3.5, z: 0 },
    startAngle: 0,
    currentAngle: 0,
    targetAngle: 0
};

// Pick a random patrol point within human perception area
function pickHumanPatrolTarget() {
    for (let attempts = 0; attempts < 10; attempts++) {
        // Random point within the human area
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * HUMAN_AREA_RADIUS;
        const x = HUMAN_AREA_CENTER.x + Math.cos(angle) * radius;
        const z = HUMAN_AREA_CENTER.z + Math.sin(angle) * radius;

        // Ensure some minimum distance from current position
        const dx = x - humanState.currentPos.x;
        const dz = z - humanState.currentPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.8) {
            return { x, z };
        }
    }
    // Fallback
    return { x: HUMAN_AREA_CENTER.x, z: 1 };
}

// Update human patrol movement
function updateHumanMovement(deltaTime) {
    if (!humanModel) return;

    // Update animation mixer
    if (humanMixer) {
        humanMixer.update(deltaTime);
    }

    const time = Date.now() * 0.001;

    // ===== PHASE: PAUSED =====
    if (humanState.phase === 'paused') {
        humanState.phaseTimer += deltaTime;

        // Stop walk animation when paused
        if (humanWalkAction && humanWalkAction.isRunning()) {
            humanWalkAction.paused = true;
        }

        // Transition to turning when pause is complete
        if (humanState.phaseTimer >= humanState.pauseDuration) {
            humanState.startPos = { ...humanState.currentPos };
            humanState.targetPos = pickHumanPatrolTarget();

            const dx = humanState.targetPos.x - humanState.startPos.x;
            const dz = humanState.targetPos.z - humanState.startPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            humanState.startAngle = humanState.currentAngle;
            humanState.targetAngle = Math.atan2(dx, dz);

            // Normalize angle difference
            let angleDiff = humanState.targetAngle - humanState.startAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            humanState.turnDuration = 0.3 + (Math.abs(angleDiff) / Math.PI) * 0.5;
            humanState.moveDuration = 2.5 + dist * 0.5;
            humanState.pauseDuration = 2.0 + Math.random() * 2.0;

            humanState.phase = 'turning';
            humanState.phaseTimer = 0;
        }
    }

    // ===== PHASE: TURNING =====
    else if (humanState.phase === 'turning') {
        humanState.phaseTimer += deltaTime;
        const t = Math.min(humanState.phaseTimer / humanState.turnDuration, 1);
        const eased = smoothEase(t);

        let angleDiff = normalizeAngle(humanState.targetAngle - humanState.startAngle);
        humanState.currentAngle = humanState.startAngle + angleDiff * eased;

        if (humanModel) {
            humanModel.rotation.y = humanState.currentAngle;
        }

        if (t >= 1) {
            humanState.phase = 'moving';
            humanState.phaseTimer = 0;

            // Start walk animation
            if (humanWalkAction) {
                humanWalkAction.paused = false;
                if (!humanWalkAction.isRunning()) {
                    humanWalkAction.play();
                }
            }
        }
    }

    // ===== PHASE: MOVING =====
    else if (humanState.phase === 'moving') {
        humanState.phaseTimer += deltaTime;
        const t = Math.min(humanState.phaseTimer / humanState.moveDuration, 1);
        const eased = smoothEase(t);

        humanState.currentPos.x = humanState.startPos.x +
            (humanState.targetPos.x - humanState.startPos.x) * eased;
        humanState.currentPos.z = humanState.startPos.z +
            (humanState.targetPos.z - humanState.startPos.z) * eased;

        if (humanModel) {
            humanModel.position.x = humanState.currentPos.x;
            humanModel.position.y = humanModelYOffset; // Keep feet on ground
            humanModel.position.z = humanState.currentPos.z;
        }

        // ===== ORGANIC WALKING ANIMATION =====
        // Walk cycle with smooth, natural motion
        const walkSpeed = 3.5; // Slightly slower for more natural feel
        const walkCycle = time * walkSpeed;

        // Primary motion curves (using sine for smooth oscillation)
        const legPhase = Math.sin(walkCycle);
        const legPhaseOffset = Math.sin(walkCycle + Math.PI); // Opposite leg

        // Leg swing with asymmetric forward/back motion
        const legSwingForward = 0.35; // Forward swing amplitude
        const legSwingBack = 0.25; // Back swing (smaller for natural gait)
        const leftLegSwing = legPhase > 0 ? legPhase * legSwingForward : legPhase * legSwingBack;
        const rightLegSwing = legPhaseOffset > 0 ? legPhaseOffset * legSwingForward : legPhaseOffset * legSwingBack;

        // Knee bend (calves bend more when leg swings back)
        const leftKneeBend = Math.max(0, -legPhase) * 0.5; // Bend when swinging back
        const rightKneeBend = Math.max(0, -legPhaseOffset) * 0.5;

        // Arm swing (opposite to legs, slightly delayed)
        const armPhase = Math.sin(walkCycle + 0.2);
        const armPhaseOffset = Math.sin(walkCycle + Math.PI + 0.2);
        const armSwing = 0.25;

        // Forearm bend (natural arm bend while walking)
        const forearmBend = 0.3; // Base bend
        const leftForearmExtra = Math.max(0, armPhase) * 0.2;
        const rightForearmExtra = Math.max(0, armPhaseOffset) * 0.2;

        // Torso motion
        const torsoTwist = Math.sin(walkCycle) * 0.04; // Subtle shoulder rotation
        const torsoSway = Math.sin(walkCycle) * 0.02; // Side-to-side lean
        const torsoLean = 0.03; // Slight forward lean while walking

        // Head motion (counter-rotation to keep looking forward)
        const headCounter = -torsoTwist * 0.5;

        // Hip drop (weight shift)
        const hipDrop = Math.sin(walkCycle) * 0.01;

        // Apply leg rotations with knee bend
        if (humanLeftLeg) {
            humanLeftLeg.rotation.x = leftLegSwing;
            humanLeftLeg.rotation.z = hipDrop * 0.3; // Slight outward rotation
        }
        if (humanRightLeg) {
            humanRightLeg.rotation.x = rightLegSwing;
            humanRightLeg.rotation.z = -hipDrop * 0.3;
        }

        // Apply calf (knee) bend
        if (humanLeftCalf) {
            humanLeftCalf.rotation.x = leftKneeBend;
        }
        if (humanRightCalf) {
            humanRightCalf.rotation.x = rightKneeBend;
        }

        // Apply arm rotations
        if (humanLeftArm) {
            humanLeftArm.rotation.x = -armPhase * armSwing;
            humanLeftArm.rotation.z = 0.08; // Slight outward angle
        }
        if (humanRightArm) {
            humanRightArm.rotation.x = -armPhaseOffset * armSwing;
            humanRightArm.rotation.z = -0.08;
        }

        // Apply forearm bend
        if (humanLeftForearm) {
            humanLeftForearm.rotation.x = -(forearmBend + leftForearmExtra);
        }
        if (humanRightForearm) {
            humanRightForearm.rotation.x = -(forearmBend + rightForearmExtra);
        }

        // Apply torso motion
        if (humanTorso) {
            humanTorso.rotation.y = torsoTwist;
            humanTorso.rotation.z = torsoSway;
            humanTorso.rotation.x = torsoLean;
        }

        // Apply head motion (counter-rotation only, bob is handled via body)
        if (humanHead) {
            humanHead.rotation.y = headCounter;
        }

        // Body bob (up/down motion synced with steps)
        // Double frequency because we bob twice per full walk cycle
        if (humanModel) {
            const bobPhase = Math.abs(Math.sin(walkCycle * 2));
            const bobOffset = bobPhase * 0.012;
            humanModel.position.y = humanModelYOffset + bobOffset;
        }

        // Update humanFigurePosition for other systems
        humanFigurePosition.x = humanState.currentPos.x;
        humanFigurePosition.z = humanState.currentPos.z;

        if (t >= 1) {
            humanState.phase = 'paused';
            humanState.phaseTimer = 0;

            // Reset all limbs to neutral position
            if (humanLeftLeg) { humanLeftLeg.rotation.x = 0; humanLeftLeg.rotation.z = 0; }
            if (humanRightLeg) { humanRightLeg.rotation.x = 0; humanRightLeg.rotation.z = 0; }
            if (humanLeftCalf) humanLeftCalf.rotation.x = 0;
            if (humanRightCalf) humanRightCalf.rotation.x = 0;
            if (humanLeftArm) { humanLeftArm.rotation.x = 0; humanLeftArm.rotation.z = 0.08; }
            if (humanRightArm) { humanRightArm.rotation.x = 0; humanRightArm.rotation.z = -0.08; }
            if (humanLeftForearm) humanLeftForearm.rotation.x = -0.15;
            if (humanRightForearm) humanRightForearm.rotation.x = -0.15;
            if (humanTorso) { humanTorso.rotation.x = 0; humanTorso.rotation.y = 0; humanTorso.rotation.z = 0; }
            if (humanHead) humanHead.rotation.y = 0;
        }
    }
}

function createHumanFigure() {
    // Human perception area - ground circle
    const humanPerceptionGeom = new THREE.CircleGeometry(3.5, 32);
    const humanPerceptionMat = new THREE.MeshBasicMaterial({
        color: CONFIG.colors.human,
        transparent: true,
        opacity: 0.1,
    });
    const humanPerception = new THREE.Mesh(humanPerceptionGeom, humanPerceptionMat);
    humanPerception.rotation.x = -Math.PI / 2;
    humanPerception.position.set(3.5, 0.03, 0);
    scene.add(humanPerception);

    // Use procedural human figure for now (GLB loading was causing browser issues)
    createFallbackHumanFigure();

    // Label - will be updated to follow human
    createLabel('Human', new THREE.Vector3(3.5, 2.2, 0), '#34d399');

    console.log('Human figure loading from walking_person_basic.glb...');
}

// Human limb references for walking animation
let humanLeftLeg = null;
let humanRightLeg = null;
let humanLeftArm = null;
let humanRightArm = null;
let humanHead = null;
let humanTorso = null;
let humanLeftForearm = null;
let humanRightForearm = null;
let humanLeftCalf = null;
let humanRightCalf = null;

// Create stylized animated-film-quality human figure
function createFallbackHumanFigure() {
    const humanGroup = new THREE.Group();

    // ===== PRECISE PROPORTIONS - Calculated for seamless connections =====
    const scale = 0.85;
    const headRadius = 0.12 * scale;
    const torsoHeight = 0.35 * scale;
    const shoulderWidth = 0.26 * scale;
    const hipWidth = 0.16 * scale;
    const upperArmLength = 0.16 * scale;
    const forearmLength = 0.14 * scale;
    const thighLength = 0.22 * scale;
    const calfLength = 0.20 * scale;
    const limbRadius = 0.03 * scale;

    // Calculate exact Y positions for seamless alignment
    const hipY = calfLength + thighLength;
    const torsoBottomY = hipY;
    const torsoTopY = torsoBottomY + torsoHeight;
    const headCenterY = torsoTopY + headRadius * 0.9;

    // ===== MATERIALS =====
    const skinMat = new THREE.MeshStandardMaterial({
        color: 0xc4956a,
        roughness: 0.6,
        metalness: 0.0,
        emissive: 0x805030,
        emissiveIntensity: 0.08,
    });
    humanMaterial = skinMat;

    const hairMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.85,
        metalness: 0.0,
    });

    const beardMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.9,
        metalness: 0.0,
        transparent: true,
        opacity: 0.9,
    });

    const eyeWhiteMat = new THREE.MeshStandardMaterial({
        color: 0xfefefe,
        roughness: 0.2,
        metalness: 0.0,
    });

    const irisMat = new THREE.MeshStandardMaterial({
        color: 0x3d2815,
        roughness: 0.3,
        metalness: 0.1,
    });

    const pupilMat = new THREE.MeshBasicMaterial({
        color: 0x050505,
    });

    const browMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.85,
        metalness: 0.0,
    });

    const hoodieMat = new THREE.MeshStandardMaterial({
        color: 0x6e6e6e,
        roughness: 0.8,
        metalness: 0.0,
        emissive: CONFIG.colors.human,
        emissiveIntensity: 0.05,
    });

    const pantsMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.75,
        metalness: 0.0,
        emissive: CONFIG.colors.human,
        emissiveIntensity: 0.02,
    });

    const shoeMat = new THREE.MeshStandardMaterial({
        color: 0xf5f5f5,
        roughness: 0.35,
        metalness: 0.0,
    });

    const lipMat = new THREE.MeshStandardMaterial({
        color: 0x8a5040,
        roughness: 0.5,
        metalness: 0.0,
    });

    // ===== HEAD - Clean, unified shape =====
    const headGroup = new THREE.Group();

    // Main head - single clean sphere (no awkward scaling)
    const headGeom = new THREE.SphereGeometry(headRadius, 32, 32);
    const headMesh = new THREE.Mesh(headGeom, skinMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Jaw/lower face - subtle extension downward
    const jawGeom = new THREE.SphereGeometry(headRadius * 0.75, 24, 24);
    const jawMesh = new THREE.Mesh(jawGeom, skinMat);
    jawMesh.position.set(0, -headRadius * 0.5, headRadius * 0.1);
    jawMesh.scale.set(0.9, 0.6, 0.8);
    headGroup.add(jawMesh);

    // Chin point
    const chinGeom = new THREE.SphereGeometry(headRadius * 0.25, 16, 16);
    const chinMesh = new THREE.Mesh(chinGeom, skinMat);
    chinMesh.position.set(0, -headRadius * 0.85, headRadius * 0.15);
    chinMesh.scale.set(0.8, 0.5, 0.6);
    headGroup.add(chinMesh);

    // ===== HAIR - Pompadour/quiff style (NOT a helmet) =====
    // Only cover the TOP of the head - short on sides like a fade

    // Top hair - flat cap on top only (not wrapping down)
    const topHairGeom = new THREE.SphereGeometry(headRadius * 1.05, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.35);
    const topHair = new THREE.Mesh(topHairGeom, hairMat);
    topHair.position.set(0, headRadius * 0.15, 0);
    headGroup.add(topHair);

    // Pompadour - the signature swept-up front volume
    const pompMainGeom = new THREE.SphereGeometry(headRadius * 0.7, 24, 24);
    const pompMain = new THREE.Mesh(pompMainGeom, hairMat);
    pompMain.position.set(0, headRadius * 0.75, headRadius * 0.4);
    pompMain.scale.set(1.4, 0.65, 0.8);
    pompMain.rotation.x = -0.35;
    headGroup.add(pompMain);

    // Pompadour top crest
    const pompCrestGeom = new THREE.SphereGeometry(headRadius * 0.5, 20, 20);
    const pompCrest = new THREE.Mesh(pompCrestGeom, hairMat);
    pompCrest.position.set(0, headRadius * 1.0, headRadius * 0.2);
    pompCrest.scale.set(1.2, 0.5, 0.7);
    pompCrest.rotation.x = -0.2;
    headGroup.add(pompCrest);

    // Side fade - very thin layer on sides
    [-1, 1].forEach(side => {
        const fadeGeom = new THREE.SphereGeometry(headRadius * 0.3, 16, 16);
        const fade = new THREE.Mesh(fadeGeom, hairMat);
        fade.position.set(side * headRadius * 0.85, headRadius * 0.35, -headRadius * 0.1);
        fade.scale.set(0.3, 0.5, 0.6);
        headGroup.add(fade);
    });

    // Back of head hair
    const backHairGeom = new THREE.SphereGeometry(headRadius * 0.8, 20, 20);
    const backHair = new THREE.Mesh(backHairGeom, hairMat);
    backHair.position.set(0, headRadius * 0.4, -headRadius * 0.35);
    backHair.scale.set(1.0, 0.6, 0.5);
    headGroup.add(backHair);

    // ===== FACE - LARGE, clearly visible features =====
    const faceZ = headRadius * 0.95; // Features protrude from face

    // EYES - Much larger
    const eyeSpacing = headRadius * 0.32;
    const eyeY = headRadius * 0.05;

    [-1, 1].forEach(side => {
        // Eye white - BIG
        const eyeWhiteGeom = new THREE.SphereGeometry(headRadius * 0.18, 24, 24);
        const eyeWhite = new THREE.Mesh(eyeWhiteGeom, eyeWhiteMat);
        eyeWhite.position.set(side * eyeSpacing, eyeY, faceZ);
        eyeWhite.scale.set(1.1, 0.8, 0.55);
        headGroup.add(eyeWhite);

        // Iris - large brown
        const irisGeom = new THREE.SphereGeometry(headRadius * 0.11, 20, 20);
        const iris = new THREE.Mesh(irisGeom, irisMat);
        iris.position.set(side * eyeSpacing, eyeY, faceZ + headRadius * 0.06);
        iris.scale.set(1, 1, 0.45);
        headGroup.add(iris);

        // Pupil - prominent black
        const pupilGeom = new THREE.SphereGeometry(headRadius * 0.055, 16, 16);
        const pupil = new THREE.Mesh(pupilGeom, pupilMat);
        pupil.position.set(side * eyeSpacing, eyeY, faceZ + headRadius * 0.085);
        headGroup.add(pupil);

        // Highlight - visible sparkle
        const hlGeom = new THREE.SphereGeometry(headRadius * 0.025, 10, 10);
        const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const hl = new THREE.Mesh(hlGeom, hlMat);
        hl.position.set(side * eyeSpacing + side * headRadius * 0.04, eyeY + headRadius * 0.03, faceZ + headRadius * 0.1);
        headGroup.add(hl);

        // Eyebrow - thick and visible
        const browGeom = new THREE.SphereGeometry(headRadius * 0.14, 14, 14);
        const brow = new THREE.Mesh(browGeom, browMat);
        brow.position.set(side * eyeSpacing, eyeY + headRadius * 0.22, faceZ - headRadius * 0.03);
        brow.scale.set(1.3, 0.28, 0.45);
        brow.rotation.z = side * 0.12;
        headGroup.add(brow);
    });

    // NOSE - larger, more prominent
    const noseGeom = new THREE.SphereGeometry(headRadius * 0.14, 18, 18);
    const nose = new THREE.Mesh(noseGeom, skinMat);
    nose.position.set(0, -headRadius * 0.12, faceZ + headRadius * 0.08);
    nose.scale.set(0.65, 0.75, 0.55);
    headGroup.add(nose);

    // Nose bridge
    const bridgeGeom = new THREE.CylinderGeometry(headRadius * 0.04, headRadius * 0.05, headRadius * 0.18, 10);
    const bridge = new THREE.Mesh(bridgeGeom, skinMat);
    bridge.position.set(0, headRadius * 0.05, faceZ);
    bridge.rotation.x = 0.35;
    headGroup.add(bridge);

    // MOUTH - Larger, more defined
    // Upper lip
    const upperLipGeom = new THREE.TorusGeometry(headRadius * 0.1, headRadius * 0.025, 10, 20, Math.PI);
    const upperLip = new THREE.Mesh(upperLipGeom, lipMat);
    upperLip.position.set(0, -headRadius * 0.38, faceZ);
    upperLip.rotation.z = Math.PI;
    headGroup.add(upperLip);

    // Lower lip
    const lowerLipGeom = new THREE.TorusGeometry(headRadius * 0.08, headRadius * 0.028, 10, 20, Math.PI);
    const lowerLip = new THREE.Mesh(lowerLipGeom, lipMat);
    lowerLip.position.set(0, -headRadius * 0.48, faceZ - headRadius * 0.02);
    headGroup.add(lowerLip);

    // ===== BEARD - Full stubble coverage =====
    // Mustache - visible above lip
    const mustacheGeom = new THREE.SphereGeometry(headRadius * 0.14, 14, 14);
    const mustache = new THREE.Mesh(mustacheGeom, beardMat);
    mustache.position.set(0, -headRadius * 0.28, faceZ + headRadius * 0.02);
    mustache.scale.set(1.4, 0.35, 0.45);
    headGroup.add(mustache);

    // Soul patch - under lower lip
    const soulGeom = new THREE.SphereGeometry(headRadius * 0.08, 12, 12);
    const soul = new THREE.Mesh(soulGeom, beardMat);
    soul.position.set(0, -headRadius * 0.55, faceZ - headRadius * 0.05);
    soul.scale.set(1.0, 0.7, 0.45);
    headGroup.add(soul);

    // Jaw beard - connected coverage along jawline
    [-1, 1].forEach(side => {
        // Cheek/sideburn area
        const sideGeom = new THREE.SphereGeometry(headRadius * 0.22, 14, 14);
        const sideBeard = new THREE.Mesh(sideGeom, beardMat);
        sideBeard.position.set(side * headRadius * 0.55, -headRadius * 0.3, headRadius * 0.55);
        sideBeard.scale.set(0.45, 0.65, 0.5);
        headGroup.add(sideBeard);

        // Mid jaw
        const midJawGeom = new THREE.SphereGeometry(headRadius * 0.24, 14, 14);
        const midJaw = new THREE.Mesh(midJawGeom, beardMat);
        midJaw.position.set(side * headRadius * 0.45, -headRadius * 0.5, headRadius * 0.5);
        midJaw.scale.set(0.5, 0.6, 0.5);
        headGroup.add(midJaw);

        // Lower jaw connecting to chin
        const lowerJawGeom = new THREE.SphereGeometry(headRadius * 0.2, 14, 14);
        const lowerJaw = new THREE.Mesh(lowerJawGeom, beardMat);
        lowerJaw.position.set(side * headRadius * 0.28, -headRadius * 0.68, headRadius * 0.4);
        lowerJaw.scale.set(0.55, 0.5, 0.5);
        headGroup.add(lowerJaw);
    });

    // Chin beard - goatee
    const chinBeardGeom = new THREE.SphereGeometry(headRadius * 0.25, 16, 16);
    const chinBeard = new THREE.Mesh(chinBeardGeom, beardMat);
    chinBeard.position.set(0, -headRadius * 0.72, headRadius * 0.32);
    chinBeard.scale.set(0.9, 0.55, 0.6);
    headGroup.add(chinBeard);

    // EARS
    [-1, 1].forEach(side => {
        const earGeom = new THREE.SphereGeometry(headRadius * 0.12, 10, 10);
        const ear = new THREE.Mesh(earGeom, skinMat);
        ear.position.set(side * headRadius * 0.95, headRadius * 0.05, 0);
        ear.scale.set(0.3, 0.6, 0.4);
        headGroup.add(ear);
    });

    // Position head
    headGroup.position.y = headCenterY;
    humanGroup.add(headGroup);
    humanHead = headGroup;

    // ===== NECK - Connects head to torso seamlessly =====
    const neckGeom = new THREE.CylinderGeometry(headRadius * 0.35, headRadius * 0.45, headRadius * 0.5, 16);
    const neckMesh = new THREE.Mesh(neckGeom, skinMat);
    neckMesh.position.y = torsoTopY + headRadius * 0.1;
    humanGroup.add(neckMesh);

    // ===== TORSO - Clean unified shape =====
    const torsoGroup = new THREE.Group();

    // Main torso body - single clean cylinder with spherical caps
    const mainTorsoGeom = new THREE.CylinderGeometry(shoulderWidth * 0.45, shoulderWidth * 0.38, torsoHeight * 0.85, 20);
    const mainTorso = new THREE.Mesh(mainTorsoGeom, hoodieMat);
    mainTorso.position.y = torsoHeight * 0.45;
    mainTorso.castShadow = true;
    torsoGroup.add(mainTorso);

    // Shoulders - smooth cap
    const shoulderCapGeom = new THREE.SphereGeometry(shoulderWidth * 0.48, 20, 20);
    const shoulderCap = new THREE.Mesh(shoulderCapGeom, hoodieMat);
    shoulderCap.position.y = torsoHeight * 0.85;
    shoulderCap.scale.set(1.0, 0.35, 0.7);
    torsoGroup.add(shoulderCap);

    // Hip area - smooth transition
    const hipCapGeom = new THREE.SphereGeometry(shoulderWidth * 0.4, 16, 16);
    const hipCap = new THREE.Mesh(hipCapGeom, hoodieMat);
    hipCap.position.y = torsoHeight * 0.08;
    hipCap.scale.set(0.95, 0.35, 0.7);
    torsoGroup.add(hipCap);

    // Collar
    const collarGeom = new THREE.TorusGeometry(headRadius * 0.38, headRadius * 0.05, 8, 20);
    const collar = new THREE.Mesh(collarGeom, hoodieMat);
    collar.position.y = torsoHeight;
    collar.rotation.x = Math.PI / 2;
    torsoGroup.add(collar);

    torsoGroup.position.y = torsoBottomY;
    humanGroup.add(torsoGroup);
    humanTorso = torsoGroup;
    humanBody = torsoGroup;

    // ===== ARMS - Clean, connected =====
    const createArm = (side) => {
        const armGroup = new THREE.Group();

        // Shoulder ball - blends with torso
        const shoulderGeom = new THREE.SphereGeometry(limbRadius * 1.6, 14, 14);
        const shoulder = new THREE.Mesh(shoulderGeom, hoodieMat);
        armGroup.add(shoulder);

        // Upper arm
        const upperArmGeom = new THREE.CylinderGeometry(limbRadius * 1.3, limbRadius * 1.1, upperArmLength, 14);
        const upperArm = new THREE.Mesh(upperArmGeom, hoodieMat);
        upperArm.position.y = -upperArmLength / 2;
        upperArm.castShadow = true;
        armGroup.add(upperArm);

        // Elbow - smooth joint
        const elbowGeom = new THREE.SphereGeometry(limbRadius * 1.1, 12, 12);
        const elbow = new THREE.Mesh(elbowGeom, hoodieMat);
        elbow.position.y = -upperArmLength;
        armGroup.add(elbow);

        // Forearm group
        const forearmGroup = new THREE.Group();
        forearmGroup.position.y = -upperArmLength;

        const forearmGeom = new THREE.CylinderGeometry(limbRadius * 1.0, limbRadius * 0.85, forearmLength, 14);
        const forearm = new THREE.Mesh(forearmGeom, skinMat);
        forearm.position.y = -forearmLength / 2;
        forearm.castShadow = true;
        forearmGroup.add(forearm);

        // Hand - refined shape
        const handGeom = new THREE.SphereGeometry(limbRadius * 1.2, 14, 14);
        const hand = new THREE.Mesh(handGeom, skinMat);
        hand.position.y = -forearmLength - limbRadius * 0.5;
        hand.scale.set(0.8, 0.9, 0.45);
        forearmGroup.add(hand);

        armGroup.add(forearmGroup);

        // Position at shoulder height
        armGroup.position.set(
            side * (shoulderWidth / 2 + limbRadius * 0.3),
            torsoBottomY + torsoHeight * 0.85,
            0
        );

        return { armGroup, forearmGroup };
    };

    const leftArmData = createArm(-1);
    humanLeftArm = leftArmData.armGroup;
    humanLeftForearm = leftArmData.forearmGroup;
    humanGroup.add(humanLeftArm);

    const rightArmData = createArm(1);
    humanRightArm = rightArmData.armGroup;
    humanRightForearm = rightArmData.forearmGroup;
    humanGroup.add(humanRightArm);

    // ===== LEGS - Clean, connected =====
    const createLeg = (side) => {
        const legGroup = new THREE.Group();

        // Hip ball - connects to torso
        const hipBallGeom = new THREE.SphereGeometry(limbRadius * 1.6, 14, 14);
        const hipBall = new THREE.Mesh(hipBallGeom, pantsMat);
        legGroup.add(hipBall);

        // Thigh
        const thighGeom = new THREE.CylinderGeometry(limbRadius * 1.4, limbRadius * 1.25, thighLength, 14);
        const thigh = new THREE.Mesh(thighGeom, pantsMat);
        thigh.position.y = -thighLength / 2;
        thigh.castShadow = true;
        legGroup.add(thigh);

        // Knee - smooth joint
        const kneeJointGeom = new THREE.SphereGeometry(limbRadius * 1.2, 12, 12);
        const kneeJoint = new THREE.Mesh(kneeJointGeom, pantsMat);
        kneeJoint.position.y = -thighLength;
        legGroup.add(kneeJoint);

        // Calf group
        const calfGroup = new THREE.Group();
        calfGroup.position.y = -thighLength;

        const calfGeom = new THREE.CylinderGeometry(limbRadius * 1.15, limbRadius * 0.9, calfLength, 14);
        const calf = new THREE.Mesh(calfGeom, pantsMat);
        calf.position.y = -calfLength / 2;
        calf.castShadow = true;
        calfGroup.add(calf);

        // Ankle
        const ankleGeom = new THREE.SphereGeometry(limbRadius * 0.85, 10, 10);
        const ankle = new THREE.Mesh(ankleGeom, pantsMat);
        ankle.position.y = -calfLength;
        calfGroup.add(ankle);

        // Sneaker - clean rounded shape
        const shoeGeom = new THREE.SphereGeometry(limbRadius * 2.0, 14, 14);
        const shoe = new THREE.Mesh(shoeGeom, shoeMat);
        shoe.position.set(0, -calfLength - limbRadius * 0.4, limbRadius * 0.9);
        shoe.scale.set(0.7, 0.35, 1.2);
        shoe.castShadow = true;
        calfGroup.add(shoe);

        legGroup.add(calfGroup);

        // Position at hip height
        legGroup.position.set(
            side * hipWidth / 2,
            hipY,
            0
        );

        return { legGroup, calfGroup };
    };

    const leftLegData = createLeg(-1);
    humanLeftLeg = leftLegData.legGroup;
    humanLeftCalf = leftLegData.calfGroup;
    humanGroup.add(humanLeftLeg);

    const rightLegData = createLeg(1);
    humanRightLeg = rightLegData.legGroup;
    humanRightCalf = rightLegData.calfGroup;
    humanGroup.add(humanRightLeg);

    // Position human
    humanGroup.position.set(humanState.currentPos.x, 0, humanState.currentPos.z);
    scene.add(humanGroup);
    humanModel = humanGroup;

    console.log('Pixar-quality human figure created');
}

// ============================================================
// Unobservables
// ============================================================

// Orb effect configurations - each effect embodies the concept's meaning
// DESIGN PRINCIPLES:
// 1. All animations must be continuous, smooth, and cyclic - NO visible resets
// 2. Colors stay in amber/gold range (hue 0.08-0.12) - NO red tones
// 3. Each orb has orbiting/external elements for visual distinctiveness
const ORB_EFFECTS = {
    intuition: {
        // Irregular pulse + spark particles that orbit erratically - gut feeling
        setup: (group) => {
            // Add 3 spark particles that move unpredictably
            for (let i = 0; i < 3; i++) {
                const sparkGeom = new THREE.SphereGeometry(0.012, 6, 6);
                const sparkMat = new THREE.MeshBasicMaterial({
                    color: CONFIG.colors.unobservable,
                    transparent: true,
                    opacity: 0.6
                });
                const spark = new THREE.Mesh(sparkGeom, sparkMat);
                spark.userData.phase = i * 2.1; // Different starting phases
                group.add(spark);
            }
        },
        animate: (group, time) => {
            // Irregular base pulse (two sine waves multiplied)
            const basePulse = Math.sin(time * 2) * Math.sin(time * 1.3) * 0.1;

            // Occasional sudden flash (using smooth spike)
            const flashCycle = (time * 0.3) % 1;
            const flash = flashCycle > 0.9 ? (1 - (flashCycle - 0.9) * 10) * 0.3 : 0;

            group.children[0].scale.setScalar(1 + basePulse + flash);
            group.children[1].scale.setScalar(1 + basePulse * 0.5 + flash * 1.5);

            if (flash > 0) {
                group.children[1].material.opacity = 0.12 + flash * 0.4;
            } else {
                group.children[1].material.opacity = 0.12;
            }

            // Animate spark particles - erratic but continuous orbits
            group.children.slice(2).forEach((spark, i) => {
                const phase = spark.userData.phase;
                // Use multiple frequencies for irregular but continuous motion
                const angle = time * 0.8 + phase + Math.sin(time * 0.3 + phase) * 0.5;
                const radius = 0.18 + Math.sin(time * 0.5 + phase) * 0.04;
                const yOffset = Math.sin(time * 0.7 + phase * 2) * 0.06;

                spark.position.x = Math.cos(angle) * radius;
                spark.position.z = Math.sin(angle) * radius;
                spark.position.y = yOffset;

                // Fade with flash
                spark.material.opacity = 0.4 + flash * 0.6;
            });
        }
    },
    presence: {
        // Grounded with gravity particles falling around it - weight and mass
        baseYOffset: -0.2,
        setup: (group) => {
            // Add 5 gravity particles that slowly fall around the orb
            for (let i = 0; i < 5; i++) {
                const particleGeom = new THREE.SphereGeometry(0.008, 6, 6);
                const particleMat = new THREE.MeshBasicMaterial({
                    color: CONFIG.colors.unobservable,
                    transparent: true,
                    opacity: 0.4
                });
                const particle = new THREE.Mesh(particleGeom, particleMat);
                particle.userData.angle = (i / 5) * Math.PI * 2;
                particle.userData.fallOffset = i * 0.2; // Stagger the fall
                group.add(particle);
            }
        },
        animate: (group, time) => {
            // Slow, heavy breathing
            const breathCycle = Math.sin(time * 0.4);
            const breathScale = 1 + breathCycle * 0.05;

            group.children[0].scale.setScalar(breathScale);
            group.children[1].scale.setScalar(breathScale * 1.1);

            // Gravity particles - continuous falling loop
            group.children.slice(2).forEach((particle, i) => {
                const angle = particle.userData.angle + time * 0.1; // Slow rotation
                const fallOffset = particle.userData.fallOffset;

                // Continuous fall cycle (0 to 1, loops smoothly)
                const fallCycle = ((time * 0.15 + fallOffset) % 1);
                // Start high, fall down, fade out at bottom
                const y = 0.25 - fallCycle * 0.4;
                const radius = 0.15 + fallCycle * 0.05; // Slight outward drift

                particle.position.x = Math.cos(angle) * radius;
                particle.position.z = Math.sin(angle) * radius;
                particle.position.y = y;

                // Fade as it falls
                particle.material.opacity = 0.5 * (1 - fallCycle * 0.8);
            });
        }
    },
    room: {
        // Scanning ring that flows around the outside of the orb - reading the collective energy
        setup: (group) => {
            // Create a thin torus ring that wraps around the outside of the glow sphere
            const ringGeom = new THREE.TorusGeometry(0.22, 0.006, 8, 48);
            const ringMat = new THREE.MeshBasicMaterial({
                color: CONFIG.colors.unobservable,
                transparent: true,
                opacity: 0.6
            });
            const ring = new THREE.Mesh(ringGeom, ringMat);
            ring.rotation.x = Math.PI / 2; // Lay flat (horizontal)
            group.add(ring);
        },
        animate: (group, time) => {
            const ring = group.children[2]; // After orb and glow
            if (!ring) return;

            // Smooth continuous scanning - ring travels along the surface of a sphere
            // Using sine for vertical position creates perpetual up/down flow
            const scanSpeed = 0.5;
            const phase = time * scanSpeed;

            // Vertical position: oscillates from top to bottom of the glow sphere
            const glowRadius = 0.18;
            const scanY = Math.sin(phase) * glowRadius;
            ring.position.y = scanY;

            // Ring radius adjusts to follow the sphere's surface (smaller at poles, larger at equator)
            // This creates the effect of the ring hugging the spherical surface
            const normalizedY = scanY / glowRadius; // -1 to 1
            const surfaceRadius = glowRadius * Math.sqrt(1 - normalizedY * normalizedY) + 0.04;

            // Apply as scale (base geometry is 0.22 radius)
            const baseRadius = 0.22;
            const scale = surfaceRadius / baseRadius;
            ring.scale.set(scale, scale, 1);

            // Opacity: consistent glow, slightly brighter at equator where ring is largest
            ring.material.opacity = 0.45 + (1 - Math.abs(normalizedY)) * 0.25;
        }
    },
    trust: {
        // Two interlinked rings + orbiting bond particles - relationships
        setup: (group) => {
            // First infinity ring
            const points1 = [];
            for (let t = 0; t <= Math.PI * 2; t += 0.08) {
                const x = Math.sin(t) * 0.16;
                const z = Math.sin(t) * Math.cos(t) * 0.16;
                points1.push(new THREE.Vector3(x, 0, z));
            }
            const geometry1 = new THREE.BufferGeometry().setFromPoints(points1);
            const material1 = new THREE.LineBasicMaterial({
                color: CONFIG.colors.unobservable,
                transparent: true,
                opacity: 0.6
            });
            const ring1 = new THREE.Line(geometry1, material1);
            ring1.rotation.x = Math.PI / 2;
            group.add(ring1);

            // Second infinity ring (tilted)
            const points2 = [];
            for (let t = 0; t <= Math.PI * 2; t += 0.08) {
                const x = Math.sin(t) * 0.14;
                const z = Math.sin(t) * Math.cos(t) * 0.14;
                points2.push(new THREE.Vector3(x, 0, z));
            }
            const geometry2 = new THREE.BufferGeometry().setFromPoints(points2);
            const material2 = new THREE.LineBasicMaterial({
                color: CONFIG.colors.unobservable,
                transparent: true,
                opacity: 0.45
            });
            const ring2 = new THREE.Line(geometry2, material2);
            ring2.rotation.x = Math.PI / 2;
            ring2.rotation.z = Math.PI / 3;
            group.add(ring2);

            // Add 2 bond particles that travel along the infinity paths
            for (let i = 0; i < 2; i++) {
                const bondGeom = new THREE.SphereGeometry(0.02, 8, 8);
                const bondMat = new THREE.MeshBasicMaterial({
                    color: CONFIG.colors.unobservable,
                    transparent: true,
                    opacity: 0.8
                });
                const bond = new THREE.Mesh(bondGeom, bondMat);
                bond.userData.pathOffset = i * Math.PI; // Opposite sides
                group.add(bond);
            }
        },
        animate: (group, time) => {
            const ring1 = group.children[2];
            const ring2 = group.children[3];
            if (ring1) ring1.rotation.z = time * 0.15;
            if (ring2) ring2.rotation.z = Math.PI / 3 + time * 0.12;

            // Bond particles follow infinity path
            group.children.slice(4).forEach((bond, i) => {
                const t = time * 0.5 + bond.userData.pathOffset;
                const x = Math.sin(t) * 0.15;
                const z = Math.sin(t) * Math.cos(t) * 0.15;
                const y = Math.sin(t * 2) * 0.02;
                bond.position.set(x, y, z);
            });
        }
    },
    memory: {
        // Nested layers with orbiting archive particles - knowledge in layers
        setup: (group) => {
            for (let i = 1; i <= 3; i++) {
                const layerGeom = new THREE.SphereGeometry(0.08 + i * 0.045, 12, 12);
                const layerMat = new THREE.MeshBasicMaterial({
                    color: CONFIG.colors.unobservable,
                    transparent: true,
                    opacity: 0.2 - i * 0.05,
                    wireframe: true
                });
                const layer = new THREE.Mesh(layerGeom, layerMat);
                layer.userData.baseOpacity = 0.2 - i * 0.05;
                group.add(layer);
            }
        },
        animate: (group, time) => {
            group.children.slice(2).forEach((layer, i) => {
                // Continuous slow rotation
                layer.rotation.y = time * (0.1 + i * 0.05);
                layer.rotation.x = time * (0.08 - i * 0.02);

                // Smooth opacity pulse
                const pulseCycle = Math.sin(time * 0.3 + i * 1.5);
                const opacityVariation = (i + 1) * 0.03;
                layer.material.opacity = layer.userData.baseOpacity + pulseCycle * opacityVariation;
            });
        }
    },
    context: {
        // Color shift in AMBER range only + orbiting context particles
        setup: (group) => {
            // Add 3 small context-shifting particles
            for (let i = 0; i < 3; i++) {
                const ctxGeom = new THREE.SphereGeometry(0.015, 8, 8);
                const ctxMat = new THREE.MeshBasicMaterial({
                    color: CONFIG.colors.unobservable,
                    transparent: true,
                    opacity: 0.5
                });
                const ctx = new THREE.Mesh(ctxGeom, ctxMat);
                ctx.userData.orbitPhase = (i / 3) * Math.PI * 2;
                group.add(ctx);
            }
        },
        animate: (group, time) => {
            // AMBER ONLY hue range (0.08-0.11) - NO RED
            const hue = 0.095 + Math.sin(time * 0.4) * 0.015;
            const saturation = 0.85 + Math.sin(time * 0.6) * 0.1;
            const color = new THREE.Color().setHSL(hue, saturation, 0.55);

            group.children[0].material.color = color;
            group.children[1].material.color = color;

            // Glow pulses with color shift
            const glowPulse = 0.12 + Math.sin(time * 0.4) * 0.06;
            group.children[1].material.opacity = glowPulse;

            // Context particles orbit with different colors (all amber range)
            group.children.slice(2).forEach((ctx, i) => {
                const phase = ctx.userData.orbitPhase;
                const angle = time * 0.6 + phase;
                const radius = 0.2;

                ctx.position.x = Math.cos(angle) * radius;
                ctx.position.z = Math.sin(angle) * radius;
                ctx.position.y = Math.sin(time * 0.4 + phase) * 0.04;

                // Each particle has slightly different amber hue
                const particleHue = 0.08 + (i * 0.015);
                ctx.material.color.setHSL(particleHue, 0.9, 0.5);
            });
        }
    },
    timing: {
        // Clock hand + orbiting hour markers - knowing when
        setup: (group) => {
            // Clock hand
            const handGeom = new THREE.BoxGeometry(0.015, 0.12, 0.008);
            const handMat = new THREE.MeshBasicMaterial({
                color: CONFIG.colors.unobservable,
                transparent: true,
                opacity: 0.8
            });
            const hand = new THREE.Mesh(handGeom, handMat);
            hand.position.y = 0.06;

            const handPivot = new THREE.Group();
            handPivot.add(hand);
            group.add(handPivot);

            // Add 4 hour markers orbiting
            for (let i = 0; i < 4; i++) {
                const markerGeom = new THREE.BoxGeometry(0.02, 0.008, 0.008);
                const markerMat = new THREE.MeshBasicMaterial({
                    color: CONFIG.colors.unobservable,
                    transparent: true,
                    opacity: 0.5
                });
                const marker = new THREE.Mesh(markerGeom, markerMat);
                marker.userData.hourPosition = (i / 4) * Math.PI * 2;
                group.add(marker);
            }

            group.userData.currentAngle = 0;
            group.userData.targetAngle = 0;
            group.userData.lastStepTime = 0;
            group.userData.pauseDuration = 1.5 + Math.random();
        },
        animate: (group, time) => {
            const handPivot = group.children[2];
            if (!handPivot) return;

            // Discrete steps with pauses - but smooth interpolation
            const timeSinceLastStep = time - group.userData.lastStepTime;

            if (timeSinceLastStep > group.userData.pauseDuration) {
                group.userData.targetAngle -= Math.PI / 6; // Step forward
                group.userData.lastStepTime = time;
                group.userData.pauseDuration = 1.2 + Math.random() * 1.5;
            }

            // Smooth transition to target (continuous, no reset)
            group.userData.currentAngle += (group.userData.targetAngle - group.userData.currentAngle) * 0.08;
            handPivot.rotation.z = group.userData.currentAngle;

            // Hour markers orbit slowly
            group.children.slice(3).forEach((marker, i) => {
                const hourPos = marker.userData.hourPosition;
                const angle = hourPos + time * 0.05; // Very slow orbit
                const radius = 0.18;

                marker.position.x = Math.cos(angle) * radius;
                marker.position.z = Math.sin(angle) * radius;
                marker.position.y = 0;
                marker.rotation.z = angle; // Point outward
            });
        }
    },
    silence: {
        // Fading orb + ghost wisps that drift outward - the unspoken
        setup: (group) => {
            // Add 4 ghost wisps that drift outward and fade
            for (let i = 0; i < 4; i++) {
                const wispGeom = new THREE.SphereGeometry(0.01, 6, 6);
                const wispMat = new THREE.MeshBasicMaterial({
                    color: CONFIG.colors.unobservable,
                    transparent: true,
                    opacity: 0.3
                });
                const wisp = new THREE.Mesh(wispGeom, wispMat);
                wisp.userData.phase = (i / 4); // Stagger the drift cycles
                wisp.userData.angle = (i / 4) * Math.PI * 2;
                group.add(wisp);
            }
        },
        animate: (group, time) => {
            // Main orb: asymmetric fade cycle
            const cycle = (time * 0.25) % 1;

            let opacity;
            if (cycle < 0.15) {
                opacity = cycle / 0.15;
            } else if (cycle < 0.35) {
                opacity = 1;
            } else if (cycle < 0.5) {
                opacity = 1 - ((cycle - 0.35) / 0.15);
            } else {
                opacity = 0;
            }

            group.children[0].material.opacity = 0.15 + opacity * 0.75;
            group.children[1].material.opacity = opacity * 0.2;

            // Ghost wisps - continuous drift outward and fade, then reset
            group.children.slice(2).forEach((wisp, i) => {
                const phase = wisp.userData.phase;
                const baseAngle = wisp.userData.angle;

                // Continuous cycle (0 to 1)
                const driftCycle = ((time * 0.2 + phase) % 1);

                // Drift outward from center
                const radius = driftCycle * 0.35;
                const angle = baseAngle + time * 0.1;
                const y = driftCycle * 0.1 - 0.05;

                wisp.position.x = Math.cos(angle) * radius;
                wisp.position.z = Math.sin(angle) * radius;
                wisp.position.y = y;

                // Fade as it drifts out
                const wispOpacity = (1 - driftCycle) * 0.4;
                wisp.material.opacity = wispOpacity * (0.5 + opacity * 0.5);
            });
        }
    }
};

function createUnobservables() {
    CONFIG.unobservables.forEach((u, i) => {
        const group = new THREE.Group();

        // Minimal, refined orb - small and elegant
        const orbGeom = new THREE.SphereGeometry(0.1, 16, 16);
        const orbMat = new THREE.MeshBasicMaterial({
            color: CONFIG.colors.unobservable,
            transparent: true,
            opacity: 0.9,
        });
        const orb = new THREE.Mesh(orbGeom, orbMat);
        group.add(orb);

        // Subtle glow halo - just enough to make it visible
        const glowGeom = new THREE.SphereGeometry(0.18, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
            color: CONFIG.colors.unobservable,
            transparent: true,
            opacity: 0.12,
        });
        const glow = new THREE.Mesh(glowGeom, glowMat);
        group.add(glow);

        // Get orb-specific effect configuration
        const effect = ORB_EFFECTS[u.id];

        // Apply setup function if exists (adds extra geometry)
        if (effect && effect.setup) {
            effect.setup(group);
        }

        // Position - floating at a low height (with optional offset)
        const baseYOffset = effect?.baseYOffset || 0;
        const baseY = 0.5 + baseYOffset;
        group.position.set(u.position.x, baseY, u.position.z);
        group.userData = {
            unobservable: u,
            index: i,
            baseY: baseY,
            effect: effect
        };

        scene.add(group);
        unobservableObjects.push(group);

        // HTML label
        createUnobservableLabel(u, group);
    });

    console.log('Unobservables created with unique effects');
}

function createUnobservableLabel(u, group) {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'unobservable-label';
    labelDiv.innerHTML = `
        <span class="symbol">${u.symbol}</span>
        <span class="title">${u.title}</span>
    `;
    labelDiv.dataset.id = u.id;
    document.body.appendChild(labelDiv);

    labelElements.push({
        element: labelDiv,
        object: group,
        data: u,
        isUnobservable: true,
    });
}

// ============================================================
// Scene Labels (Observable/Unobservable area labels)
// ============================================================

function createSceneLabels() {
    // "Observable Data" label - positioned above AI's domain
    const observableLabel = document.getElementById('labelObservable');
    if (observableLabel) {
        labelElements.push({
            element: observableLabel,
            position: new THREE.Vector3(-2, 0.5, -3), // Above/behind the light cone
            isFixed: true,
            isSceneLabel: true,
        });
    }

    // "The Unobservable" label - positioned behind "What's Not Said" at human perception boundary
    const unobservableLabel = document.getElementById('labelUnobservable');
    if (unobservableLabel) {
        labelElements.push({
            element: unobservableLabel,
            position: new THREE.Vector3(7, 1.2, -0.5), // Behind "What's Not Said" (6.5, -0.5) at the edge
            isFixed: true,
            isSceneLabel: true,
        });
    }

    console.log('Scene labels created');
}

// ============================================================
// Labels
// ============================================================

function createLabel(text, position, color) {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'figure-label';
    labelDiv.textContent = text;
    labelDiv.style.color = color;
    document.body.appendChild(labelDiv);

    labelElements.push({
        element: labelDiv,
        position: position,
        isFixed: true,
    });
}

function updateLabels() {
    labelElements.forEach(label => {
        let pos;
        if (label.isFixed) {
            pos = label.position.clone();
        } else {
            pos = label.object.position.clone();
            pos.y += 0.4; // Smaller offset for smaller orbs
        }

        const projected = pos.project(camera);
        const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;

        label.element.style.left = x + 'px';
        label.element.style.top = y + 'px';

        if (label.isUnobservable) {
            // Apply hover state for BOTH hover and focus (mobile tap uses focus)
            const isActive = hoveredUnobservable === label.data.id ||
                            StateManager.focusedOrb === label.data.id;
            label.element.classList.toggle('hovered', isActive);
        }
    });
}

// ============================================================
// Tooltip
// ============================================================

function updateTooltip() {
    const tooltip = document.getElementById('tooltip');
    const tooltipTitle = document.getElementById('tooltipTitle');
    const tooltipText = document.getElementById('tooltipText');

    // Hide tooltip on touch devices - use bottom sheet detail panel instead
    if (isTouchDevice) {
        tooltip.classList.remove('visible');
        return;
    }

    if (hoveredUnobservable) {
        const u = CONFIG.unobservables.find(u => u.id === hoveredUnobservable);
        if (u) {
            tooltipTitle.textContent = u.title;
            tooltipText.textContent = u.description;
            tooltip.style.left = (mouseClient.x + 20) + 'px';
            tooltip.style.top = (mouseClient.y - 20) + 'px';
            tooltip.classList.add('visible');
        }
    } else {
        tooltip.classList.remove('visible');
    }
}

// ============================================================
// Raycasting
// ============================================================

let previousHoveredOrb = null;

function checkHover() {
    const raycaster = new THREE.Raycaster();
    const mouseVec = new THREE.Vector2(mouse.x, mouse.y);
    raycaster.setFromCamera(mouseVec, camera);

    const orbs = unobservableObjects.map(g => g.children[0]);
    const intersects = raycaster.intersectObjects(orbs);

    if (intersects.length > 0) {
        const obj = intersects[0].object.parent;
        const newHoveredId = obj.userData.unobservable.id;

        // Play sound when hovering a new orb
        if (newHoveredId !== previousHoveredOrb) {
            const orbIndex = obj.userData.index;
            AudioManager.playHoverSound(orbIndex);
            previousHoveredOrb = newHoveredId;
        }

        hoveredUnobservable = newHoveredId;
        document.body.style.cursor = 'pointer';
    } else {
        hoveredUnobservable = null;
        previousHoveredOrb = null;
        document.body.style.cursor = 'default';
    }
}

// ============================================================
// Animation
// ============================================================

function animate() {
    requestAnimationFrame(animate);

    time += 0.016;

    // Update OrbitControls for smooth damping
    if (controls) {
        controls.update();

        // Auto-orbit when idle for 30 seconds
        const IDLE_THRESHOLD = 30000; // 30 seconds
        if (StateManager.isIdle(IDLE_THRESHOLD) && !StateManager.focusedOrb) {
            if (!controls.autoRotate) {
                controls.autoRotate = true;
                controls.autoRotateSpeed = 0.3;
                StateManager.isAutoOrbit = true;
            }
        } else {
            if (controls.autoRotate) {
                controls.autoRotate = false;
                StateManager.isAutoOrbit = false;
            }
        }
    }

    // Light cone flicker
    if (lightCone) {
        lightCone.material.opacity = 0.06 + Math.sin(time * 3) * 0.02;
    }

    // ===== AI ROBOT ANIMATIONS =====

    // Update robot patrol movement
    updateAIRobotMovement(0.016);

    // Robot bobbing animation (gentle hover effect)
    if (aiRobot) {
        const bobAmount = Math.sin(time * 0.5) * 0.02;
        aiRobot.position.y = bobAmount;

        // Subtle tilt while moving
        if (aiRobotState.phase === 'moving') {
            aiRobot.rotation.x = Math.sin(time * 3) * 0.02;
            aiRobot.rotation.z = Math.cos(time * 2.5) * 0.015;
        } else {
            aiRobot.rotation.x *= 0.95;
            aiRobot.rotation.z *= 0.95;
        }
    }

    // Inner head glow pulse (gradient sphere)
    if (aiInnerHeadMaterial) {
        aiInnerHeadMaterial.emissiveIntensity = 0.35 + Math.sin(time * 0.6) * 0.15;
    }

    // Eye blink (periodic)
    if (aiEyeMaterial) {
        const blinkCycle = (time * 0.15) % 1;
        if (blinkCycle > 0.95) {
            aiEyeMaterial.opacity = 0.3;
        } else {
            aiEyeMaterial.opacity = 0.85;
        }
    }

    // Update AI label position to follow robot
    if (aiRobot) {
        const aiLabel = labelElements.find(l => l.isFixed && l.element?.textContent === 'AI');
        if (aiLabel) {
            aiLabel.position.set(aiRobot.position.x, 1.5, aiRobot.position.z);
        }
    }

    // ===== HUMAN ANIMATIONS =====

    // Update human patrol movement
    updateHumanMovement(0.016);

    // Update Human label position to follow human model
    if (humanModel) {
        const humanLabel = labelElements.find(l => l.isFixed && l.element?.textContent === 'Human');
        if (humanLabel) {
            humanLabel.position.set(humanModel.position.x, 2.2, humanModel.position.z);
        }
    }

    // Fallback animations (only used if GLB fails to load)
    if (humanArm) {
        humanArm.rotation.z = -1.2 + Math.sin(time * 0.5) * 0.1;
    }
    if (humanMaterial) {
        const heartbeat = 0.4 + Math.sin(time * 1.0) * 0.15;
        humanMaterial.emissiveIntensity = heartbeat;
    }
    if (humanBody) {
        const breathScale = 1 + Math.sin(time * 0.4) * 0.015;
        humanBody.scale.y = breathScale;
    }

    // Update dust particles
    updateDustParticles();



    // Update constellation lines (visible when zoomed out)
    updateConstellationLines();

    // Update proximity glow (orbs glow brighter when camera is close)
    updateProximityGlow();

    // Animate unobservables - gentle floating motion + unique effects
    unobservableObjects.forEach((group, i) => {
        const baseY = group.userData.baseY;
        group.position.y = baseY + Math.sin(time * 0.5 + i * 0.7) * 0.08;

        const isHovered = hoveredUnobservable === group.userData.unobservable.id;
        const isFocused = StateManager.focusedOrb === group.userData.unobservable.id;
        const targetScale = (isHovered || isFocused) ? 1.3 : 1.0;
        const currentScale = group.scale.x;
        const newScale = currentScale + (targetScale - currentScale) * 0.1;
        group.scale.setScalar(newScale);

        // Apply orb-specific animation effect
        const effect = group.userData.effect;
        if (effect && effect.animate) {
            effect.animate(group, time);
        }

        // Animate opacity for hover feedback
        const orb = group.children[0];
        const glow = group.children[1];
        orb.material.opacity = isHovered ? 1.0 : 0.9;
        glow.material.opacity = isHovered ? 0.25 : 0.12;
    });

    // Update connection line when hovering
    updateConnectionLine();

    checkHover();
    updateLabels();
    updateTooltip();

    renderer.render(scene, camera);
}

// ============================================================
// Events
// ============================================================

function setupEvents() {
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    document.addEventListener('mousemove', (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        mouseClient.x = e.clientX;
        mouseClient.y = e.clientY;
        StateManager.recordInteraction();
    });

    document.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        mouseClient.x = touch.clientX;
        mouseClient.y = touch.clientY;
        StateManager.recordInteraction();
    });

    // Touch-to-select orbs (mobile tap support)
    document.addEventListener('touchstart', (e) => {
        // Skip if touching UI elements
        if (e.target.closest('.view-btn, .detail-panel, .legend, .header, .audio-btn, .view-controls')) {
            return;
        }

        const touch = e.touches[0];
        const touchMouse = new THREE.Vector2(
            (touch.clientX / window.innerWidth) * 2 - 1,
            -(touch.clientY / window.innerHeight) * 2 + 1
        );

        // Raycast to find orb
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(touchMouse, camera);
        const orbs = unobservableObjects.map(g => g.children[0]);
        const intersects = raycaster.intersectObjects(orbs);

        if (intersects.length > 0) {
            const orbId = intersects[0].object.parent.userData.unobservable.id;

            // If already focused on this orb, let OrbitControls handle it
            if (StateManager.focusedOrb === orbId) return;

            e.preventDefault();
            e.stopPropagation();
            StateManager.recordInteraction();
            focusOnOrb(orbId);
        }
    }, { passive: false });

    // Click to focus on unobservables
    document.addEventListener('click', (e) => {
        StateManager.recordInteraction();

        // Check if clicking on UI elements
        if (e.target.closest('.view-btn') ||
            e.target.closest('.detail-panel') ||
            e.target.closest('.legend') ||
            e.target.closest('.header') ||
            e.target.closest('.audio-btn')) {
            return;
        }

        // Check if clicking on an unobservable orb
        if (hoveredUnobservable) {
            // If clicking on a different orb than currently focused, switch to it
            if (StateManager.focusedOrb !== hoveredUnobservable) {
                focusOnOrb(hoveredUnobservable);
            }
            return;
        }

        // If focused and clicking elsewhere (not on an orb), exit focus
        if (StateManager.focusedOrb) {
            exitFocus();
        }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        StateManager.recordInteraction();

        switch(e.key) {
            case 'Escape':
                exitFocus();
                break;
            case '1':
                transitionToPreset('ai');
                break;
            case '2':
                transitionToPreset('human');
                break;
            case '3':
                transitionToPreset('overview');
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                focusNextOrb(1);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                focusNextOrb(-1);
                break;
        }
    });

    // Scroll and mouse wheel record interaction
    document.addEventListener('wheel', () => {
        StateManager.recordInteraction();
    });

    document.addEventListener('mousedown', () => {
        StateManager.recordInteraction();
    });

    // Setup bottom sheet gestures for mobile
    setupBottomSheetGestures();
}

// Bottom sheet swipe-to-dismiss gesture
function setupBottomSheetGestures() {
    if (!isTouchDevice) return;

    const panel = document.getElementById('detailPanel');
    let startY = 0;
    let currentY = 0;

    panel.addEventListener('touchstart', (e) => {
        // Don't interfere with nav button taps
        if (e.target.closest('.detail-panel__nav-btn, .detail-panel__close')) return;
        startY = e.touches[0].clientY;
    }, { passive: true });

    panel.addEventListener('touchmove', (e) => {
        if (startY === 0) return;
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        // Only allow dragging down
        if (deltaY > 0) {
            panel.style.transform = `translateY(${deltaY}px)`;
        }
    }, { passive: true });

    panel.addEventListener('touchend', () => {
        const deltaY = currentY - startY;
        // Dismiss if dragged more than 100px down
        if (deltaY > 100) {
            exitFocus();
        }
        panel.style.transform = '';
        startY = 0;
        currentY = 0;
    });
}

// Mobile onboarding overlay
function showMobileOnboarding() {
    if (!isTouchDevice) return;
    if (localStorage.getItem('complementarity-onboarding-dismissed')) return;

    const overlay = document.getElementById('mobileOnboarding');
    if (overlay) {
        setTimeout(() => overlay.classList.add('visible'), 500);
        // Auto-dismiss after 8 seconds
        setTimeout(() => dismissOnboarding(), 8000);
    }
}

function dismissOnboarding() {
    const overlay = document.getElementById('mobileOnboarding');
    if (overlay) {
        overlay.classList.remove('visible');
        localStorage.setItem('complementarity-onboarding-dismissed', 'true');
    }
}

// Navigate to next/previous orb
function focusNextOrb(direction) {
    const orbs = CONFIG.unobservables;
    if (orbs.length === 0) return;

    let currentIndex = -1;
    if (StateManager.focusedOrb) {
        currentIndex = orbs.findIndex(u => u.id === StateManager.focusedOrb);
    }

    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = orbs.length - 1;
    if (nextIndex >= orbs.length) nextIndex = 0;

    focusOnOrb(orbs[nextIndex].id);
}

// ============================================================
// Intro
// ============================================================

function playIntro() {
    // Start orbs hidden (scale 0)
    unobservableObjects.forEach(group => {
        group.scale.setScalar(0);
    });

    setTimeout(() => {
        document.getElementById('quote').classList.add('visible');
    }, 500);

    setTimeout(() => {
        document.getElementById('legend').classList.add('visible');
        // Show scene labels
        document.getElementById('labelObservable')?.classList.add('visible');
        document.getElementById('labelUnobservable')?.classList.add('visible');
    }, 1000);

    // Reveal unobservable orbs with staggered animation
    setTimeout(() => {
        revealUnobservables();
    }, 1500);

    setTimeout(() => {
        document.getElementById('controlsHint').classList.add('visible');
    }, 3500);

    // Show mobile onboarding after intro animations
    setTimeout(() => {
        showMobileOnboarding();
    }, 4000);

    // Camera animation - zoom in from further corner
    if (typeof gsap !== 'undefined') {
        const startPos = { x: 20, y: 18, z: 22 };
        camera.position.set(startPos.x, startPos.y, startPos.z);

        gsap.to(camera.position, {
            x: 12,
            y: 12,
            z: 14,
            duration: 2.5,
            ease: 'power2.out',
            onUpdate: () => {
                if (controls) {
                    controls.update();
                }
            }
        });
    }
}

// Staggered reveal animation for unobservable orbs
function revealUnobservables() {
    if (typeof gsap === 'undefined') {
        // Fallback: just show them
        unobservableObjects.forEach(group => {
            group.scale.setScalar(1);
        });
        return;
    }

    unobservableObjects.forEach((group, i) => {
        gsap.to(group.scale, {
            x: 1,
            y: 1,
            z: 1,
            duration: 0.8,
            delay: i * 0.12,
            ease: 'back.out(1.7)'
        });
    });
}

// ============================================================
// Start
// ============================================================

window.addEventListener('DOMContentLoaded', init);
