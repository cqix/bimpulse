#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { processIFC } from './ifcProcessing.js';
import { BIMPortalClient } from './client.js';
import { program } from 'commander';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Farb-Codes für bessere CLI-Ausgabe
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message: string, color: keyof typeof colors = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message: string) {
    log(`✅ ${message}`, 'green');
}

function logError(message: string) {
    log(`❌ ${message}`, 'red');
}

function logInfo(message: string) {
    log(`ℹ️  ${message}`, 'cyan');
}

function logWarning(message: string) {
    log(`⚠️  ${message}`, 'yellow');
}

// Commander konfigurieren
program
    .name('ifc-normalizer')
    .description('IFC Normalisierungstool für BIM-Dateien')
    .version('0.1.0');

program
    .command('process')
    .description('IFC-Datei verarbeiten und normalisieren')
    .argument('<file>', 'Pfad zur IFC-Datei')
    .option('-o, --output <path>', 'Ausgabepfad für normalisierte IFC-Datei')
    .option('-r, --report <path>', 'Ausgabepfad für JSON-Bericht')
    .option('--no-backup', 'Kein Backup der ursprünglichen Datei erstellen')
    .option('-v, --verbose', 'Ausführliche Ausgabe')
    .action(async (filePath, options) => {
        const startTime = Date.now();

        try {
            if (options.verbose) {
                logInfo(`Starte IFC-Normalisierung...`);
                logInfo(`Eingabedatei: ${filePath}`);
            }

            // Überprüfe, ob die Datei existiert
            const fileStats = await fs.stat(filePath).catch(() => null);
            if (!fileStats) {
                logError(`Datei ${filePath} nicht gefunden`);
                process.exit(1);
            }

            // Validiere Dateierweiterung
            if (!filePath.toLowerCase().endsWith('.ifc')) {
                logError('Nur IFC-Dateien (.ifc) werden unterstützt');
                process.exit(1);
            }

            // Datei einlesen
            logInfo(`Lade Datei: ${filePath}`);
            const buffer = await fs.readFile(filePath);
            const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2);
            logInfo(`Datei geladen: ${fileSizeMB} MB`);

            // Erstelle Backup falls gewünscht
            if (options.backup !== false) {
                const backupPath = filePath.replace(/\.ifc$/i, '.backup.ifc');
                await fs.copyFile(filePath, backupPath);
                if (options.verbose) {
                    logInfo(`Backup erstellt: ${backupPath}`);
                }
            }

            // Verarbeite die Datei
            logInfo('Starte Verarbeitung...');
            const client = new BIMPortalClient();
            const result = await processIFC(new Uint8Array(buffer), client);

            const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
            logSuccess(`Verarbeitung abgeschlossen in ${processingTime}s`);
            logInfo(`Analysierte Wände: ${result.elementsAnalyzed.walls}`);
            logInfo(`Änderungseinträge im Bericht: ${result.report.length}`);

            // Bestimme Ausgabepfade
            const parsedPath = path.parse(filePath);
            const outputPath = options.output ||
                path.join(parsedPath.dir, parsedPath.name + '_normalized' + parsedPath.ext);
            const reportPath = options.report ||
                path.join(parsedPath.dir, parsedPath.name + '_report.json');

            // Speichere Ausgabedateien
            await fs.writeFile(outputPath, Buffer.from(result.outputIFC));
            logSuccess(`Normalisierte IFC-Datei gespeichert: ${outputPath}`);

            // Erstelle ausführlichen Bericht
            const fullReport = {
                metadata: {
                    processedAt: new Date().toISOString(),
                    processingTimeSeconds: parseFloat(processingTime),
                    originalFile: filePath,
                    originalFileSize: buffer.length,
                    outputFile: outputPath,
                    outputFileSize: result.outputIFC.length
                },
                analysis: {
                    elementsAnalyzed: result.elementsAnalyzed,
                    totalChanges: result.report.length
                },
                changes: result.report
            };

            await fs.writeFile(reportPath, JSON.stringify(fullReport, null, 2));
            logSuccess(`Bericht gespeichert: ${reportPath}`);

            // Zusammenfassung
            if (result.report.length > 0) {
                logInfo('Übersicht der Änderungen:');
                const changesByProperty = result.report.reduce((acc, change) => {
                    acc[change.propertyName] = (acc[change.propertyName] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);

                Object.entries(changesByProperty).forEach(([prop, count]) => {
                    log(`  • ${prop}: ${count} Änderungen`, 'dim');
                });
            }

        } catch (error) {
            logError('Fehler bei der Verarbeitung:');
            console.error(error);
            process.exit(1);
        }
    });

program
    .command('validate')
    .description('IFC-Datei validieren (ohne Normalisierung)')
    .argument('<file>', 'Pfad zur IFC-Datei')
    .option('-v, --verbose', 'Ausführliche Ausgabe')
    .action(async (filePath, options) => {
        try {
            logInfo(`Validiere IFC-Datei: ${filePath}`);

            // Überprüfe, ob die Datei existiert
            const fileStats = await fs.stat(filePath).catch(() => null);
            if (!fileStats) {
                logError(`Datei ${filePath} nicht gefunden`);
                process.exit(1);
            }

            // Validiere Dateierweiterung
            if (!filePath.toLowerCase().endsWith('.ifc')) {
                logWarning('Warnung: Datei hat keine .ifc Erweiterung');
            }

            // Datei einlesen und grundlegende Checks
            const buffer = await fs.readFile(filePath);
            const content = buffer.toString('utf-8', 0, Math.min(1000, buffer.length));

            logSuccess('Datei erfolgreich gelesen');
            logInfo(`Dateigröße: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

            // Grundlegende IFC-Format-Checks
            if (content.includes('ISO-10303-21')) {
                logSuccess('IFC-Header erkannt');
            } else {
                logWarning('Kein Standard IFC-Header gefunden');
            }

            if (content.includes('FILE_SCHEMA')) {
                logSuccess('FILE_SCHEMA gefunden');
            } else {
                logWarning('Kein FILE_SCHEMA gefunden');
            }

            // Zähle Entitäten
            const entityMatches = content.match(/#\d+\s*=/g);
            if (entityMatches) {
                logInfo(`Geschätzte Anzahl Entitäten: ~${entityMatches.length}`);
            }

            logSuccess('Validierung abgeschlossen');

        } catch (error) {
            logError('Fehler bei der Validierung:');
            console.error(error);
            process.exit(1);
        }
    });

program
    .command('info')
    .description('Informationen über die CLI anzeigen')
    .action(() => {
        log('IFC Normalizer CLI', 'bright');
        log('================', 'dim');
        log('Version: 0.1.0', 'cyan');
        log('Beschreibung: Tool zur Normalisierung von IFC-Dateien für BIM-Projekte', 'dim');
        log('');
        log('Verfügbare Befehle:', 'bright');
        log('  process <file>  - IFC-Datei normalisieren', 'cyan');
        log('  validate <file> - IFC-Datei validieren', 'cyan');
        log('  info           - Diese Informationen anzeigen', 'cyan');
        log('');
        log('Beispiele:', 'bright');
        log('  ifc-normalizer process model.ifc', 'green');
        log('  ifc-normalizer process model.ifc --output result.ifc --report report.json', 'green');
        log('  ifc-normalizer validate model.ifc', 'green');
    });

// Zeige Hilfe an, wenn keine Argumente übergeben werden
if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
}

program.parse();
