import * as THREE from 'three';
import { CircleCollisionHit, SpatialColliderGrid } from './colliders';
import { RoadNetwork } from './roadNetwork';
import { MinimapPoint } from './types';

export interface RailwaySystem {
  crossingPos: THREE.Vector3;
  crossingEdgeId: string;
  crossingEdgeS: number;
  nearRail: (x: number, z: number, margin?: number) => boolean;
  isCrossingActive: () => boolean;
  update: (
    dt: number,
    playerX: number,
    playerZ: number,
    onTrainHorn: (distanceMeters: number) => void,
  ) => void;
  resolvePlayerCollision: (
    px: number,
    py: number,
    pz: number,
    radius: number,
    out: CircleCollisionHit,
  ) => boolean;
  getMinimapPoints: (
    worldToMinimap: (x: number, z: number) => { nx: number; ny: number },
  ) => MinimapPoint[];
}

interface TrainUnit {
  group: THREE.Group;
  x: number;
  y: number;
  z: number;
  yaw: number;
  cosY: number;
  sinY: number;
  hx: number;
  hz: number;
  offsetBehindLoco: number;
}

const CYCLE_SEC = 72; // Train passes every 72 seconds (within 60-90s cadence)
const TRAIN_SPEED = 29; // m/s (~104 km/h)
const UNIT_COUNT = 7; // 1 locomotive + 6 freight/passenger wagons
const UNIT_SPACING = 15.2;

export function buildRailwaySystem(
  scene: THREE.Scene,
  network: RoadNetwork,
  colliders: SpatialColliderGrid,
): RailwaySystem {
  const crossEdge = network.edgeMap.get('e_bayshore_east') ?? network.edges[0];
  const crossIdx = Math.floor(crossEdge.samples.length * 0.5);
  const crossSamp = crossEdge.samples[crossIdx];
  const crossingPos = crossSamp.pos.clone();
  const roadTan = crossSamp.tan.clone().normalize();
  const roadNorm = crossSamp.norm.clone().normalize(); // perpendicular to Bayshore Blvd

  // Smooth 780m valley corridor crossing Bayshore Blvd perpendicularly at y = 0
  const ctrlPts = [
    crossingPos.clone().addScaledVector(roadNorm, -330).addScaledVector(roadTan, -18),
    crossingPos.clone().addScaledVector(roadNorm, -170).addScaledVector(roadTan, -5),
    crossingPos.clone().addScaledVector(roadNorm, -32),
    crossingPos.clone(),
    crossingPos.clone().addScaledVector(roadNorm, 32),
    crossingPos.clone().addScaledVector(roadNorm, 78).addScaledVector(roadTan, 58),
    crossingPos.clone().addScaledVector(roadNorm, 86).addScaledVector(roadTan, 195),
    crossingPos.clone().addScaledVector(roadNorm, 72).addScaledVector(roadTan, 330),
  ];
  for (const pt of ctrlPts) pt.y = 0;

  const railCurve = new THREE.CatmullRomCurve3(ctrlPts, false, 'catmullrom', 0.45);
  const railLength = railCurve.getLength();
  const sampleCount = Math.ceil(railLength / 2);
  const railPoints = railCurve.getSpacedPoints(sampleCount);
  const stepMeters = railLength / sampleCount;

  const railTangents: THREE.Vector3[] = [];
  const railNormals: THREE.Vector3[] = [];
  let crossRailS = railLength * 0.45;
  let bestCrossDist = Infinity;

  for (let i = 0; i < railPoints.length; i++) {
    const prev = railPoints[Math.max(0, i - 1)];
    const next = railPoints[Math.min(railPoints.length - 1, i + 1)];
    const tan = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z).normalize();
    const norm = new THREE.Vector3(-tan.z, 0, tan.x);
    railTangents.push(tan);
    railNormals.push(norm);
    const d = Math.hypot(railPoints[i].x - crossingPos.x, railPoints[i].z - crossingPos.z);
    if (d < bestCrossDist) {
      bestCrossDist = d;
      crossRailS = i * stepMeters;
    }
  }

  const nearRail = (x: number, z: number, margin = 8): boolean => {
    for (let i = 0; i < railPoints.length; i += 2) {
      const p = railPoints[i];
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz < margin * margin) return true;
    }
    return false;
  };

  // ================= 1. Ballast Bed, Sleepers, Twin Steel Rails & Fences =================
  {
    // Crushed gravel ballast ribbon
    const bPos: number[] = [];
    const bIdx: number[] = [];
    for (let i = 0; i < railPoints.length; i++) {
      const p = railPoints[i];
      const n = railNormals[i];
      bPos.push(
        p.x + n.x * 2.35,
        0.032,
        p.z + n.z * 2.35,
        p.x - n.x * 2.35,
        0.032,
        p.z - n.z * 2.35,
      );
      if (i < railPoints.length - 1) {
        const q = i * 2;
        bIdx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    }
    const ballastGeo = new THREE.BufferGeometry();
    ballastGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
    ballastGeo.setIndex(bIdx);
    ballastGeo.computeVertexNormals();
    const ballastMat = new THREE.MeshStandardMaterial({
      color: 0x57534e,
      roughness: 0.96,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const ballastMesh = new THREE.Mesh(ballastGeo, ballastMat);
    ballastMesh.receiveShadow = true;
    scene.add(ballastMesh);

    // Instanced wooden sleepers
    const sleeperStep = 1.25;
    const sleeperCount = Math.floor(railLength / sleeperStep);
    const sleeperGeo = new THREE.BoxGeometry(3.1, 0.12, 0.3);
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x452c1a, roughness: 0.92 });
    const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, sleeperCount);
    const sd = new THREE.Object3D();
    let sc = 0;
    for (let i = 0; i < sleeperCount; i++) {
      const s = i * sleeperStep;
      if (Math.abs(s - crossRailS) < crossEdge.width * 0.5 + 1.5) continue;
      const idx = Math.min(railPoints.length - 1, Math.floor(s / stepMeters));
      const p = railPoints[idx];
      const t = railTangents[idx];
      sd.position.set(p.x, 0.08, p.z);
      sd.rotation.set(0, Math.atan2(t.x, t.z), 0);
      sd.updateMatrix();
      sleepers.setMatrixAt(sc++, sd.matrix);
    }
    sleepers.count = sc;
    sleepers.receiveShadow = true;
    sleepers.computeBoundingSphere();
    scene.add(sleepers);

    // Twin continuous steel rails
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      metalness: 0.85,
      roughness: 0.28,
    });
    for (const side of [-0.82, 0.82]) {
      const rPos: number[] = [];
      const rIdx: number[] = [];
      for (let i = 0; i < railPoints.length; i++) {
        const p = railPoints[i];
        const n = railNormals[i];
        const cx = p.x + n.x * side;
        const cz = p.z + n.z * side;
        rPos.push(cx - n.x * 0.06, 0.16, cz - n.z * 0.06, cx + n.x * 0.06, 0.16, cz + n.z * 0.06);
        if (i < railPoints.length - 1) {
          const q = i * 2;
          rIdx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
        }
      }
      const railGeo = new THREE.BufferGeometry();
      railGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
      railGeo.setIndex(rIdx);
      railGeo.computeVertexNormals();
      const railMesh = new THREE.Mesh(railGeo, railMat);
      scene.add(railMesh);
    }

    // Perimeter railway fences (open at the Bayshore Blvd level crossing!)
    const fencePosts: THREE.Matrix4[] = [];
    const fenceRails: THREE.Matrix4[] = [];
    const fenceDistSkip = crossEdge.width * 0.5 + 4.5;
    for (let i = 4; i < railPoints.length - 4; i += 3) {
      const s = i * stepMeters;
      if (Math.abs(s - crossRailS) < fenceDistSkip) continue;
      const p = railPoints[i];
      const n = railNormals[i];
      const t = railTangents[i];
      const yaw = Math.atan2(t.x, t.z);
      for (const side of [-1, 1]) {
        const fx = p.x + n.x * side * 3.8;
        const fz = p.z + n.z * side * 3.8;
        if (network.distToAnyRoadEdge(fx, fz) < 2.2) continue;

        sd.position.set(fx, 0.65, fz);
        sd.rotation.set(0, yaw, 0);
        sd.scale.set(1, 1, 1);
        sd.updateMatrix();
        fencePosts.push(sd.matrix.clone());

        if (i + 3 < railPoints.length - 4 && Math.abs((i + 3) * stepMeters - crossRailS) >= fenceDistSkip) {
          const np = railPoints[i + 3];
          const nn = railNormals[i + 3];
          const nfx = np.x + nn.x * side * 3.8;
          const nfz = np.z + nn.z * side * 3.8;
          const span = Math.hypot(nfx - fx, nfz - fz);
          if (span < 10) {
            const spanYaw = Math.atan2(nfx - fx, nfz - fz);
            sd.position.set((fx + nfx) * 0.5, 1.0, (fz + nfz) * 0.5);
            sd.rotation.set(0, spanYaw, 0);
            sd.scale.set(1, 1, span);
            sd.updateMatrix();
            fenceRails.push(sd.matrix.clone());

            colliders.addObb((fx + nfx) * 0.5, (fz + nfz) * 0.5, 0.25, span * 0.52, spanYaw, -0.5, 2.2);
          }
        }
      }
    }
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.72, metalness: 0.35 });
    if (fencePosts.length > 0) {
      const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.3, 0.14), fenceMat, fencePosts.length);
      for (let i = 0; i < fencePosts.length; i++) pm.setMatrixAt(i, fencePosts[i]);
      pm.computeBoundingSphere();
      scene.add(pm);
    }
    if (fenceRails.length > 0) {
      const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.1, 1), fenceMat, fenceRails.length);
      for (let i = 0; i < fenceRails.length; i++) rm.setMatrixAt(i, fenceRails[i]);
      rm.computeBoundingSphere();
      scene.add(rm);
    }

    // Two Brick/Concrete Railway Tunnel Portals at corridor ends so train emerges/exits cleanly
    const portalMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.9 });
    const darkVoidMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
    for (const endIdx of [2, railPoints.length - 3]) {
      const p = railPoints[endIdx];
      const t = railTangents[endIdx];
      const portal = new THREE.Group();
      portal.position.set(p.x, 0, p.z);
      portal.rotation.y = Math.atan2(t.x, t.z);

      const arch = new THREE.Mesh(new THREE.BoxGeometry(9.2, 7.6, 5.2), portalMat);
      arch.position.set(0, 3.8, 0);
      arch.castShadow = true;
      portal.add(arch);

      const bore = new THREE.Mesh(new THREE.BoxGeometry(4.8, 5.6, 5.35), darkVoidMat);
      bore.position.set(0, 2.8, 0);
      portal.add(bore);

      scene.add(portal);
      colliders.addObb(p.x, p.z, 4.6, 2.6, portal.rotation.y, 0, 8);
    }
  }

  // ================= 2. Level Crossing (Deck, Animated Barriers & Flashing Red Signals) =================
  const barrierPivots: THREE.Group[] = [];
  const barrierWorldCenters: Array<{ x: number; z: number; yaw: number; halfLen: number }> = [];
  const redBulbMatA = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.05, 0.05) });
  const redBulbMatB = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.05, 0.05) });

  {
    const crossYaw = Math.atan2(roadTan.x, roadTan.z);
    const deckGroup = new THREE.Group();
    deckGroup.position.set(crossingPos.x, 0, crossingPos.z);
    deckGroup.rotation.y = crossYaw;

    // Concrete/rubber crossing mat flush with road asphalt (y = 0.052)
    const matGeo = new THREE.PlaneGeometry(crossEdge.width + 0.4, 5.4);
    matGeo.rotateX(-Math.PI / 2);
    const matMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.78,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const crossMatMesh = new THREE.Mesh(matGeo, matMat);
    crossMatMesh.position.y = 0.052;
    crossMatMesh.receiveShadow = true;
    deckGroup.add(crossMatMesh);

    // Yellow warning stop stripes across the road on both approaches
    const stripeMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    });
    const stripeGeo = new THREE.PlaneGeometry(crossEdge.width - 1.0, 0.42);
    stripeGeo.rotateX(-Math.PI / 2);
    for (const sz of [-10.5, 10.5]) {
      const st = new THREE.Mesh(stripeGeo, stripeMat);
      st.position.set(0, 0.058, sz);
      deckGroup.add(st);
    }
    scene.add(deckGroup);

    // Two Animated Crossing Gate Assemblies + Flashing Red Lights
    const postMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.4 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.38 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.38 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6 });

    for (const side of [-1, 1]) {
      // Positioned on right approach side of each direction
      const postLocalX = side * (crossEdge.width * 0.5 + 1.5);
      const postLocalZ = -side * 6.8;
      const wx = crossingPos.x + roadNorm.x * postLocalX + roadTan.x * postLocalZ;
      const wz = crossingPos.z + roadNorm.z * postLocalX + roadTan.z * postLocalZ;

      const gate = new THREE.Group();
      gate.position.set(wx, 0, wz);
      gate.rotation.y = crossYaw + (side === 1 ? 0 : Math.PI);

      // Signal mast + flashing lights + crossbuck X
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 4.4, 8), postMat);
      mast.position.set(0, 2.2, 0);
      mast.castShadow = true;
      gate.add(mast);

      const housing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.46, 0.25), darkMat);
      housing.position.set(0, 3.1, 0.14);
      gate.add(housing);

      const bulbA = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), redBulbMatA);
      bulbA.position.set(-0.36, 3.1, 0.28);
      const bulbB = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), redBulbMatB);
      bulbB.position.set(0.36, 3.1, 0.28);
      gate.add(bulbA, bulbB);

      for (const tilt of [Math.PI / 4, -Math.PI / 4]) {
        const xb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.08), whiteMat);
        xb.position.set(0, 3.95, 0.12);
        xb.rotation.z = tilt;
        gate.add(xb);
      }

      // Pivoting Striped Barrier Arm (vertical at angle 0 -> horizontal across road at +PI/2)
      const pivot = new THREE.Group();
      pivot.position.set(0, 1.2, 0);
      const armLen = crossEdge.width * 0.56;
      const segments = 6;
      const segLen = armLen / segments;
      for (let k = 0; k < segments; k++) {
        const seg = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, segLen, 0.14),
          k % 2 === 0 ? redMat : whiteMat,
        );
        seg.position.set(0, (k + 0.5) * segLen, 0);
        pivot.add(seg);
      }
      gate.add(pivot);
      scene.add(gate);
      barrierPivots.push(pivot);

      colliders.addCylinder(wx, wz, 0.35, 0, 5);

      // Compute center of lowered barrier across its lane for solid collision when closed
      const dirSign = side === 1 ? -1 : 1;
      const midDist = crossEdge.width * 0.28;
      barrierWorldCenters.push({
        x: wx + roadNorm.x * dirSign * midDist,
        z: wz + roadNorm.z * dirSign * midDist,
        yaw: crossYaw,
        halfLen: armLen * 0.5,
      });
    }
  }

  // ================= 3. Moving Train (Locomotive + 6 Wagons) =================
  const trainUnits: TrainUnit[] = [];
  const trainRoot = new THREE.Group();
  scene.add(trainRoot);

  {
    const locoBodyMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.38, metalness: 0.35 });
    const locoStripeMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
    const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.4 });
    const cabGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.15, clearcoat: 0.9 });
    const headGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.4, 1.8) });
    const wagonColors = [0x1d4ed8, 0x0f766e, 0xd97706, 0x475569, 0x0369a1, 0x15803d];

    for (let i = 0; i < UNIT_COUNT; i++) {
      const g = new THREE.Group();
      if (i === 0) {
        // Diesel-Electric Locomotive
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 13.8), darkSteelMat);
        chassis.position.y = 0.75;
        chassis.castShadow = true;
        g.add(chassis);

        const hull = new THREE.Mesh(new THREE.BoxGeometry(3.05, 2.6, 13.0), locoBodyMat);
        hull.position.set(0, 2.35, -0.15);
        hull.castShadow = true;
        g.add(hull);

        const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.12, 0.38, 13.1), locoStripeMat);
        stripe.position.set(0, 1.75, -0.15);
        g.add(stripe);

        const cab = new THREE.Mesh(new THREE.BoxGeometry(3.16, 1.4, 3.6), locoBodyMat);
        cab.position.set(0, 3.6, 4.1);
        g.add(cab);

        const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.85, 0.16), cabGlassMat);
        windshield.position.set(0, 3.68, 5.92);
        g.add(windshield);

        const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.14), headGlowMat);
        headlight.position.set(0, 2.35, 6.45);
        g.add(headlight);
      } else {
        // Freight Container / Box Wagons
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.55, 13.4), darkSteelMat);
        chassis.position.y = 0.7;
        chassis.castShadow = true;
        g.add(chassis);

        const boxMat = new THREE.MeshStandardMaterial({
          color: wagonColors[(i - 1) % wagonColors.length],
          roughness: 0.62,
          metalness: 0.18,
        });
        const container = new THREE.Mesh(new THREE.BoxGeometry(2.96, 2.65, 12.6), boxMat);
        container.position.y = 2.32;
        container.castShadow = true;
        container.receiveShadow = true;
        g.add(container);

        const roof = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.2, 12.7), darkSteelMat);
        roof.position.y = 3.7;
        g.add(roof);
      }

      // Bogies / Steel wheels
      for (const bz of [-4.2, 4.2]) {
        const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.55, 2.4), darkSteelMat);
        bogie.position.set(0, 0.42, bz);
        g.add(bogie);
      }

      trainRoot.add(g);
      trainUnits.push({
        group: g,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        cosY: 1,
        sinY: 0,
        hx: 1.7,
        hz: 6.8,
        offsetBehindLoco: i * UNIT_SPACING,
      });
    }
  }

  let cycleTimer = 50; // First train arrives ~12 seconds into gameplay so player sees it promptly, then every 72s!
  let hornFiredThisCycle = false;
  let crossingActive = false;
  let barrierFactor = 0;
  let flashTimer = 0;

  const sampleRailAt = (s: number, outPos: THREE.Vector3, outTan: THREE.Vector3) => {
    const clamped = Math.max(0, Math.min(railLength, s));
    const fIdx = clamped / stepMeters;
    const i0 = Math.min(railPoints.length - 1, Math.floor(fIdx));
    const i1 = Math.min(railPoints.length - 1, i0 + 1);
    const alpha = fIdx - i0;
    outPos.lerpVectors(railPoints[i0], railPoints[i1], alpha);
    outTan.lerpVectors(railTangents[i0], railTangents[i1], alpha).normalize();
  };

  const tmpPos = new THREE.Vector3();
  const tmpTan = new THREE.Vector3();

  const update = (
    dt: number,
    playerX: number,
    playerZ: number,
    onTrainHorn: (distanceMeters: number) => void,
  ): void => {
    cycleTimer += dt;
    if (cycleTimer >= CYCLE_SEC) {
      cycleTimer -= CYCLE_SEC;
      hornFiredThisCycle = false;
    }

    const totalRunDist = railLength + UNIT_COUNT * UNIT_SPACING + 40;
    const locoS = cycleTimer * TRAIN_SPEED - 15;
    const trainVisible = locoS >= -10 && locoS <= totalRunDist;
    trainRoot.visible = trainVisible;

    const tailS = locoS - (UNIT_COUNT - 1) * UNIT_SPACING;
    crossingActive =
      locoS >= crossRailS - 185 && tailS <= crossRailS + 42;

    if (crossingActive && !hornFiredThisCycle && locoS >= crossRailS - 165) {
      hornFiredThisCycle = true;
      const distToCrossing = Math.hypot(playerX - crossingPos.x, playerZ - crossingPos.z);
      onTrainHorn(distToCrossing);
    }

    // Animate crossing barriers & flashing lights smoothly
    const targetBarrier = crossingActive ? 1 : 0;
    barrierFactor += (targetBarrier - barrierFactor) * Math.min(1, dt * 4.2);
    const armAngle = barrierFactor * (Math.PI * 0.5);
    for (let i = 0; i < barrierPivots.length; i++) {
      barrierPivots[i].rotation.z = armAngle;
    }

    if (crossingActive || barrierFactor > 0.08) {
      flashTimer += dt;
      const aOn = Math.floor(flashTimer * 4.2) % 2 === 0;
      redBulbMatA.color.setRGB(aOn ? 3.2 : 0.25, 0.05, 0.05);
      redBulbMatB.color.setRGB(!aOn ? 3.2 : 0.25, 0.05, 0.05);
    } else {
      redBulbMatA.color.setRGB(0.22, 0.04, 0.04);
      redBulbMatB.color.setRGB(0.22, 0.04, 0.04);
    }

    if (trainVisible) {
      for (let i = 0; i < trainUnits.length; i++) {
        const u = trainUnits[i];
        const unitS = locoS - u.offsetBehindLoco;
        const unitVisible = unitS >= 1 && unitS <= railLength - 1;
        u.group.visible = unitVisible;
        if (!unitVisible) continue;

        sampleRailAt(unitS, tmpPos, tmpTan);
        u.x = tmpPos.x;
        u.y = tmpPos.y;
        u.z = tmpPos.z;
        u.yaw = Math.atan2(tmpTan.x, tmpTan.z);
        u.cosY = Math.cos(u.yaw);
        u.sinY = Math.sin(u.yaw);
        u.group.position.set(u.x, u.y, u.z);
        u.group.rotation.set(0, u.yaw, 0);
      }
    }
  };

  const checkObbCircle = (
    px: number,
    pz: number,
    r: number,
    cx: number,
    cz: number,
    hx: number,
    hz: number,
    cosY: number,
    sinY: number,
    out: CircleCollisionHit,
  ): boolean => {
    const dx = px - cx;
    const dz = pz - cz;
    const broad = Math.hypot(hx, hz) + r;
    if (dx * dx + dz * dz >= broad * broad) return false;

    const lx = dx * cosY - dz * sinY;
    const lz = dx * sinY + dz * cosY;
    const clx = lx < -hx ? -hx : lx > hx ? hx : lx;
    const clz = lz < -hz ? -hz : lz > hz ? hz : lz;
    const dlx = lx - clx;
    const dlz = lz - clz;
    const dSq = dlx * dlx + dlz * dlz;
    if (dSq >= r * r) return false;

    let nlx = 0;
    let nlz = 0;
    let pen = 0;
    if (dSq > 1e-6) {
      const dist = Math.sqrt(dSq);
      nlx = dlx / dist;
      nlz = dlz / dist;
      pen = r - dist;
    } else {
      const pxPen = hx - Math.abs(lx);
      const pzPen = hz - Math.abs(lz);
      if (pxPen < pzPen) {
        nlx = lx >= 0 ? 1 : -1;
        pen = pxPen + r;
      } else {
        nlz = lz >= 0 ? 1 : -1;
        pen = pzPen + r;
      }
    }
    const nx = nlx * cosY + nlz * sinY;
    const nz = -nlx * sinY + nlz * cosY;
    out.hit = true;
    out.dx = nx * pen;
    out.dz = nz * pen;
    out.nx = nx;
    out.nz = nz;
    out.penetration = pen;
    return true;
  };

  const resolvePlayerCollision = (
    px: number,
    py: number,
    pz: number,
    radius: number,
    out: CircleCollisionHit,
  ): boolean => {
    out.hit = false;
    if (py > 4.2) return false;

    // 1. Check solid lowered crossing barriers when closed
    if (barrierFactor > 0.6) {
      for (let i = 0; i < barrierWorldCenters.length; i++) {
        const b = barrierWorldCenters[i];
        if (checkObbCircle(px, pz, radius, b.x, b.z, b.halfLen, 0.28, Math.cos(b.yaw), Math.sin(b.yaw), out)) {
          return true;
        }
      }
    }

    // 2. Check moving train locomotive & 6 wagons
    if (!trainRoot.visible) return false;
    for (let i = 0; i < trainUnits.length; i++) {
      const u = trainUnits[i];
      if (!u.group.visible) continue;
      if (checkObbCircle(px, pz, radius, u.x, u.z, u.hx, u.hz, u.cosY, u.sinY, out)) {
        return true;
      }
    }
    return false;
  };

  const getMinimapPoints = (
    worldToMinimap: (x: number, z: number) => { nx: number; ny: number },
  ): MinimapPoint[] => {
    const out: MinimapPoint[] = [];
    for (let i = 0; i < railPoints.length; i += 6) {
      const m = worldToMinimap(railPoints[i].x, railPoints[i].z);
      out.push({ x: m.nx * 100, y: m.ny * 100 });
    }
    return out;
  };

  return {
    crossingPos,
    crossingEdgeId: crossEdge.id,
    crossingEdgeS: crossSamp.s,
    nearRail,
    isCrossingActive: () => crossingActive || barrierFactor > 0.25,
    update,
    resolvePlayerCollision,
    getMinimapPoints,
  };
}
