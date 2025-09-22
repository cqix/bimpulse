import * as fs from 'fs';
import * as path from 'path';
import { IfcAPI, IFCWALL } from 'web-ifc';

    /**
     * Hauptfunktion für das IFC-Beispiel
     * - Lädt eine IFC-Datei
     * - Initialisiert die IFC-API
     * - Extrahiert IFCWALL-Elemente aus dem Modell
     * - Gibt Wände-Informationen aus
     * 
     * @returns Eine Promise, die nach Abschluss aller IFC-Operationen aufgelöst wird
     */
async function main() {

    const ifcPath = path.resolve('../test.ifc');

    const ifc = new IfcAPI();
    await ifc.Init();

    // Load your IFC as an ArrayBuffer (fetch/file input/etc.)
    const ifcBuffer = fs.readFileSync(ifcPath);
    const ifcData = new Uint8Array(ifcBuffer);

    const modelID = ifc.OpenModel(ifcData);

    // Option A (works on all recent versions): get IDs, then read each line
    const ids = ifc.GetLineIDsWithType(modelID, IFCWALL);
    const walls = [];
    for (let i = 0; i < ids.size(); i++) {
        const expressID = ids.get(i);
        const mat = ifc.GetLine(modelID, expressID);
        walls.push(mat);
    }



    console.log('IFCWALL count:', walls.length);
    console.log(walls);

    // When done
    ifc.CloseModel(modelID);
}


main().catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
});
