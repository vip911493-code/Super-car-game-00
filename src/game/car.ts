import * as THREE from 'three';
import { createContactShadowTexture } from './textures';
import { CarLivery, RimStyle, SpoilerStyle, WindowTint } from './types';

export interface WheelRig {
  pivot: THREE.Group;
  spin: THREE.Group;
  front: boolean;
}

export interface CarRig {
  root: THREE.Group;
  body: THREE.Group;
  wheels: WheelRig[];
  paintMaterial: THREE.MeshPhysicalMaterial;
  glassMaterial: THREE.MeshPhysicalMaterial;
  stripeMaterial: THREE.MeshStandardMaterial;
  headMaterial: THREE.MeshStandardMaterial;
  tailMaterial: THREE.MeshStandardMaterial;
  headSpotLight: THREE.SpotLight | null;
  setLivery: (livery: CarLivery) => void;
  setCustomColors: (bodyCss: string, stripeCss?: string) => void;
  setRimStyle: (style: RimStyle) => void;
  setSpoiler: (enabled: boolean, style: SpoilerStyle) => void;
  setWindowTint: (tint: WindowTint) => void;
  setBraking: (braking: boolean) => void;
  setEnvMap: (envMap: THREE.Texture | null) => void;
  setLightingState: (headIntensity: number, tailIdleIntensity: number, spotIntensity: number) => void;
  setNitroFlame: (active: boolean, elapsedSec: number, boostPower?: number) => void;
}

// Shared static geometries for all cars to keep GPU memory & draw setup minimal
let sharedCarGeos: {
  hullGeo: THREE.BufferGeometry;
  cabinGeo: THREE.BufferGeometry;
  interiorGeo: THREE.BufferGeometry;
  roofCapGeo: THREE.BufferGeometry;
  archGeo: THREE.BufferGeometry;
  wheelWellGeo: THREE.BufferGeometry;
  hoodBulgeGeo: THREE.BufferGeometry;
  intakeGeo: THREE.BufferGeometry;
  mirrorGeo: THREE.BufferGeometry;
  tireGeo: THREE.BufferGeometry;
  rimGeo: THREE.BufferGeometry;
  rimLipGeo: THREE.BufferGeometry;
  spokeTwinGeo: THREE.BufferGeometry;
  spoke5Geo: THREE.BufferGeometry;
  spokeMeshGeo: THREE.BufferGeometry;
  turboDiscGeo: THREE.BufferGeometry;
  turboFinGeo: THREE.BufferGeometry;
  hubGeo: THREE.BufferGeometry;
  discGeo: THREE.BufferGeometry;
  headLampGeo: THREE.BufferGeometry;
  headBezelGeo: THREE.BufferGeometry;
  tailLampGeo: THREE.BufferGeometry;
  exhaustGeo: THREE.BufferGeometry;
  flameOuterGeo: THREE.BufferGeometry;
  flameInnerGeo: THREE.BufferGeometry;
  wingGeo: THREE.BufferGeometry;
  wingTwinTopGeo: THREE.BufferGeometry;
  ducktailGeo: THREE.BufferGeometry;
} | null = null;

function getSharedCarGeos() {
  if (sharedCarGeos) return sharedCarGeos;

  // 1. Sculpted GT supercar lower body hull
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-2.24, 0.34);
  hullShape.quadraticCurveTo(-2.38, 0.44, -2.33, 0.76);
  hullShape.quadraticCurveTo(-2.25, 1.0, -1.84, 1.03);
  hullShape.bezierCurveTo(-1.42, 1.07, -1.12, 1.08, -0.82, 1.08);
  hullShape.lineTo(0.92, 1.06);
  hullShape.bezierCurveTo(1.36, 1.04, 1.84, 0.94, 2.18, 0.78);
  hullShape.quadraticCurveTo(2.48, 0.64, 2.4, 0.43);
  hullShape.quadraticCurveTo(2.36, 0.34, 2.16, 0.34);
  hullShape.lineTo(-2.24, 0.34);

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 1.54,
    bevelEnabled: true,
    bevelSize: 0.24,
    bevelThickness: 0.24,
    bevelSegments: 7,
    curveSegments: 22,
  });
  hullGeo.translate(0, 0, -0.77);
  hullGeo.rotateY(-Math.PI / 2);
  hullGeo.computeVertexNormals();

  // 2. Smoothly curved fastback glasshouse canopy
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.16, 0.94);
  cabinShape.bezierCurveTo(-0.9, 1.4, -0.44, 1.52, 0.16, 1.51);
  cabinShape.bezierCurveTo(0.66, 1.49, 1.02, 1.24, 1.36, 0.95);
  cabinShape.lineTo(-1.16, 0.94);

  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.14,
    bevelEnabled: true,
    bevelSize: 0.19,
    bevelThickness: 0.19,
    bevelSegments: 7,
    curveSegments: 20,
  });
  cabinGeo.translate(0, 0, -0.57);
  cabinGeo.rotateY(-Math.PI / 2);
  cabinGeo.computeVertexNormals();

  const interiorGeo = cabinGeo.clone();
  interiorGeo.scale(0.88, 0.88, 0.88);

  const roofCapGeo = new THREE.CapsuleGeometry(0.45, 0.72, 6, 16);
  roofCapGeo.rotateX(Math.PI / 2);
  roofCapGeo.scale(1.22, 0.22, 1.0);

  // 3. Sculpted fender arch flares & inner wheel-well liners
  const archGeo = new THREE.TorusGeometry(0.495, 0.105, 10, 22, Math.PI);
  archGeo.rotateY(Math.PI / 2);

  const wheelWellGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.4, 16, 1, false, 0, Math.PI);
  wheelWellGeo.rotateZ(Math.PI / 2);

  // 4. Sculpted hood power-dome, side aero intakes & mirrors
  const hoodBulgeGeo = new THREE.SphereGeometry(0.75, 16, 10);
  hoodBulgeGeo.scale(0.84, 0.17, 1.32);

  const intakeGeo = new THREE.CapsuleGeometry(0.11, 0.56, 4, 8);
  intakeGeo.rotateX(Math.PI / 2);
  intakeGeo.scale(0.55, 1.15, 1.0);

  const mirrorGeo = new THREE.SphereGeometry(0.105, 12, 10);
  mirrorGeo.scale(1.3, 0.7, 0.95);

  // 5. Rounded tire sidewall profile + 4 rim style geometries
  const tireProfile = [
    new THREE.Vector2(0.27, -0.175),
    new THREE.Vector2(0.36, -0.18),
    new THREE.Vector2(0.422, -0.132),
    new THREE.Vector2(0.432, 0),
    new THREE.Vector2(0.422, 0.132),
    new THREE.Vector2(0.36, 0.18),
    new THREE.Vector2(0.27, 0.175),
  ];
  const tireGeo = new THREE.LatheGeometry(tireProfile, 28);
  tireGeo.rotateZ(Math.PI / 2);
  tireGeo.computeVertexNormals();

  const rimGeo = new THREE.CylinderGeometry(0.275, 0.275, 0.3, 20);
  const rimLipGeo = new THREE.TorusGeometry(0.278, 0.024, 8, 24);
  rimLipGeo.rotateY(Math.PI / 2);

  const spokeTwinGeo = new THREE.BoxGeometry(0.32, 0.036, 0.25);
  const spoke5Geo = new THREE.BoxGeometry(0.33, 0.072, 0.27);
  const spokeMeshGeo = new THREE.BoxGeometry(0.32, 0.024, 0.26);
  const turboDiscGeo = new THREE.CylinderGeometry(0.255, 0.255, 0.055, 22);
  turboDiscGeo.rotateZ(Math.PI / 2);
  const turboFinGeo = new THREE.BoxGeometry(0.06, 0.022, 0.22);

  const hubGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.34, 14);
  const discGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.06, 20);

  // 6. Headlights, taillights, exhausts & nitro flame cones
  const headLampGeo = new THREE.CapsuleGeometry(0.052, 0.36, 5, 12);
  headLampGeo.rotateZ(Math.PI / 2);
  const headBezelGeo = new THREE.CapsuleGeometry(0.075, 0.4, 5, 12);
  headBezelGeo.rotateZ(Math.PI / 2);

  const tailLampGeo = new THREE.CapsuleGeometry(0.048, 0.46, 5, 12);
  tailLampGeo.rotateZ(Math.PI / 2);
  const exhaustGeo = new THREE.CylinderGeometry(0.072, 0.082, 0.24, 14);
  exhaustGeo.rotateX(Math.PI / 2);

  // Nitro flame cones extending backward (-Z), base at z=0, tip at z=-1
  const flameOuterGeo = new THREE.ConeGeometry(0.115, 1.0, 12);
  flameOuterGeo.rotateX(-Math.PI / 2);
  flameOuterGeo.translate(0, 0, -0.5);

  const flameInnerGeo = new THREE.ConeGeometry(0.068, 0.72, 10);
  flameInnerGeo.rotateX(-Math.PI / 2);
  flameInnerGeo.translate(0, 0, -0.36);

  // 7. Three distinct spoiler styles
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-0.22, 0);
  wingShape.quadraticCurveTo(0, 0.058, 0.24, -0.01);
  wingShape.lineTo(0.22, -0.046);
  wingShape.quadraticCurveTo(0, 0.012, -0.22, -0.025);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 1.92,
    bevelEnabled: true,
    bevelSize: 0.018,
    bevelThickness: 0.02,
    bevelSegments: 3,
  });
  wingGeo.translate(0, 0, -0.96);
  wingGeo.rotateY(-Math.PI / 2);
  wingGeo.computeVertexNormals();

  const wingTwinTopGeo = wingGeo.clone();
  wingTwinTopGeo.scale(1.04, 0.9, 0.85);

  const duckShape = new THREE.Shape();
  duckShape.moveTo(-0.14, 0);
  duckShape.quadraticCurveTo(0.02, 0.24, 0.24, 0.22);
  duckShape.lineTo(0.22, 0.03);
  duckShape.lineTo(-0.14, -0.04);
  duckShape.closePath();
  const ducktailGeo = new THREE.ExtrudeGeometry(duckShape, {
    depth: 1.66,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.02,
    bevelSegments: 3,
  });
  ducktailGeo.translate(0, 0, -0.83);
  ducktailGeo.rotateY(-Math.PI / 2);
  ducktailGeo.computeVertexNormals();

  sharedCarGeos = {
    hullGeo,
    cabinGeo,
    interiorGeo,
    roofCapGeo,
    archGeo,
    wheelWellGeo,
    hoodBulgeGeo,
    intakeGeo,
    mirrorGeo,
    tireGeo,
    rimGeo,
    rimLipGeo,
    spokeTwinGeo,
    spoke5Geo,
    spokeMeshGeo,
    turboDiscGeo,
    turboFinGeo,
    hubGeo,
    discGeo,
    headLampGeo,
    headBezelGeo,
    tailLampGeo,
    exhaustGeo,
    flameOuterGeo,
    flameInnerGeo,
    wingGeo,
    wingTwinTopGeo,
    ducktailGeo,
  };
  return sharedCarGeos;
}

export function createCarRig(initialLivery: CarLivery, isPlayer = false): CarRig {
  const geos = getSharedCarGeos();
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);

  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: initialLivery.paintHex,
    metalness: 0.72,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    reflectivity: 1.0,
    envMapIntensity: 1.85,
  });

  const stripeMaterial = new THREE.MeshPhysicalMaterial({
    color: initialLivery.stripeHex,
    roughness: 0.22,
    metalness: 0.15,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x050b12,
    metalness: 0.18,
    roughness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    ior: 1.52,
    reflectivity: 1.0,
    transparent: true,
    opacity: 0.82,
    envMapIntensity: 2.1,
  });

  const interiorMaterial = new THREE.MeshStandardMaterial({
    color: 0x0c0e13,
    roughness: 0.88,
    metalness: 0.1,
  });

  const darkTrimMaterial = new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.72,
    metalness: 0.22,
  });

  const carbonMaterial = new THREE.MeshStandardMaterial({
    color: 0x191d24,
    roughness: 0.4,
    metalness: 0.45,
  });

  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8edf3,
    metalness: 1.0,
    roughness: 0.1,
  });

  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff3d1,
    emissiveIntensity: 3.1,
    roughness: 0.1,
  });

  const tailMaterial = new THREE.MeshStandardMaterial({
    color: 0x550000,
    emissive: 0xff1616,
    emissiveIntensity: 1.35,
    roughness: 0.16,
  });

  let tailIdleIntensity = 1.35;
  let isBraking = false;

  // 1. Rounded primary GT hull + sculpted hood power-dome
  const hullMesh = new THREE.Mesh(geos.hullGeo, paintMaterial);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  hullMesh.position.y = 0.04;
  body.add(hullMesh);

  const hoodBulge = new THREE.Mesh(geos.hoodBulgeGeo, paintMaterial);
  hoodBulge.position.set(0, 0.98, 1.36);
  hoodBulge.rotation.x = 0.16;
  body.add(hoodBulge);

  // 2. Dark interior core + darker tinted curved canopy glass & painted roof cap
  const interiorMesh = new THREE.Mesh(geos.interiorGeo, interiorMaterial);
  interiorMesh.position.set(0, 0.12, 0.02);
  body.add(interiorMesh);

  const cabinMesh = new THREE.Mesh(geos.cabinGeo, glassMaterial);
  cabinMesh.position.y = 0.05;
  cabinMesh.castShadow = true;
  cabinMesh.renderOrder = 1;
  body.add(cabinMesh);

  const roofCap = new THREE.Mesh(geos.roofCapGeo, paintMaterial);
  roofCap.position.set(0, 1.59, -0.06);
  roofCap.castShadow = true;
  body.add(roofCap);

  // 3. Sculpted fender arch flares, dark inner wheel wells, side air intakes & wing mirrors
  for (const sx of [-1, 1]) {
    for (const wz of [1.46, -1.46]) {
      const arch = new THREE.Mesh(geos.archGeo, paintMaterial);
      arch.position.set(sx * 0.92, 0.42, wz);
      body.add(arch);

      const well = new THREE.Mesh(geos.wheelWellGeo, darkTrimMaterial);
      well.position.set(sx * 0.85, 0.42, wz);
      body.add(well);
    }

    const intake = new THREE.Mesh(geos.intakeGeo, darkTrimMaterial);
    intake.position.set(sx * 0.99, 0.68, -0.45);
    body.add(intake);

    const mirror = new THREE.Mesh(geos.mirrorGeo, paintMaterial);
    mirror.position.set(sx * 1.07, 1.11, 0.56);
    mirror.castShadow = true;
    body.add(mirror);
  }

  // 4. Aero front splitter, honeycomb grille, side skirts, rear diffuser
  const splitter = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 1.88, 4, 10), carbonMaterial);
  splitter.rotation.z = Math.PI / 2;
  splitter.scale.set(0.45, 1, 1.6);
  splitter.position.set(0, 0.3, 2.34);
  splitter.castShadow = true;
  body.add(splitter);

  const grille = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 1.18, 4, 10), darkTrimMaterial);
  grille.rotation.z = Math.PI / 2;
  grille.position.set(0, 0.55, 2.48);
  body.add(grille);

  for (const s of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 2.25, 4, 8), carbonMaterial);
    skirt.rotation.x = Math.PI / 2;
    skirt.position.set(s * 0.98, 0.3, 0);
    skirt.castShadow = true;
    body.add(skirt);
  }

  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.16, 0.36), carbonMaterial);
  diffuser.position.set(0, 0.34, -2.3);
  body.add(diffuser);

  // 5. Modular Spoiler Assembly (GT Wing / Ducktail / Twin-Tier)
  const spoilerRoot = new THREE.Group();
  body.add(spoilerRoot);

  const gtGroup = new THREE.Group();
  const gtWing = new THREE.Mesh(geos.wingGeo, paintMaterial);
  gtWing.position.set(0, 1.38, -2.14);
  gtWing.castShadow = true;
  gtGroup.add(gtWing);
  for (const s of [-1, 1]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.12), darkTrimMaterial);
    upright.position.set(s * 0.58, 1.18, -2.1);
    upright.rotation.x = -0.18;
    gtGroup.add(upright);

    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.5), carbonMaterial);
    endplate.position.set(s * 0.97, 1.37, -2.14);
    gtGroup.add(endplate);
  }
  spoilerRoot.add(gtGroup);

  const ducktailGroup = new THREE.Group();
  ducktailGroup.visible = false;
  const ducktailMesh = new THREE.Mesh(geos.ducktailGeo, paintMaterial);
  ducktailMesh.position.set(0, 1.0, -2.22);
  ducktailMesh.castShadow = true;
  ducktailGroup.add(ducktailMesh);
  spoilerRoot.add(ducktailGroup);

  const twinGroup = new THREE.Group();
  twinGroup.visible = false;
  const twinLower = new THREE.Mesh(geos.wingGeo, carbonMaterial);
  twinLower.position.set(0, 1.24, -2.1);
  twinLower.castShadow = true;
  const twinUpper = new THREE.Mesh(geos.wingTwinTopGeo, paintMaterial);
  twinUpper.position.set(0, 1.5, -2.19);
  twinUpper.castShadow = true;
  twinGroup.add(twinLower, twinUpper);
  for (const s of [-1, 1]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.14), darkTrimMaterial);
    upright.position.set(s * 0.62, 1.26, -2.13);
    upright.rotation.x = -0.18;
    twinGroup.add(upright);

    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.4, 0.56), carbonMaterial);
    endplate.position.set(s * 0.98, 1.38, -2.15);
    twinGroup.add(endplate);
  }
  spoilerRoot.add(twinGroup);

  // 6. Center racing stripe accents (hood & roof)
  const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 1.15), stripeMaterial);
  hoodStripe.position.set(0, 1.11, 1.46);
  hoodStripe.rotation.x = 0.15;
  body.add(hoodStripe);

  const roofStripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 1.05), stripeMaterial);
  roofStripe.position.set(0, 1.69, -0.06);
  body.add(roofStripe);

  // 7. Recessed headlight bezels, headlamps, OLED taillights, exhausts & animated Nitro Flames
  const flameOuterMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(3.6, 1.45, 0.25),
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flameInnerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.4, 3.2, 4.8),
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flameGroups: THREE.Group[] = [];

  for (const s of [-1, 1]) {
    const bezel = new THREE.Mesh(geos.headBezelGeo, darkTrimMaterial);
    bezel.position.set(s * 0.68, 0.77, 2.34);
    bezel.rotation.y = s * -0.22;
    body.add(bezel);

    const head = new THREE.Mesh(geos.headLampGeo, headMaterial);
    head.position.set(s * 0.68, 0.77, 2.38);
    head.rotation.y = s * -0.22;
    body.add(head);

    const tail = new THREE.Mesh(geos.tailLampGeo, tailMaterial);
    tail.position.set(s * 0.68, 0.87, -2.38);
    tail.rotation.y = s * 0.14;
    body.add(tail);

    const exhaust = new THREE.Mesh(geos.exhaustGeo, chromeMaterial);
    exhaust.position.set(s * 0.54, 0.36, -2.44);
    body.add(exhaust);

    const flameGroup = new THREE.Group();
    flameGroup.position.set(s * 0.54, 0.36, -2.56);
    flameGroup.visible = false;
    const outerCone = new THREE.Mesh(geos.flameOuterGeo, flameOuterMat);
    const innerCone = new THREE.Mesh(geos.flameInnerGeo, flameInnerMat);
    flameGroup.add(outerCone, innerCone);
    body.add(flameGroup);
    flameGroups.push(flameGroup);
  }

  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.045, 0.06), tailMaterial);
  tailBar.position.set(0, 0.87, -2.41);
  body.add(tailBar);

  // Player Headlight SpotLight that illuminates the road at night & in the tunnel
  let headSpotLight: THREE.SpotLight | null = null;
  if (isPlayer) {
    headSpotLight = new THREE.SpotLight(0xfff1d4, 0, 145, Math.PI / 3.9, 0.72, 1.25);
    headSpotLight.position.set(0, 0.92, 2.38);
    headSpotLight.target.position.set(0, 0.0, 38);
    root.add(headSpotLight, headSpotLight.target);
  }

  // 8. Grounded contact shadow plane underneath the car
  const shadowTex = createContactShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(3.5, 5.9);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.66,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.042;
  contactShadow.renderOrder = 2;
  root.add(contactShadow);

  // 9. Four rounded multi-part wheels with customizable rim styles
  const wheels: WheelRig[] = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x141519, roughness: 0.9, metalness: 0.05 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xdce3ec, metalness: 0.96, roughness: 0.14 });
  const rimDarkMat = new THREE.MeshStandardMaterial({ color: 0x2a313d, metalness: 0.86, roughness: 0.28 });
  const rimInnerMat = new THREE.MeshStandardMaterial({ color: 0x1f242c, metalness: 0.8, roughness: 0.36 });
  const discMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.92, roughness: 0.28 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.35 });

  const rimStyleGroups: Array<{
    twin5: THREE.Group;
    spoke5: THREE.Group;
    turbofan: THREE.Group;
    mesh: THREE.Group;
  }> = [];

  function makeWheel(x: number, z: number, front: boolean): void {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, z);

    const disc = new THREE.Mesh(geos.discGeo, discMat);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = x > 0 ? -0.05 : 0.05;
    pivot.add(disc);

    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.13), caliperMat);
    caliper.position.set(x > 0 ? -0.05 : 0.05, 0.08, -0.14);
    pivot.add(caliper);

    const spin = new THREE.Group();
    pivot.add(spin);

    const tire = new THREE.Mesh(geos.tireGeo, tireMat);
    tire.castShadow = true;
    spin.add(tire);

    const rimBarrel = new THREE.Mesh(geos.rimGeo, rimInnerMat);
    rimBarrel.rotation.z = Math.PI / 2;
    spin.add(rimBarrel);

    const outerSign = x > 0 ? 1 : -1;
    const rimLip = new THREE.Mesh(geos.rimLipGeo, rimMat);
    rimLip.position.x = outerSign * 0.145;
    spin.add(rimLip);

    const hub = new THREE.Mesh(geos.hubGeo, rimMat);
    hub.rotation.z = Math.PI / 2;
    spin.add(hub);

    // Style A: Twin-5 Sport (10 radial spoke arms)
    const twin5Group = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const baseAngle = (i / 5) * Math.PI * 2;
      for (const sgn of [-1, 1]) {
        const spoke = new THREE.Mesh(geos.spokeTwinGeo, rimMat);
        const a = baseAngle + sgn * 0.17;
        spoke.rotation.x = a;
        spoke.position.set(outerSign * 0.015, Math.sin(a) * 0.145, Math.cos(a) * 0.145);
        twin5Group.add(spoke);
      }
    }
    spin.add(twin5Group);

    // Style B: Deep-Dish 5-Spoke Muscle
    const spoke5Group = new THREE.Group();
    spoke5Group.visible = false;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spoke = new THREE.Mesh(geos.spoke5Geo, rimMat);
      spoke.rotation.x = a;
      spoke.position.set(outerSign * 0.018, Math.sin(a) * 0.14, Math.cos(a) * 0.14);
      spoke5Group.add(spoke);
    }
    spin.add(spoke5Group);

    // Style C: Aero Turbofan Disc
    const turbofanGroup = new THREE.Group();
    turbofanGroup.visible = false;
    const fanDisc = new THREE.Mesh(geos.turboDiscGeo, rimDarkMat);
    fanDisc.position.x = outerSign * 0.125;
    turbofanGroup.add(fanDisc);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const fin = new THREE.Mesh(geos.turboFinGeo, rimMat);
      fin.rotation.x = a;
      fin.position.set(outerSign * 0.148, Math.sin(a) * 0.145, Math.cos(a) * 0.145);
      turbofanGroup.add(fin);
    }
    spin.add(turbofanGroup);

    // Style D: Classic Cross-Mesh
    const meshGroup = new THREE.Group();
    meshGroup.visible = false;
    for (let i = 0; i < 8; i++) {
      const baseAngle = (i / 8) * Math.PI * 2;
      for (const sgn of [-1, 1]) {
        const spoke = new THREE.Mesh(geos.spokeMeshGeo, rimMat);
        const a = baseAngle + sgn * 0.24;
        spoke.rotation.x = a;
        spoke.position.set(outerSign * 0.014, Math.sin(a) * 0.145, Math.cos(a) * 0.145);
        meshGroup.add(spoke);
      }
    }
    spin.add(meshGroup);

    rimStyleGroups.push({
      twin5: twin5Group,
      spoke5: spoke5Group,
      turbofan: turbofanGroup,
      mesh: meshGroup,
    });

    root.add(pivot);
    wheels.push({ pivot, spin, front });
  }

  makeWheel(-1.02, 1.46, true);
  makeWheel(1.02, 1.46, true);
  makeWheel(-1.02, -1.46, false);
  makeWheel(1.02, -1.46, false);

  return {
    root,
    body,
    wheels,
    paintMaterial,
    glassMaterial,
    stripeMaterial,
    headMaterial,
    tailMaterial,
    headSpotLight,
    setLivery: (livery: CarLivery) => {
      paintMaterial.color.setHex(livery.paintHex);
      stripeMaterial.color.setHex(livery.stripeHex);
    },
    setCustomColors: (bodyCss: string, stripeCss?: string) => {
      paintMaterial.color.set(bodyCss);
      if (stripeCss) {
        stripeMaterial.color.set(stripeCss);
      }
    },
    setRimStyle: (style: RimStyle) => {
      for (const g of rimStyleGroups) {
        g.twin5.visible = style === 'twin5';
        g.spoke5.visible = style === 'spoke5';
        g.turbofan.visible = style === 'turbofan';
        g.mesh.visible = style === 'mesh';
      }
    },
    setSpoiler: (enabled: boolean, style: SpoilerStyle) => {
      spoilerRoot.visible = enabled;
      gtGroup.visible = style === 'gt';
      ducktailGroup.visible = style === 'ducktail';
      twinGroup.visible = style === 'twin';
    },
    setWindowTint: (tint: WindowTint) => {
      if (tint === 'light') {
        glassMaterial.opacity = 0.45;
        glassMaterial.color.setHex(0x162436);
      } else if (tint === 'smoke') {
        glassMaterial.opacity = 0.68;
        glassMaterial.color.setHex(0x0b1420);
      } else if (tint === 'dark') {
        glassMaterial.opacity = 0.84;
        glassMaterial.color.setHex(0x050b12);
      } else {
        glassMaterial.opacity = 0.96;
        glassMaterial.color.setHex(0x020408);
      }
      glassMaterial.needsUpdate = true;
    },
    setBraking: (braking: boolean) => {
      isBraking = braking;
      tailMaterial.emissiveIntensity = braking ? Math.max(4.4, tailIdleIntensity * 2.5) : tailIdleIntensity;
    },
    setEnvMap: (envMap: THREE.Texture | null) => {
      paintMaterial.envMap = envMap;
      glassMaterial.envMap = envMap;
      paintMaterial.needsUpdate = true;
      glassMaterial.needsUpdate = true;
    },
    setLightingState: (headIntensity: number, nextTailIdle: number, spotIntensity: number) => {
      headMaterial.emissiveIntensity = headIntensity;
      tailIdleIntensity = nextTailIdle;
      tailMaterial.emissiveIntensity = isBraking
        ? Math.max(4.4, nextTailIdle * 2.5)
        : nextTailIdle;
      if (headSpotLight) {
        headSpotLight.intensity = spotIntensity;
      }
    },
    setNitroFlame: (active: boolean, elapsedSec: number, boostPower = 1) => {
      for (let i = 0; i < flameGroups.length; i++) {
        const fg = flameGroups[i];
        fg.visible = active;
        if (active) {
          const flicker = 0.82 + Math.sin(elapsedSec * 52 + i * 2.1) * 0.24 + Math.cos(elapsedSec * 83) * 0.1;
          const len = (0.95 + 0.35 * boostPower) * flicker;
          const rad = 0.88 + 0.16 * flicker;
          fg.scale.set(rad, rad, len);
          fg.rotation.z = elapsedSec * 18 + i;
        }
      }
    },
  };
}
