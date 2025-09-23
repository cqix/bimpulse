import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { processIFC } from './ifcProcessing.js';
import { BIMPortalClient } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const upload = multer({ storage: multer.memoryStorage() });

const client = new BIMPortalClient();

// In-memory store for simplicity (in production, use DB or Redis)
const jobs: Record<string, any> = {};

// REST API Dokumentation
app.get('/api', (req, res) => {
  res.json({
    name: 'IFC Normalizer API',
    version: '1.0.0',
    description: 'REST API für die Normalisierung von IFC-Dateien',
    endpoints: {
      '/api': 'GET - Diese API-Dokumentation',
      '/api/upload': 'POST - IFC-Datei zur Normalisierung hochladen (multipart/form-data mit ifcFile)',
      '/api/jobs': 'GET - Liste aller aktiven Jobs abrufen',
      '/api/jobs/:jobId': 'GET - Status eines bestimmten Auftrags abrufen',
      '/api/jobs/:jobId/ifc': 'GET - Normalisierte IFC-Datei herunterladen',
      '/api/jobs/:jobId/report': 'GET - JSON-Bericht zur Normalisierung herunterladen',
      '/api/jobs/:jobId': 'DELETE - Job und seine Daten löschen'
    },
    usage: {
      upload: 'curl -X POST -F "ifcFile=@model.ifc" /api/upload',
      status: 'curl /api/jobs/YOUR_JOB_ID',
      download: 'curl -o result.ifc /api/jobs/YOUR_JOB_ID/ifc'
    }
  });
});

// Jobs-Übersicht
app.get('/api/jobs', (req, res) => {
  const jobsList = Object.entries(jobs).map(([jobId, job]) => ({
    jobId,
    status: job.status,
    numberOfWalls: job.numberOfWalls || 0,
    createdAt: job.createdAt,
    completedAt: job.completedAt
  }));
  res.json({ jobs: jobsList, total: jobsList.length });
});

// Legacy-Endpunkt für Kompatibilität
app.post('/upload', upload.single('ifcFile'), handleFileUpload);

// Neuer API-Endpunkt
app.post('/api/upload', upload.single('ifcFile'), handleFileUpload);

// Gemeinsame Hilfsfunktion für die Upload-Verarbeitung
async function handleFileUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No IFC file uploaded',
        message: 'Bitte eine IFC-Datei mit dem Parameter "ifcFile" hochladen'
      });
    }

    const buffer = req.file.buffer || null;
    if (!buffer) {
      return res.status(400).json({
        error: 'Invalid file',
        message: 'Die hochgeladene Datei ist ungültig oder leer'
      });
    }

    // Validiere Dateierweiterung
    const filename = req.file.originalname || '';
    if (!filename.toLowerCase().endsWith('.ifc')) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: 'Nur IFC-Dateien (.ifc) werden unterstützt'
      });
    }

    const jobId = Math.random().toString(36).substr(2, 9);
    jobs[jobId] = {
      status: 'processing',
      numberOfWalls: 0,
      createdAt: new Date().toISOString(),
      originalFilename: filename,
      fileSize: buffer.length
    };

    // Process in background
    processIFC(new Uint8Array(buffer), client)
        .then(({ outputIFC, report, elementsAnalyzed }) => {
          const numWalls = elementsAnalyzed?.walls || 0;
          jobs[jobId] = {
            ...jobs[jobId],
            status: 'completed',
            ifc: outputIFC,
            report,
            originalName: filename.replace(/\.ifc$/i, '_normalized.ifc'),
            numberOfWalls: numWalls,
            completedAt: new Date().toISOString()
          };
        })
        .catch(err => {
          console.error('Processing error:', err);
          jobs[jobId] = {
            ...jobs[jobId],
            status: 'error',
            error: err.message,
            completedAt: new Date().toISOString()
          };
        });

    res.json({
      jobId,
      message: 'Processing started',
      status: 'processing',
      estimatedTime: '1-3 minutes'
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Beim Upload ist ein unerwarteter Fehler aufgetreten'
    });
  }
}

// Legacy-Endpunkte für Kompatibilität
app.get('/status/:jobId', (req, res) => getJobStatus(req, res));
app.get('/download/ifc/:jobId', (req, res) => downloadIFC(req, res));
app.get('/download/report/:jobId', (req, res) => downloadReport(req, res));

// Neue API-Endpunkte
app.get('/api/jobs/:jobId', getJobStatus);
app.get('/api/jobs/:jobId/ifc', downloadIFC);
app.get('/api/jobs/:jobId/report', downloadReport);
app.delete('/api/jobs/:jobId', deleteJob);

// Handler-Funktionen
function getJobStatus(req, res) {
  const job = jobs[req.params.jobId];
  if (!job) {
    return res.status(404).json({
      error: 'Job not found',
      message: `Job mit ID ${req.params.jobId} nicht gefunden`
    });
  }

  // Sende nur relevante Informationen, keine internen Daten
  const safeJob = {
    jobId: req.params.jobId,
    status: job.status,
    numberOfWalls: job.numberOfWalls || 0,
    originalFilename: job.originalFilename,
    fileSize: job.fileSize,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    error: job.error,
    hasIFC: !!(job.ifc && job.status === 'completed'),
    hasReport: !!(job.report && job.status === 'completed')
  };

  res.json(safeJob);
}

function downloadIFC(req, res) {
  const job = jobs[req.params.jobId];
  if (!job || job.status !== 'completed' || !job.ifc) {
    return res.status(404).json({
      error: 'IFC not ready or not found',
      message: 'Die normalisierte IFC-Datei ist noch nicht verfügbar'
    });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${job.originalName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', job.ifc.length.toString());
  res.send(Buffer.from(job.ifc));
}

function downloadReport(req, res) {
  const job = jobs[req.params.jobId];
  if (!job || job.status !== 'completed' || !job.report) {
    return res.status(404).json({
      error: 'Report not ready or not found',
      message: 'Der Verarbeitungsbericht ist noch nicht verfügbar'
    });
  }

  const reportFilename = job.originalFilename
      ? job.originalFilename.replace(/\.ifc$/i, '_report.json')
      : 'report.json';

  res.setHeader('Content-Disposition', `attachment; filename="${reportFilename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.json(job.report);
}

function deleteJob(req, res) {
  const jobId = req.params.jobId;
  if (!jobs[jobId]) {
    return res.status(404).json({
      error: 'Job not found',
      message: `Job mit ID ${jobId} nicht gefunden`
    });
  }

  delete jobs[jobId];
  res.json({
    message: 'Job deleted successfully',
    jobId: jobId
  });
}

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeJobs: Object.keys(jobs).length,
    memory: process.memoryUsage()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `Der Endpunkt ${req.method} ${req.path} wurde nicht gefunden`,
    availableEndpoints: '/api'
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Ein unerwarteter Serverfehler ist aufgetreten'
  });
});

app.listen(port, () => {
  console.log(`🚀 IFC Normalizer server listening on port ${port}`);
  console.log(`📖 API Documentation: http://localhost:${port}/api`);
  console.log(`🌐 Web Interface: http://localhost:${port}`);
  console.log(`❤️  Health Check: http://localhost:${port}/health`);
});
