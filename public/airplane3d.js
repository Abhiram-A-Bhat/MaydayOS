window.init3DAircraft = function(container) {
    if (!container) return null;

    container.innerHTML = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x071114);

    const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 1000);
    // 45-degree perspective from above, not so zoomed in
    camera.position.set(6, 6, 8); 
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // High-contrast white and orange theme
    const fuselageMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 }); // White
    const wingMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 60 }); // Grey
    const controlMat = new THREE.MeshPhongMaterial({ color: 0xff6600, emissive: 0x331000, shininess: 80 }); // Bright orange
    const flapMat = new THREE.MeshPhongMaterial({ color: 0xffca3a, emissive: 0x332000, shininess: 80 });
    const detailMat = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 100 }); // Dark for windows

    const airplane = new THREE.Group();

    // 1. Fuselage
    const fuselageGeo = new THREE.CylinderGeometry(0.3, 0.3, 3.5, 32);
    fuselageGeo.rotateX(Math.PI / 2);
    const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
    airplane.add(fuselage);

    // Nose Cone
    const noseGeo = new THREE.SphereGeometry(0.3, 32, 16);
    const nose = new THREE.Mesh(noseGeo, fuselageMat);
    nose.position.z = -1.75;
    airplane.add(nose);

    // Tail Taper (makes it thin at the end)
    const tailGeo = new THREE.CylinderGeometry(0.05, 0.3, 1.5, 32);
    tailGeo.rotateX(Math.PI / 2);
    const tailCone = new THREE.Mesh(tailGeo, fuselageMat);
    tailCone.position.z = 2.5; 
    airplane.add(tailCone);

    // --- ADDED DETAILS ---
    // Cockpit Windows (Flush Wrap-around)
    const cockpitGroup = new THREE.Group();
    
    // Very thin boxes to look flush
    const centerWin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.02), detailMat);
    centerWin.position.set(0, 0.22, -1.88); // Pushed in to be flush
    cockpitGroup.add(centerWin);
    
    const sideWinL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.02), detailMat);
    sideWinL.position.set(-0.16, 0.2, -1.82);
    sideWinL.rotation.y = Math.PI / 4;
    cockpitGroup.add(sideWinL);
    
    const sideWinR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.02), detailMat);
    sideWinR.position.set(0.16, 0.2, -1.82);
    sideWinR.rotation.y = -Math.PI / 4;
    cockpitGroup.add(sideWinR);
    
    airplane.add(cockpitGroup);

    // Passenger Windows (Flush)
    const windowGeo = new THREE.BoxGeometry(0.01, 0.06, 0.06); // Extremely thin
    for (let i = 0; i < 8; i++) {
        const zPos = -1.2 + (i * 0.35);
        // Left side windows (placed exactly at radius 0.3)
        const winL = new THREE.Mesh(windowGeo, detailMat);
        winL.position.set(-0.3, 0.05, zPos);
        airplane.add(winL);
        // Right side windows
        const winR = new THREE.Mesh(windowGeo, detailMat);
        winR.position.set(0.3, 0.05, zPos);
        airplane.add(winR);
    }
    // ---------------------

    // 2. Main Wings
    const wingGeo = new THREE.BoxGeometry(4.5, 0.05, 0.8);
    const wings = new THREE.Mesh(wingGeo, wingMat);
    wings.position.set(0, 0, -0.2); 
    airplane.add(wings);

    // Left Aileron Hinge
    const leftAileronHinge = new THREE.Group();
    leftAileronHinge.position.set(-1.4, 0, 0.4); 
    wings.add(leftAileronHinge);
    
    const aileronGeo = new THREE.BoxGeometry(1.2, 0.04, 0.3);
    const leftAileron = new THREE.Mesh(aileronGeo, controlMat);
    leftAileron.position.set(0, 0, 0.15); 
    leftAileronHinge.add(leftAileron);

    // Right Aileron Hinge
    const rightAileronHinge = new THREE.Group();
    rightAileronHinge.position.set(1.4, 0, 0.4); 
    wings.add(rightAileronHinge);
    
    const rightAileron = new THREE.Mesh(aileronGeo, controlMat);
    rightAileron.position.set(0, 0, 0.15);
    rightAileronHinge.add(rightAileron);

    // Inner flaps, separate from ailerons, so pitch/instability visibly deploys them
    const flapGeo = new THREE.BoxGeometry(0.75, 0.045, 0.34);
    const leftFlapHinge = new THREE.Group();
    leftFlapHinge.position.set(-0.45, 0, 0.4);
    wings.add(leftFlapHinge);
    const leftFlap = new THREE.Mesh(flapGeo, flapMat);
    leftFlap.position.set(0, 0, 0.17);
    leftFlapHinge.add(leftFlap);

    const rightFlapHinge = new THREE.Group();
    rightFlapHinge.position.set(0.45, 0, 0.4);
    wings.add(rightFlapHinge);
    const rightFlap = new THREE.Mesh(flapGeo, flapMat);
    rightFlap.position.set(0, 0, 0.17);
    rightFlapHinge.add(rightFlap);

    // 3. Tail (Horizontal Stabilizer)
    const tailWingGeo = new THREE.BoxGeometry(1.6, 0.05, 0.6);
    const tailWing = new THREE.Mesh(tailWingGeo, wingMat);
    tailWing.position.set(0, 0, 1.8);
    airplane.add(tailWing);

    // Elevator Hinge
    const elevatorHinge = new THREE.Group();
    elevatorHinge.position.set(0, 0, 0.3); 
    tailWing.add(elevatorHinge);

    const elevatorGeo = new THREE.BoxGeometry(1.6, 0.04, 0.25);
    const elevator = new THREE.Mesh(elevatorGeo, controlMat);
    elevator.position.set(0, 0, 0.125);
    elevatorHinge.add(elevator);

    // 4. Vertical Stabilizer
    const vertStabilizerGeo = new THREE.BoxGeometry(0.05, 0.8, 0.6);
    const vertStabilizer = new THREE.Mesh(vertStabilizerGeo, wingMat);
    vertStabilizer.position.set(0, 0.4, 1.8);
    airplane.add(vertStabilizer);

    // Rudder Hinge
    const rudderHinge = new THREE.Group();
    rudderHinge.position.set(0, 0, 0.3); 
    vertStabilizer.add(rudderHinge);

    const rudderGeo = new THREE.BoxGeometry(0.04, 0.8, 0.3);
    const rudder = new THREE.Mesh(rudderGeo, controlMat);
    rudder.position.set(0, 0, 0.15);
    rudderHinge.add(rudder);

    // === POSITIONING ===
    // Nose points towards North-East (away and to the right)
    airplane.rotation.set(0, -Math.PI / 4, 0); 
    
    // Scale up to make it bigger as requested
    airplane.scale.set(1.4, 1.4, 1.4);

    scene.add(airplane);

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        if(!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    return {
        updateAttitude: (pitchDeg, rollDeg, yawDeg) => {
            const pitch = THREE.MathUtils.degToRad(pitchDeg);
            const roll = THREE.MathUtils.degToRad(rollDeg);
            let normalizedYaw = yawDeg % 360;
            if (normalizedYaw > 180) normalizedYaw -= 360;
            if (normalizedYaw < -180) normalizedYaw += 360;
            const yaw = THREE.MathUtils.degToRad(normalizedYaw);

            const maxAileron = THREE.MathUtils.degToRad(38); 
            const maxElevatorUp = THREE.MathUtils.degToRad(36); 
            const maxElevatorDown = THREE.MathUtils.degToRad(28); 
            const maxRudder = THREE.MathUtils.degToRad(38); 
            const maxFlap = THREE.MathUtils.degToRad(34);

            // Roll -> ailerons. Use normalized degrees so the motion is obvious in the demo.
            const rollFactor = THREE.MathUtils.clamp(rollDeg / 38, -1, 1);
            rightAileronHinge.rotation.x = -rollFactor * maxAileron;
            leftAileronHinge.rotation.x = rollFactor * maxAileron;

            // Pitch -> Elevators
            const pitchFactor = THREE.MathUtils.clamp(pitchDeg / 42, -1, 1);
            let elevatorAngle = pitchFactor * maxElevatorDown; 
            if (pitchFactor < 0) {
                elevatorAngle = pitchFactor * maxElevatorUp;
            }
            elevatorHinge.rotation.x = Math.max(-maxElevatorUp, Math.min(maxElevatorDown, elevatorAngle));

            // Yaw -> Rudder
            const yawFactor = THREE.MathUtils.clamp(normalizedYaw / 45, -1, 1); 
            rudderHinge.rotation.y = -yawFactor * maxRudder;

            // Flaps deploy together during aggressive pitch/roll changes, making stabilization visible.
            const instability = THREE.MathUtils.clamp((Math.abs(pitchDeg) + Math.abs(rollDeg) * 0.7) / 85, 0, 1);
            const flapAngle = instability * maxFlap;
            leftFlapHinge.rotation.x = flapAngle;
            rightFlapHinge.rotation.x = flapAngle;

            airplane.rotation.x = THREE.MathUtils.clamp(pitch * 0.35, -0.45, 0.45);
            airplane.rotation.z = THREE.MathUtils.clamp(-roll * 0.42, -0.7, 0.7);
            airplane.rotation.y = -Math.PI / 4 + THREE.MathUtils.clamp(yaw * 0.18, -0.55, 0.55);
        }
    };
};
