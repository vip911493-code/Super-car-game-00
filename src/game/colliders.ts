export interface ObbCollider {
  kind: 'obb';
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  cosY: number;
  sinY: number;
  minY: number;
  maxY: number;
  radius: number;
  stamp: number;
}

export interface CylinderCollider {
  kind: 'cyl';
  cx: number;
  cz: number;
  r: number;
  minY: number;
  maxY: number;
  stamp: number;
}

export type StaticCollider = ObbCollider | CylinderCollider;

export interface CircleCollisionHit {
  hit: boolean;
  dx: number;
  dz: number;
  nx: number;
  nz: number;
  penetration: number;
}

export class SpatialColliderGrid {
  private readonly cellSize: number;
  private readonly cells = new Map<number, StaticCollider[]>();
  private stampCounter = 1;

  constructor(cellSize = 32) {
    this.cellSize = cellSize;
  }

  private hashCell(ix: number, iz: number): number {
    // Spatial hash key supporting [-16384..16383] cells without string allocations
    return ((ix + 16384) << 15) ^ (iz + 16384);
  }

  private insertBounds(minX: number, maxX: number, minZ: number, maxZ: number, col: StaticCollider): void {
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs);
    const x1 = Math.floor(maxX / cs);
    const z0 = Math.floor(minZ / cs);
    const z1 = Math.floor(maxZ / cs);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const key = this.hashCell(ix, iz);
        let list = this.cells.get(key);
        if (!list) {
          list = [];
          this.cells.set(key, list);
        }
        list.push(col);
      }
    }
  }

  public addObb(
    cx: number,
    cz: number,
    hx: number,
    hz: number,
    rotY: number,
    minY = -2,
    maxY = 100,
  ): void {
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const ex = Math.abs(cosY) * hx + Math.abs(sinY) * hz;
    const ez = Math.abs(sinY) * hx + Math.abs(cosY) * hz;
    const col: ObbCollider = {
      kind: 'obb',
      cx,
      cz,
      hx,
      hz,
      cosY,
      sinY,
      minY,
      maxY,
      radius: Math.hypot(hx, hz),
      stamp: 0,
    };
    this.insertBounds(cx - ex, cx + ex, cz - ez, cz + ez, col);
  }

  public addCylinder(cx: number, cz: number, r: number, minY = -2, maxY = 100): void {
    const col: CylinderCollider = {
      kind: 'cyl',
      cx,
      cz,
      r,
      minY,
      maxY,
      stamp: 0,
    };
    this.insertBounds(cx - r, cx + r, cz - r, cz + r, col);
  }

  /**
   * Resolves a horizontal circle (x, z, r) at elevation y against all static colliders
   * in the spatial hash grid. Zero heap allocations.
   */
  public resolveCircle(
    x: number,
    y: number,
    z: number,
    r: number,
    out: CircleCollisionHit,
  ): boolean {
    out.hit = false;
    out.dx = 0;
    out.dz = 0;
    out.nx = 0;
    out.nz = 0;
    out.penetration = 0;

    let curX = x;
    let curZ = z;
    let bestPen = 0;
    let bestNx = 0;
    let bestNz = 0;

    const cs = this.cellSize;
    const margin = r + 1.0;
    const x0 = Math.floor((x - margin) / cs);
    const x1 = Math.floor((x + margin) / cs);
    const z0 = Math.floor((z - margin) / cs);
    const z1 = Math.floor((z + margin) / cs);

    const stamp = ++this.stampCounter;

    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.cells.get(this.hashCell(ix, iz));
        if (!list) continue;

        for (let i = 0; i < list.length; i++) {
          const col = list[i];
          if (col.stamp === stamp) continue;
          col.stamp = stamp;

          if (y + 1.6 < col.minY || y > col.maxY) continue;

          if (col.kind === 'cyl') {
            const dx = curX - col.cx;
            const dz = curZ - col.cz;
            const lim = col.r + r;
            const dSq = dx * dx + dz * dz;
            if (dSq >= lim * lim) continue;

            const dist = Math.sqrt(dSq);
            const nx = dist > 1e-4 ? dx / dist : 1;
            const nz = dist > 1e-4 ? dz / dist : 0;
            const pen = lim - dist;
            curX += nx * pen;
            curZ += nz * pen;
            if (pen > bestPen) {
              bestPen = pen;
              bestNx = nx;
              bestNz = nz;
            }
          } else {
            const dx = curX - col.cx;
            const dz = curZ - col.cz;
            const broad = col.radius + r;
            if (dx * dx + dz * dz >= broad * broad) continue;

            // Transform world offset into OBB local frame
            const lx = dx * col.cosY - dz * col.sinY;
            const lz = dx * col.sinY + dz * col.cosY;

            const clx = lx < -col.hx ? -col.hx : lx > col.hx ? col.hx : lx;
            const clz = lz < -col.hz ? -col.hz : lz > col.hz ? col.hz : lz;

            const dlx = lx - clx;
            const dlz = lz - clz;
            const dSq = dlx * dlx + dlz * dlz;

            if (dSq >= r * r) continue;

            let nlx = 0;
            let nlz = 0;
            let pen = 0;

            if (dSq > 1e-6) {
              const dist = Math.sqrt(dSq);
              nlx = dlx / dist;
              nlz = dlz / dist;
              pen = r - dist;
            } else {
              // Circle center is inside the OBB — push out through nearest face
              const px = col.hx - Math.abs(lx);
              const pz = col.hz - Math.abs(lz);
              if (px < pz) {
                nlx = lx >= 0 ? 1 : -1;
                nlz = 0;
                pen = px + r;
              } else {
                nlx = 0;
                nlz = lz >= 0 ? 1 : -1;
                pen = pz + r;
              }
            }

            // Transform normal back to world XZ
            const nx = nlx * col.cosY + nlz * col.sinY;
            const nz = -nlx * col.sinY + nlz * col.cosY;

            curX += nx * pen;
            curZ += nz * pen;
            if (pen > bestPen) {
              bestPen = pen;
              bestNx = nx;
              bestNz = nz;
            }
          }
        }
      }
    }

    if (bestPen > 0) {
      out.hit = true;
      out.dx = curX - x;
      out.dz = curZ - z;
      out.nx = bestNx;
      out.nz = bestNz;
      out.penetration = bestPen;
      return true;
    }
    return false;
  }
}
