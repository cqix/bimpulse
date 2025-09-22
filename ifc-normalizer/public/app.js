document.addEventListener('DOMContentLoaded', () => {
  // DOM-Elemente
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const selectFileBtn = document.getElementById('selectFileBtn');
  const uploadArea = document.getElementById('upload-area');
  const processingArea = document.getElementById('processing-area');
  const resultsArea = document.getElementById('results-area');
  const downloadIfcBtn = document.getElementById('downloadIfcBtn');
  const downloadReportBtn = document.getElementById('downloadReportBtn');
  const changelogTable = document.getElementById('changelogTable');
  const wallsCount = document.getElementById('wallsCount');
  const propsChecked = document.getElementById('propsChecked');
  const propsChanged = document.getElementById('propsChanged');
  const toast = document.getElementById('toast');
  const toastMessage = toast.querySelector('.toast-message');
  const toastIcon = toast.querySelector('.toast-icon');
  const toastClose = toast.querySelector('.toast-close');

  // Aktiver Job
  let activeJobId = null;
  let statusCheckInterval = null;

  // Event-Listener
  selectFileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);
  dropZone.addEventListener('dragover', handleDragOver);
  dropZone.addEventListener('dragleave', handleDragLeave);
  dropZone.addEventListener('drop', handleFileDrop);
  downloadIfcBtn.addEventListener('click', downloadIfc);
  downloadReportBtn.addEventListener('click', downloadReport);
  toastClose.addEventListener('click', hideToast);

  // Drag-and-Drop-Handler
  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  }

  function handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');

    if (e.dataTransfer.files.length) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.ifc')) {
        uploadFile(file);
      } else {
        showToast('Bitte wähle eine IFC-Datei aus.', 'error');
      }
    }
  }

  function handleFileSelect(e) {
    const file = fileInput.files[0];
    if (file && file.name.toLowerCase().endsWith('.ifc')) {
      uploadFile(file);
    } else if (file) {
      showToast('Bitte wähle eine IFC-Datei aus.', 'error');
    }
  }

  // Datei-Upload
  async function uploadFile(file) {
    const formData = new FormData();
    formData.append('ifcFile', file);

    try {
      showProcessing();

      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Fehler beim Hochladen der Datei');
      }

      const data = await response.json();
      activeJobId = data.jobId;

      // Status-Überprüfung starten
      statusCheckInterval = setInterval(checkJobStatus, 1000);
    } catch (error) {
      console.error('Upload error:', error);
      showUpload();
      showToast('Fehler beim Hochladen: ' + error.message, 'error');
    }
  }

  // Job-Status überprüfen
  async function checkJobStatus() {
    if (!activeJobId) return;

    try {
      const response = await fetch(`/status/${activeJobId}`);
      if (!response.ok) {
        throw new Error('Fehler beim Abrufen des Job-Status');
      }

      const job = await response.json();

      if (job.status === 'completed') {
        clearInterval(statusCheckInterval);
        showResults(job);
      } else if (job.status === 'error') {
        clearInterval(statusCheckInterval);
        showUpload();
        showToast('Fehler bei der Verarbeitung: ' + job.error, 'error');
      }
    } catch (error) {
      console.error('Status check error:', error);
      clearInterval(statusCheckInterval);
      showUpload();
      showToast('Fehler beim Überprüfen des Status: ' + error.message, 'error');
    }
  }

  // UI-Zustände
  function showUpload() {
    uploadArea.style.display = 'block';
    processingArea.style.display = 'none';
    resultsArea.style.display = 'none';
  }

  function showProcessing() {
    uploadArea.style.display = 'none';
    processingArea.style.display = 'block';
    resultsArea.style.display = 'none';
  }

  function showResults(job) {
    uploadArea.style.display = 'none';
    processingArea.style.display = 'none';
    resultsArea.style.display = 'block';

    // Wände-Zähler aktualisieren
    wallsCount.textContent = `${job.numberOfWalls} Wände`;

    // Änderungsprotokolle verarbeiten
    if (job.report && Array.isArray(job.report)) {
      renderChangelog(job.report);

      // Statistiken aktualisieren
      propsChecked.textContent = job.report.length;
      // Zähle Änderungen, bei denen der alte Wert unterschiedlich vom neuen Wert ist
      const changedProps = job.report.filter(change => 
        change.oldValue !== change.newValue && 
        (change.oldValue !== undefined || change.newValue !== undefined)
      );
      propsChanged.textContent = changedProps.length;
    }
  }

  // Changelog-Tabelle erstellen
  function renderChangelog(changelog) {
    changelogTable.innerHTML = '';

    changelog.forEach(entry => {
      const row = document.createElement('tr');

      // Element-ID
      const elementIdCell = document.createElement('td');
      elementIdCell.textContent = `#${entry.ifcElementId}`;
      row.appendChild(elementIdCell);

      // Eigenschaft
      const propertyCell = document.createElement('td');
      propertyCell.textContent = `${entry.psetName}.${entry.propertyName}`;
      propertyCell.style.fontWeight = '500';
      row.appendChild(propertyCell);

      // Alter Wert
      const oldValueCell = document.createElement('td');
      oldValueCell.textContent = entry.oldValue !== undefined ? entry.oldValue : '—';
      if (entry.oldValue === undefined) {
        oldValueCell.style.color = 'var(--text-light)';
      }
      row.appendChild(oldValueCell);

      // Neuer Wert
      const newValueCell = document.createElement('td');
      newValueCell.textContent = entry.newValue !== undefined ? entry.newValue : '—';
      if (entry.oldValue !== entry.newValue) {
        newValueCell.style.color = 'var(--success-color)';
        newValueCell.style.fontWeight = '500';
      }
      row.appendChild(newValueCell);

      // Quelle
      const sourceCell = document.createElement('td');
      const sourceSpan = document.createElement('span');
      sourceSpan.textContent = `BIM-Portal (${entry.version})`;
      sourceSpan.style.fontSize = '0.8rem';
      sourceSpan.style.padding = 'var(--spacing-xs) var(--spacing-sm)';
      sourceSpan.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
      sourceSpan.style.borderRadius = 'var(--radius-sm)';
      sourceCell.appendChild(sourceSpan);
      row.appendChild(sourceCell);

      changelogTable.appendChild(row);
    });

    if (changelog.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 5;
      emptyCell.textContent = 'Keine Änderungen gefunden';
      emptyCell.style.textAlign = 'center';
      emptyCell.style.padding = 'var(--spacing-xl)';
      emptyCell.style.color = 'var(--text-light)';
      emptyRow.appendChild(emptyCell);
      changelogTable.appendChild(emptyRow);
    }
  }

  // Downloads
  async function downloadIfc() {
    if (!activeJobId) return;

    try {
      const response = await fetch(`/download/ifc/${activeJobId}`);
      if (!response.ok) {
        throw new Error('Fehler beim Herunterladen der IFC-Datei');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'normalized.ifc';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('IFC-Datei erfolgreich heruntergeladen', 'success');
    } catch (error) {
      console.error('Download error:', error);
      showToast('Fehler beim Herunterladen: ' + error.message, 'error');
    }
  }

  async function downloadReport() {
    if (!activeJobId) return;

    try {
      const response = await fetch(`/download/report/${activeJobId}`);
      if (!response.ok) {
        throw new Error('Fehler beim Herunterladen des Berichts');
      }

      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'report.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Bericht erfolgreich heruntergeladen', 'success');
    } catch (error) {
      console.error('Download error:', error);
      showToast('Fehler beim Herunterladen: ' + error.message, 'error');
    }
  }

  // Toast-Benachrichtigungen
  function showToast(message, type = 'info') {
    toastMessage.textContent = message;
    toast.className = 'toast ' + type;

    if (type === 'success') {
      toastIcon.className = 'toast-icon fa-solid fa-circle-check';
    } else if (type === 'error') {
      toastIcon.className = 'toast-icon fa-solid fa-circle-exclamation';
    } else {
      toastIcon.className = 'toast-icon fa-solid fa-circle-info';
    }

    toast.style.display = 'flex';
    setTimeout(hideToast, 5000);
  }

  function hideToast() {
    toast.style.display = 'none';
  }

  // Initialisierung
  showUpload();
});
