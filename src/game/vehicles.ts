import * as THREE from 'three';

export type TrafficVehicleKind =
  | 'sedan'
  | 'suv'
  | 'taxi'
  | 'van'
  | 'truck'
  | 'city_bus'
  | 'motorbike'
  | 'scooter'
  | 'bicycle'
  | 'ambulance'
  | 'police';

export interface TrafficWheelRef {
  pivot: THREE.Group;
  spin: THREE.Group;
  front: boolean;
}

export interface TrafficVehicleRig {
  kind: TrafficVehicleKind;
  root: THREE.Group;
  body: THREE.Group;
  wheels: TrafficWheelRef[];
  collisionRadius: number;
  maxCruiseSpeed: number;
  laneBiasRatio: number; // 1.0 = normal right lane, 1.45 = closer to outer shoulder (bicycle/scooter)
  setBraking: (braking: boolean) => void;
  setEnvMap: (envMap: THREE.Texture | null) => void;
}

const SEDAN_PALETTE = [
  0xd1d5db, 0x334155, 0x0f766e, 0x991b1b, 0x1e40af, 0x475569, 0xf1f5f9, 0x6d28d9, 0x065f46,
  0xb45309,
];
const SUV_PALETTE = [0x1f2937, 0x3f4e4f, 0x7f1d1d, 0x1e3a8a, 0x52525b, 0xd6d3d1];
const VAN_PALETTE = [0xf8fafc, 0xdbeafe, 0xe2e8f0, 0xfef3c7, 0xcbd5e1];
const MOTO_PALETTE = [0xdc2626, 0x2563eb, 0x16a34a, 0xf97316, 0x18181b, 0xeab308];
const RIDER_JACKETS = [0x1d4ed8, 0xb91c1c, 0x0f766e, 0x334155, 0xd97706, 0x4338ca];

export class TrafficVehicleFactory {
  private unitBox = new THREE.BoxGeometry(1, 1, 1);
  private wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  private rimGeo = new THREE.CylinderGeometry(0.58, 0.58, 1.04, 8);
  private sphereGeo = new THREE.SphereGeometry(1, 10, 8);
  private cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);

  private tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.88, metalness: 0.08 });
  private rimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.3, metalness: 0.78 });
  private glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1522,
    roughness: 0.14,
    metalness: 0.12,
    clearcoat: 0.9,
  });
  private trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72, metalness: 0.2 });
  private headLightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.75, 1.5) });
  private taxiSignMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.65, 0.35) });
  private busSignMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.25, 0.25) });
  private redStripeMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.36 });
  private whiteDoorMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.32 });

  private emergencyRedMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.25, 0.25) });
  private emergencyBlueMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.8, 3.4) });
  private emergencyWhiteMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4) });

  private brakeSharedOnMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 0.22, 0.18) });
  private brakeSharedOffMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.08, 0.08) });

  private paintMats = new Map<number, THREE.MeshPhysicalMaterial>();

  constructor() {
    this.wheelGeo.rotateZ(Math.PI / 2);
    this.rimGeo.rotateZ(Math.PI / 2);
  }

  private getPaintMat(hex: number, roughness = 0.28, metalness = 0.32): THREE.MeshPhysicalMaterial {
    const key = hex + (Math.round(roughness * 100) << 24);
    let m = this.paintMats.get(key);
    if (!m) {
      m = new THREE.MeshPhysicalMaterial({
        color: hex,
        roughness,
        metalness,
        clearcoat: 0.65,
        clearcoatRoughness: 0.18,
      });
      this.paintMats.set(key, m);
    }
    return m;
  }

  public updateSharedAnimations(timeSec: number): void {
    const phase = (timeSec * 6.5) % 2;
    const redOn = phase < 1;
    const strobe = ((timeSec * 14) % 2) < 1;
    const rScale = redOn ? (strobe ? 3.6 : 1.8) : 0.18;
    const bScale = !redOn ? (strobe ? 3.8 : 1.9) : 0.18;
    this.emergencyRedMat.color.setRGB(rScale, 0.08, 0.08);
    this.emergencyBlueMat.color.setRGB(0.08, 0.35 * bScale, bScale);
    this.emergencyWhiteMat.color.setRGB(strobe ? 2.6 : 0.35, strobe ? 2.6 : 0.35, strobe ? 2.6 : 0.35);
  }

  public setLightingState(headIntensity: number, tailIdle: number): void {
    const hs = Math.max(0.9, headIntensity * 0.65);
    this.headLightMat.color.setRGB(hs * 1.15, hs * 1.1, hs * 0.92);
    this.brakeSharedOffMat.color.setRGB(0.45 * tailIdle, 0.06, 0.06);
  }

  public setEnvMap(envMap: THREE.Texture | null): void {
    this.glassMat.envMap = envMap;
    this.glassMat.needsUpdate = true;
    for (const mat of this.paintMats.values()) {
      mat.envMap = envMap;
      mat.needsUpdate = true;
    }
  }

  private addBox(
    parent: THREE.Object3D,
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    rotX = 0,
  ): THREE.Mesh {
    const m = new THREE.Mesh(this.unitBox, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (rotX !== 0) m.rotation.x = rotX;
    parent.add(m);
    return m;
  }

  private addWheel(
    root: THREE.Group,
    wheels: TrafficWheelRef[],
    x: number,
    y: number,
    z: number,
    radius: number,
    width: number,
    front: boolean,
    hasRim = true,
  ): void {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(this.wheelGeo, this.tireMat);
    tire.scale.set(width, radius, radius);
    spin.add(tire);
    if (hasRim) {
      const rim = new THREE.Mesh(this.rimGeo, this.rimMat);
      rim.scale.set(width, radius, radius);
      spin.add(rim);
    }
    pivot.add(spin);
    root.add(pivot);
    wheels.push({ pivot, spin, front });
  }

  private addTailLights(body: THREE.Group, w: number, y: number, z: number, tailMeshes: THREE.Mesh[]): void {
    for (const s of [-1, 1]) {
      const tl = this.addBox(body, 0.36, 0.18, 0.08, s * (w * 0.34), y, z, this.brakeSharedOffMat);
      tailMeshes.push(tl);
    }
  }

  private addHeadLights(body: THREE.Group, w: number, y: number, z: number): void {
    for (const s of [-1, 1]) {
      this.addBox(body, 0.38, 0.18, 0.08, s * (w * 0.34), y, z, this.headLightMat);
    }
  }

  private addRider(body: THREE.Group, seatY: number, seatZ: number, jacketHex: number, leanRad: number, scale = 1): void {
    const rider = new THREE.Group();
    rider.position.set(0, seatY, seatZ);
    rider.rotation.x = leanRad;
    const jacketMat = this.getPaintMat(jacketHex, 0.78, 0.05);
    const pantsMat = this.trimMat;
    const helmetMat = this.getPaintMat(0xf8fafc, 0.25, 0.2);

    // Legs
    this.addBox(rider, 0.22 * scale, 0.56 * scale, 0.22 * scale, -0.14 * scale, -0.15 * scale, 0.08 * scale, pantsMat, -0.35);
    this.addBox(rider, 0.22 * scale, 0.56 * scale, 0.22 * scale, 0.14 * scale, -0.15 * scale, 0.08 * scale, pantsMat, -0.35);
    // Torso
    this.addBox(rider, 0.42 * scale, 0.58 * scale, 0.26 * scale, 0, 0.28 * scale, 0, jacketMat);
    // Head / Helmet
    const helmet = new THREE.Mesh(this.sphereGeo, helmetMat);
    helmet.scale.setScalar(0.18 * scale);
    helmet.position.set(0, 0.72 * scale, 0.05 * scale);
    rider.add(helmet);
    body.add(rider);
  }

  public createVehicle(kind: TrafficVehicleKind, variantIndex: number): TrafficVehicleRig {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const wheels: TrafficWheelRef[] = [];
    const tailMeshes: THREE.Mesh[] = [];
    let collisionRadius = 1.32;
    let maxCruiseSpeed = 20;
    let laneBiasRatio = 1.0;

    if (kind === 'sedan' || kind === 'taxi' || kind === 'police') {
      const hex =
        kind === 'taxi'
          ? 0xfacc15
          : kind === 'police'
            ? 0x0f172a
            : SEDAN_PALETTE[variantIndex % SEDAN_PALETTE.length];
      const paintMat = this.getPaintMat(hex);
      this.addBox(body, 1.92, 0.56, 4.35, 0, 0.62, 0, paintMat);
      this.addBox(body, 1.96, 0.2, 4.46, 0, 0.34, 0, this.trimMat);
      this.addBox(body, 1.56, 0.52, 2.08, 0, 1.12, -0.18, paintMat);
      this.addBox(body, 1.46, 0.42, 1.72, 0, 1.13, -0.18, this.glassMat);
      this.addHeadLights(body, 1.9, 0.64, 2.18);
      this.addTailLights(body, 1.9, 0.66, -2.18, tailMeshes);

      if (kind === 'taxi') {
        this.addBox(body, 0.58, 0.2, 0.28, 0, 1.48, -0.1, this.taxiSignMat);
      } else if (kind === 'police') {
        this.addBox(body, 1.95, 0.57, 1.7, 0, 0.62, -0.12, this.whiteDoorMat);
        this.addBox(body, 1.6, 0.53, 1.7, 0, 1.12, -0.15, this.whiteDoorMat);
        // Roof flashing red/blue bar
        this.addBox(body, 0.54, 0.16, 0.26, -0.28, 1.46, -0.1, this.emergencyRedMat);
        this.addBox(body, 0.54, 0.16, 0.26, 0.28, 1.46, -0.1, this.emergencyBlueMat);
        maxCruiseSpeed = 24;
      }

      for (const sx of [-0.94, 0.94]) {
        this.addWheel(root, wheels, sx, 0.38, 1.38, 0.38, 0.28, true);
        this.addWheel(root, wheels, sx, 0.38, -1.38, 0.38, 0.28, false);
      }
      collisionRadius = 1.32;
    } else if (kind === 'suv') {
      const hex = SUV_PALETTE[variantIndex % SUV_PALETTE.length];
      const paintMat = this.getPaintMat(hex);
      this.addBox(body, 2.06, 0.68, 4.65, 0, 0.74, 0, paintMat);
      this.addBox(body, 2.1, 0.24, 4.74, 0, 0.38, 0, this.trimMat);
      this.addBox(body, 1.82, 0.68, 2.85, 0, 1.42, -0.45, paintMat);
      this.addBox(body, 1.72, 0.54, 2.42, 0, 1.44, -0.42, this.glassMat);
      this.addHeadLights(body, 2.0, 0.78, 2.34);
      this.addTailLights(body, 2.0, 0.82, -2.34, tailMeshes);
      for (const sx of [-1.0, 1.0]) {
        this.addWheel(root, wheels, sx, 0.44, 1.46, 0.44, 0.32, true);
        this.addWheel(root, wheels, sx, 0.44, -1.46, 0.44, 0.32, false);
      }
      collisionRadius = 1.44;
    } else if (kind === 'van' || kind === 'ambulance') {
      const hex = kind === 'ambulance' ? 0xf8fafc : VAN_PALETTE[variantIndex % VAN_PALETTE.length];
      const paintMat = this.getPaintMat(hex, 0.42, 0.18);
      this.addBox(body, 2.12, 1.65, 5.15, 0, 1.18, -0.1, paintMat);
      this.addBox(body, 2.15, 0.25, 5.25, 0, 0.36, -0.1, this.trimMat);
      this.addBox(body, 1.86, 0.64, 0.16, 0, 1.45, 2.46, this.glassMat);
      this.addHeadLights(body, 2.05, 0.72, 2.52);
      this.addTailLights(body, 2.05, 0.84, -2.69, tailMeshes);

      if (kind === 'ambulance') {
        this.addBox(body, 2.15, 0.24, 4.9, 0, 1.05, -0.15, this.redStripeMat);
        // Red cross on sides + roof emergency light bar
        this.addBox(body, 2.16, 0.52, 0.18, 0, 1.46, -0.75, this.redStripeMat);
        this.addBox(body, 2.16, 0.18, 0.52, 0, 1.46, -0.75, this.redStripeMat);
        this.addBox(body, 0.55, 0.18, 0.3, -0.45, 2.08, 1.6, this.emergencyRedMat);
        this.addBox(body, 0.35, 0.18, 0.3, 0, 2.08, 1.6, this.emergencyWhiteMat);
        this.addBox(body, 0.55, 0.18, 0.3, 0.45, 2.08, 1.6, this.emergencyRedMat);
        maxCruiseSpeed = 23;
      }

      for (const sx of [-1.02, 1.02]) {
        this.addWheel(root, wheels, sx, 0.42, 1.62, 0.42, 0.3, true);
        this.addWheel(root, wheels, sx, 0.42, -1.62, 0.42, 0.3, false);
      }
      collisionRadius = 1.54;
    } else if (kind === 'truck') {
      const cabHex = [0xb91c1c, 0x1d4ed8, 0x374151, 0x0f766e][variantIndex % 4];
      const cargoHex = [0xf1f5f9, 0xe2e8f0, 0xfef3c7, 0xdbeafe][variantIndex % 4];
      const cabMat = this.getPaintMat(cabHex, 0.45, 0.25);
      const cargoMat = this.getPaintMat(cargoHex, 0.72, 0.1);
      // Chassis
      this.addBox(body, 2.08, 0.32, 7.2, 0, 0.45, 0, this.trimMat);
      // Cab
      this.addBox(body, 2.24, 1.85, 2.1, 0, 1.48, 2.45, cabMat);
      this.addBox(body, 1.96, 0.72, 0.14, 0, 1.8, 3.48, this.glassMat);
      // Cargo Box
      this.addBox(body, 2.38, 2.28, 4.9, 0, 1.72, -1.15, cargoMat);
      this.addHeadLights(body, 2.1, 0.76, 3.52);
      this.addTailLights(body, 2.1, 0.62, -3.62, tailMeshes);
      for (const sx of [-1.06, 1.06]) {
        this.addWheel(root, wheels, sx, 0.48, 2.4, 0.48, 0.34, true);
        this.addWheel(root, wheels, sx, 0.48, -1.25, 0.48, 0.36, false);
        this.addWheel(root, wheels, sx, 0.48, -2.55, 0.48, 0.36, false);
      }
      collisionRadius = 1.95;
      maxCruiseSpeed = 16;
    } else if (kind === 'city_bus') {
      const busHex = [0x0284c7, 0x16a34a, 0xd97706][variantIndex % 3];
      const busMat = this.getPaintMat(busHex, 0.45, 0.22);
      const lowerMat = this.getPaintMat(0xf1f5f9, 0.5, 0.15);
      this.addBox(body, 2.46, 0.85, 9.2, 0, 0.82, 0, busMat);
      this.addBox(body, 2.46, 1.45, 9.15, 0, 1.95, 0, lowerMat);
      this.addBox(body, 2.48, 0.25, 9.2, 0, 2.75, 0, busMat);
      // Panoramic windows
      this.addBox(body, 2.49, 0.82, 8.2, 0, 2.02, 0.15, this.glassMat);
      this.addBox(body, 2.15, 1.05, 0.14, 0, 1.85, 4.56, this.glassMat);
      // Amber front route LED banner
      this.addBox(body, 1.45, 0.26, 0.1, 0, 2.66, 4.59, this.busSignMat);
      this.addHeadLights(body, 2.3, 0.68, 4.62);
      this.addTailLights(body, 2.3, 0.75, -4.62, tailMeshes);
      for (const sx of [-1.14, 1.14]) {
        this.addWheel(root, wheels, sx, 0.48, 2.8, 0.48, 0.34, true);
        this.addWheel(root, wheels, sx, 0.48, -2.7, 0.48, 0.36, false);
      }
      collisionRadius = 2.35;
      maxCruiseSpeed = 16;
    } else if (kind === 'motorbike') {
      const motoHex = MOTO_PALETTE[variantIndex % MOTO_PALETTE.length];
      const motoMat = this.getPaintMat(motoHex);
      this.addBox(body, 0.34, 0.42, 1.45, 0, 0.62, 0, motoMat);
      this.addBox(body, 0.44, 0.28, 0.55, 0, 0.92, 0.45, this.glassMat, -0.5);
      this.addBox(body, 0.72, 0.08, 0.08, 0, 0.96, 0.48, this.trimMat); // handlebars
      this.addBox(body, 0.2, 0.14, 0.08, 0, 0.84, 0.86, this.headLightMat);
      const tl = this.addBox(body, 0.18, 0.12, 0.08, 0, 0.74, -0.82, this.brakeSharedOffMat);
      tailMeshes.push(tl);
      this.addRider(body, 0.9, -0.08, RIDER_JACKETS[variantIndex % RIDER_JACKETS.length], 0.35, 0.95);
      this.addWheel(root, wheels, 0, 0.33, 0.72, 0.33, 0.14, true, true);
      this.addWheel(root, wheels, 0, 0.33, -0.72, 0.33, 0.16, false, true);
      collisionRadius = 0.85;
      maxCruiseSpeed = 23;
    } else if (kind === 'scooter') {
      const scootHex = [0x38bdf8, 0xf43f5e, 0xfacc15, 0xa855f7, 0xf8fafc][variantIndex % 5];
      const scootMat = this.getPaintMat(scootHex);
      this.addBox(body, 0.42, 0.28, 1.25, 0, 0.42, 0, scootMat);
      this.addBox(body, 0.28, 0.68, 0.26, 0, 0.75, 0.46, scootMat, -0.2);
      this.addBox(body, 0.64, 0.07, 0.07, 0, 1.06, 0.42, this.trimMat);
      this.addBox(body, 0.16, 0.14, 0.06, 0, 0.96, 0.58, this.headLightMat);
      const tl = this.addBox(body, 0.16, 0.12, 0.06, 0, 0.6, -0.66, this.brakeSharedOffMat);
      tailMeshes.push(tl);
      this.addRider(body, 0.86, -0.14, RIDER_JACKETS[(variantIndex + 2) % RIDER_JACKETS.length], 0.08, 0.9);
      this.addWheel(root, wheels, 0, 0.24, 0.56, 0.24, 0.12, true, true);
      this.addWheel(root, wheels, 0, 0.24, -0.56, 0.24, 0.12, false, true);
      collisionRadius = 0.78;
      maxCruiseSpeed = 14;
      laneBiasRatio = 1.28;
    } else {
      // bicycle
      const frameHex = [0xef4444, 0x10b981, 0x3b82f6, 0xf59e0b][variantIndex % 4];
      const frameMat = this.getPaintMat(frameHex, 0.4, 0.5);
      const bar = new THREE.Mesh(this.cylGeo, frameMat);
      bar.scale.set(0.035, 0.92, 0.035);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(0, 0.68, 0);
      body.add(bar);
      this.addBox(body, 0.52, 0.05, 0.05, 0, 0.94, 0.46, this.trimMat);
      const tl = this.addBox(body, 0.08, 0.08, 0.05, 0, 0.66, -0.56, this.brakeSharedOffMat);
      tailMeshes.push(tl);
      this.addRider(body, 0.92, -0.05, RIDER_JACKETS[(variantIndex + 4) % RIDER_JACKETS.length], 0.22, 0.85);
      this.addWheel(root, wheels, 0, 0.34, 0.55, 0.34, 0.06, true, false);
      this.addWheel(root, wheels, 0, 0.34, -0.55, 0.34, 0.06, false, false);
      collisionRadius = 0.7;
      maxCruiseSpeed = 8.2;
      laneBiasRatio = 1.48;
    }

    const setBraking = (braking: boolean) => {
      const mat = braking ? this.brakeSharedOnMat : this.brakeSharedOffMat;
      for (let i = 0; i < tailMeshes.length; i++) {
        if (tailMeshes[i].material !== mat) {
          tailMeshes[i].material = mat;
        }
      }
    };

    const setEnvMap = (_envMap: THREE.Texture | null) => {
      // Handled efficiently at factory level across shared paint/glass materials
    };

    return {
      kind,
      root,
      body,
      wheels,
      collisionRadius,
      maxCruiseSpeed,
      laneBiasRatio,
      setBraking,
      setEnvMap,
    };
  }
}
