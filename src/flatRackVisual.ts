type Vec3 = [number, number, number];
export type FlatRackPart = { name: string; position: Vec3; size: Vec3; color: string };

/** Display-only structure. Deck top stays at zero; end walls stay outside usable cargo bounds.
 * Collapsible racks are shown erected for loading, with hinge/locking hardware visible. */
export function flatRackParts(length: number, width: number, height: number, collapsible = false): FlatRackPart[] {
  const parts: FlatRackPart[] = [];
  const steel = collapsible ? '#28577b' : '#637e8d';
  const add = (name: string, position: Vec3, size: Vec3, color = steel) => parts.push({ name, position, size, color });
  add('Flatrack deck', [0, -.065, 0], [length, .13, width], '#a08c69');
  for (const z of [-1, 1]) add('Flatrack base rail', [0, -.14, z * (width / 2 + .055)], [length + .3, .28, .11]);
  for (let x = -length / 2 + .2; x < length / 2; x += .45) {
    add('Flatrack deck seam', [x, -.001, 0], [.012, .002, width], '#6c604a');
    for (const z of [-1, 1]) add('Flatrack lashing socket', [x, -.14, z * (width / 2 + .115)], [.08, .055, .012], '#263e4b');
  }
  for (const end of [-1, 1]) {
    const x = end * (length / 2 + .13);
    add('Flatrack end wall', [x, height / 2, 0], [.1, height, width]);
    for (const z of [-1, 1]) {
      add('Flatrack end post', [x, height / 2, z * (width / 2 + .055)], [.18, height + .08, .11]);
      for (const y of [-.14, height]) add('Flatrack corner casting', [x, y, z * (width / 2 + .055)], [.2, .14, .15], '#344f60');
      if (collapsible) {
        add('Flatrack hinge', [x, .12, z * (width / 2 + .12)], [.24, .2, .08], '#91a4ad');
        add('Flatrack hinge lock', [x, .33, z * (width / 2 + .12)], [.1, .12, .08], '#d8aa47');
      }
    }
    for (const y of [.04, height - .04]) add('Flatrack end crossbeam', [x, y, 0], [.18, .08, width]);
    for (let z = -width / 2 + .18; z < width / 2; z += .22) {
      add('Flatrack end rib', [x + end * .07, height / 2, z], [.04, height - .14, .065]);
    }
  }
  return parts;
}
