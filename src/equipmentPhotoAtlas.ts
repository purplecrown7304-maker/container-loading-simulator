import chunk0 from './assets/equipment-atlas-chunks/chunk0.txt?raw';
import chunk1 from './assets/equipment-atlas-chunks/chunk1.txt?raw';
import chunk2 from './assets/equipment-atlas-chunks/chunk2.txt?raw';
import chunk3 from './assets/equipment-atlas-chunks/chunk3.txt?raw';
import chunk4 from './assets/equipment-atlas-chunks/chunk4.txt?raw';
import chunk5 from './assets/equipment-atlas-chunks/chunk5.txt?raw';
import chunk6 from './assets/equipment-atlas-chunks/chunk6.txt?raw';
import chunk7 from './assets/equipment-atlas-chunks/chunk7.txt?raw';
import chunk8 from './assets/equipment-atlas-chunks/chunk8.txt?raw';

const base64 = [chunk0, chunk1, chunk2, chunk3, chunk4, chunk5, chunk6, chunk7, chunk8]
  .map(chunk => chunk.trim())
  .join('');

export const EQUIPMENT_PHOTO_ATLAS_DATA_URI = `data:image/webp;base64,${base64}`;
