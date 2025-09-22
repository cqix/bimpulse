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
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

const client = new BIMPortalClient();

// In-memory store for simplicity (in production, use DB or Redis)
const jobs: Record<string, any> = {};

app.post('/upload', upload.single('ifcFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No IFC file uploaded' });
    }

    const buffer = req.file.buffer || null;
    if (!buffer) {
      return res.status(400).json({ error: 'Invalid file' });
    }

    const jobId = Math.random().toString(36).substr(2, 9);
    jobs[jobId] = { status: 'processing', numberOfWalls: 0 };

    // Process in background
    processIFC(new Uint8Array(buffer), client)
      .then(({ outputIFC, report, elementsAnalyzed }) => {
        const numWalls = elementsAnalyzed?.walls || 0;
        jobs[jobId] = {
          status: 'completed',
          ifc: outputIFC,
          report,
          originalName: req.file.filename + '_normalized.ifc',
          numberOfWalls: numWalls
        };
      })
      .catch(err => {
        console.error('Processing error:', err);
        jobs[jobId] = { status: 'error', error: err.message };
      });

    res.json({ jobId, message: 'Processing started' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/status/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

app.get('/download/ifc/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job || job.status !== 'completed' || !job.ifc) {
    return res.status(404).json({ error: 'IFC not ready or not found' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${job.originalName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(Buffer.from(job.ifc));
});

app.get('/download/report/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job || job.status !== 'completed' || !job.report) {
    return res.status(404).json({ error: 'Report not ready or not found' });
  }

  res.setHeader('Content-Disposition', 'attachment; filename="report.json"');
  res.setHeader('Content-Type', 'application/json');
  res.json(job.report);
});

app.listen(port, () => {
  console.log(`IFC Normalizer server listening on port ${port}`);
});
