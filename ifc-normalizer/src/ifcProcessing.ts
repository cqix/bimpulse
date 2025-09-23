import { IfcAPI, IFCWALL, IFCPROPERTYSINGLEVALUE, IFCPROPERTYSET, IFCRELDEFINESBYPROPERTIES } from 'web-ifc';
import { BIMPortalClient } from './client.js';

export interface ChangeLogEntry {
  ifcElementId: number;
  psetName: string;
  propertyName: string;
  oldValue?: any;
  newValue: any;
  portalGuid: string;
  version: string;
  dataType: string;
  units?: string;
}

const newGuid = (): string => crypto.randomUUID();

const makeIfcValueFromPortal = (def: any, jsValue: any) => {
  const dt = (def.dataType || '').toLowerCase();
  if (dt.includes('bool')) return { type: 'IfcBoolean', value: !!jsValue };
  if (dt.includes('number') || dt.includes('real') || dt.includes('float'))
    return { type: 'IfcReal', value: Number(jsValue) };
  return { type: 'IfcLabel', value: String(jsValue) };
};



export async function processIFC(buffer: Uint8Array, client: BIMPortalClient): Promise<{ outputIFC: Uint8Array, report: ChangeLogEntry[], elementsAnalyzed: { walls: number } }> {
  const ifcApi = new IfcAPI();
  await ifcApi.Init();

  const modelID = (ifcApi as any).OpenModel(buffer);

  const getAllOfType = (id: number, type: any): Int32Array => (ifcApi as any).GetLineIDsWithType(id, type);
  const getLine = (id: number, expressID: number): any => (ifcApi as any).GetLine(id, expressID);


  const resolveProperty = async (client: BIMPortalClient, name: string): Promise<any | null> => {
    // For demo, use mock data instead of API call
    // To enable real API, remove and use original code
    const search = await client.searchProperties({ searchString: name, includeDeprecated: false });
    const candidates = search || [];
    if (candidates.length === 0) return null;
    const guid = candidates[0].guid;
    return await client.getPropertyByGuid(guid);
  };

  const collectPropertySetsOfElement = (modelId: number, element: any): any[] => {
    const psets = [];
    const isDef = element.IsDefinedBy || [];
    for (const relRef of isDef) {
      const rel = typeof relRef === 'number' ? getLine(modelId, relRef) : relRef;
      if (rel?.RelatingPropertyDefinition) {
        const pdefRef = rel.RelatingPropertyDefinition;
        const pset = typeof pdefRef === 'number' ? getLine(modelId, pdefRef) : pdefRef;
        if (pset?.expressID && pset?.GlobalId && pset?.Name) psets.push(pset);
      }
    }
    return psets;
  };

  const getNamedPset = (psets: any[], name: string): any =>
    psets.find(ps => (ps.Name?.value || '').toLowerCase() === name.toLowerCase());

  const getPropByName = (pset: any, propName: string): any => {
    const has = (pset.HasProperties || []).map((p: any) => typeof p === 'number' ? getLine(modelID, p) : p);
    return has.find((p: any) => (p.Name?.value || '').toLowerCase() === propName.toLowerCase());
  };


// AI: Property-Synonym-Erkennung
// Ersetzt die einfache Namenssuche durch eine erweiterte Suche mit Synonymen, Normalisierung und Varianten
  const normalizePropName = (s: string): string => {
    return (s || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '') // Diakritika entfernen
        .replace(/[_\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
  };

  const splitCamel = (s: string): string =>
      (s || '').replace(/([a-z])([A-Z])/g, '$1 $2');

  const baseVariants = (name: string): string[] => {
    const v = new Set<string>();
    const raw = name || '';
    const withSpaces = splitCamel(raw);
    const list = [
      raw,
      withSpaces,
      raw.replace(/[_\-]/g, ' '),
      withSpaces.replace(/[_\-]/g, ' '),
      raw.replace(/[_\-\s]/g, ''),
      withSpaces.replace(/[_\-\s]/g, '')
    ];
    for (const x of list) {
      v.add(x);
      v.add(x.replace(/\(.*?\)/g, '').trim()); // Klammerzusätze entfernen
      v.add(x.replace(/\[.*?\]/g, '').trim());
    }
    return Array.from(v).filter(Boolean);
  };

  const synonymMap: Record<string, string[]> = {
    // DE -> EN und übliche Varianten
    'hersteller': ['manufacturer', 'producer', 'vendor', 'lieferant'],
    'lieferant': ['manufacturer', 'vendor'],
    'baustoff': ['material', 'werkstoff'],
    'werkstoff': ['material'],
    'material': ['werkstoff', 'baustoff'],
    'höhe': ['height', 'hoehe'],
    'breite': ['width'],
    'länge': ['length', 'laenge'],
    'tiefe': ['depth'],
    'dicke': ['thickness', 'staerke', 'stärke'],
    'stärke': ['thickness', 'dicke', 'staerke'],
    'gewicht': ['weight', 'masse'],
    'masse': ['mass', 'weight'],
    'kennnummer': ['identifier', 'id', 'code', 'nummer'],
    'nummer': ['number', 'no', 'nr'],
    'bezeichnung': ['designation', 'name', 'title'],
    'name': ['designation', 'title'],
    'fläche': ['area', 'flaeche'],
    'volumen': ['volume'],
    'u-wert': ['u value', 'uvalue', 'thermal transmittance'],
    'wärmedurchgangskoeffizient': ['thermal transmittance', 'u value', 'uvalue', 'waermedurchgangskoeffizient'],
    'brandschutzklasse': ['fire rating', 'fire resistance', 'feuerwiderstandsklasse'],
    'feuerwiderstandsklasse': ['fire rating', 'fire resistance', 'brandschutzklasse'],
    'firerating': ['fire rating', 'fire resistance', 'brandschutzklasse'],
    'isexternal': ['is external', 'external', 'außen', 'aussen'],
    'reference': ['referenz', 'kennung'],
    'description': ['beschreibung'],
    'mark': ['kennung', 'label', 'tag'],
  };

  const expandSynonyms = (name: string): string[] => {
    const candidates = new Set<string>();
    for (const v of baseVariants(name)) {
      candidates.add(v);
      const norm = normalizePropName(v);
      // Direkte Synonyme
      if (synonymMap[norm]) {
        for (const s of synonymMap[norm]) {
          candidates.add(s);
        }
      }
      // Bindestrich/Leerzeichen-Varianten für U-Wert etc.
      candidates.add(v.replace(/\s*-\s*/g, '-'));
      candidates.add(v.replace(/\s*-\s*/g, ' '));
      candidates.add(v.replace(/\s+/g, ''));
    }
    return Array.from(candidates).filter(Boolean);
  };

// Liefert Property aus einem PSet, wobei mehrere Synonym-/Varianten geprüft werden
  const getPropByNameWithSynonyms = (pset: any, propName: string): any => {
    // 1) Direkter Treffer
    const direct = getPropByName(pset, propName);
    if (direct) return direct;

    // 2) Variantentreffer über normalisierte Namen
    const has = (pset.HasProperties || []).map((p: any) => typeof p === 'number' ? getLine(modelID, p) : p);

    const requestedNorms = new Set(expandSynonyms(propName).map(normalizePropName));

    // Exakte Normalisierungs-Gleichheit
    for (const p of has) {
      const n = normalizePropName(p?.Name?.value || '');
      if (requestedNorms.has(n)) return p;
    }

    // 3) Lockerer Vergleich: startsWith/contains
    for (const p of has) {
      const n = normalizePropName(p?.Name?.value || '');
      for (const r of requestedNorms) {
        if (n.startsWith(r) || r.startsWith(n) || n.includes(r) || r.includes(n)) {
          return p;
        }
      }
    }

    return null;
  };

  const createPropertySet = (modelId: number, name: string): any => {
    const maxId = (ifcApi as any).GetMaxExpressID(modelId) + 1;
    const pset = {
      expressID: maxId,
      type: IFCPROPERTYSET,
      GlobalId: newGuid(),
      Name: { type: 0, value: name }, // IfcLabel is 0
      HasProperties: []
    };
    (ifcApi as any).WriteLine(modelId, pset);
    return pset;
  };

  const linkPset = (modelId: number, element: any, pset: any): void => {
    const maxId = (ifcApi as any).GetMaxExpressID(modelId) + 1;
    const rel = {
      expressID: maxId,
      type: IFCRELDEFINESBYPROPERTIES,
      GlobalId: newGuid(),
      RelatedObjects: [element.expressID],
      RelatingPropertyDefinition: pset.expressID
    };
    (ifcApi as any).WriteLine(modelId, rel);
    // Also update element's ifcApi.GetLine(modelId, element.expressID).IsDefinedBy.push(rel.expressID); but perhaps necessary
  };

  const addOrSetSingleValue = (modelId: number, pset: any, propName: string, portalDef: any, jsValue: any): { prop: any, isNew: boolean } => {
    const existing = getPropByNameWithSynonyms(pset, propName);
    if (existing) {
      // For update, perhaps not need new, but here we skip updating for simplicity
      return { prop: existing, isNew: false };
    }

    const maxId = (ifcApi as any).GetMaxExpressID(modelId) + 1;
    const prop = {
      expressID: maxId,
      type: IFCPROPERTYSINGLEVALUE,
      Name: { type: 0, value: propName },
      NominalValue: makeIfcValueFromPortal(portalDef, jsValue)
    };
    (ifcApi as any).WriteLine(modelId, prop);

    const fresh = getLine(modelId, pset.expressID);
    const has = fresh.HasProperties || [];
    has.push(prop.expressID);
    fresh.HasProperties = has;
    (ifcApi as any).WriteLine(modelId, fresh);

    return { prop, isNew: true };
  };

  const normalizeWall = async (wall: any): Promise<ChangeLogEntry[]> => {
    const log: ChangeLogEntry[] = [];
    const psets = collectPropertySetsOfElement(modelID, wall);
    const pset = getNamedPset(psets, 'Pset_WallCommon');

    const properties = [
      { name: 'FireRating', defaultValue: 'T30' },
      { name: 'ThermalTransmittance', defaultValue: 0.35 },
      { name: 'Gewerk', defaultValue: false },
      { name: 'IsExternal', defaultValue: false }
    ];

    for (const prop of properties) {
      const existing = pset ? getPropByName(pset, prop.name) : null;

      let portalDef = await resolveProperty(client, prop.name);
      console.log(`Property ${prop.name} has portal def: ${portalDef}`);

      if (!portalDef) {
        // Versuche Synonyme aus dem synonymMap zu nutzen
        const variants = expandSynonyms(prop.name);
        for (const variant of variants) {
          if (variant !== prop.name) { // Überspringe den ursprünglichen Namen, der bereits versucht wurde
            console.log(` - Versuche Synonym ${variant} für Property ${prop.name}`);
            portalDef = await resolveProperty(client, variant);
            if (portalDef) {
              console.log(` - Property ${prop.name} gefunden durch Synonym ${variant}`);
              break;
            }
          }
        }
      } else {
        continue;
      }

      // Nur Änderungen protokollieren, wenn ein Wert vorhanden ist
      const oldValue = existing ? existing.NominalValue?.value : undefined;
      if (oldValue !== undefined) {
        log.push({
          ifcElementId: wall.expressID,
          psetName: 'Pset_WallCommon',
          propertyName: prop.name,
          oldValue,
          newValue: oldValue, // Behalte den originalen Wert bei
          portalGuid: portalDef.guid,
          version: portalDef.versionNumber || '',
          dataType: portalDef.dataType,
          units: portalDef.units
        });
      }
    }

    return log;
  };

  const walls = getAllOfType(modelID, IFCWALL);
  const wallsCount = (walls as any).size();
  let totalLog: ChangeLogEntry[] = [];

  for (let i = 0; i < wallsCount; i++) {
    const id = (walls as any).get(i);
    const wall = getLine(modelID, id);
    if (wall) {
      //console.log(`Normalizing wall ${wall.GlobalId.value}`);
      const wallLog = await normalizeWall(wall);
      totalLog = totalLog.concat(wallLog);
    }
  }

  (ifcApi as any).CloseModel(modelID);

  // Statistik über die überprüften Eigenschaften
  const uniqueProperties = new Set(totalLog.map(entry => entry.propertyName));
  //console.log(`Insgesamt wurden ${uniqueProperties.size} verschiedene Eigenschaften überprüft`);

  // Since no modifications were made for demo stability, return original IFC
  return { 
    outputIFC: buffer, 
    report: totalLog, 
    elementsAnalyzed: { 
      walls: wallsCount,
      propertiesChecked: uniqueProperties.size 
    } 
  };
}
