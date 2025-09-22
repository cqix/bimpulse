import * as fs from 'fs';
import * as path from 'path';
import { IfcAPI, IFCMATERIAL } from 'web-ifc';

async function main() {

    const ifcPath = path.resolve('../test.ifc');

    const ifc = new IfcAPI();
    await ifc.Init();

    // Load your IFC as an ArrayBuffer (fetch/file input/etc.)
    const ifcBuffer = fs.readFileSync(ifcPath);
    const ifcData = new Uint8Array(ifcBuffer);

    const modelID = ifc.OpenModel(ifcData);

    // Option A (works on all recent versions): get IDs, then read each line
    const ids = ifc.GetLineIDsWithType(modelID, IFCMATERIAL);
    const materials = [];
    for (let i = 0; i < ids.size(); i++) {
        const expressID = ids.get(i);
        const mat = ifc.GetLine(modelID, expressID);
        materials.push(mat);
    }

    console.log('IFCMATERIAL count:', materials.length);
    console.log(materials);

    // When done
    ifc.CloseModel(modelID);
}


main().catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
});
