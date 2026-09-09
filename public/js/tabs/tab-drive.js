/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: DRIVE DO ESCRITÓRIO (ARQUIVO DIGITAL)
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

    // ================= 4.2 MÓDULO DO DRIVE DO ESCRITÓRIO (ARQUIVO DIGITAL) =================
    let allDriveFiles = [];
    let selectedDriveCategory = 'Todas';

    function initDriveTab() {
      loadDriveFiles();
    }

    async function loadDriveFiles(folder = selectedDriveCategory, search = '') {
      const container = document.getElementById('drive-files-container');
      if (!container) return;

      try {
        const res = await fetch('/api/drive/files', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        allDriveFiles = data.files || [];

        // Atualizar contadores em cada Pasta Visual
        updateFolderCounts(allDriveFiles);

        // Filtrar a exibição com base na pasta selecionada e termo de busca
        let displayedFiles = allDriveFiles;
        if (folder && folder !== 'Todas') {
          displayedFiles = displayedFiles.filter(f => f.folder === folder);
        }

        if (search && search.trim()) {
          const term = search.trim().toLowerCase();
          displayedFiles = displayedFiles.filter(f => 
            (f.title || '').toLowerCase().includes(term) ||
            (f.filename || '').toLowerCase().includes(term) ||
            (f.notes || '').toLowerCase().includes(term) ||
            (f.uploaded_by || '').toLowerCase().includes(term)
          );
        }

        renderDriveFiles(displayedFiles);

        // Atualizar Breadcrumb e Título da Localização
        const folderTitleElem = document.getElementById('drive-current-folder-title');
        const showAllBtn = document.getElementById('btn-show-all-drive');
        if (folderTitleElem) {
          if (folder === 'Todas') {
            folderTitleElem.textContent = `Todas as Pastas (${displayedFiles.length} documento(s))`;
            folderTitleElem.className = 'text-xs font-extrabold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300';
            if (showAllBtn) showAllBtn.classList.add('hidden');
          } else {
            folderTitleElem.textContent = `📂 ${folder} (${displayedFiles.length} documento(s))`;
            folderTitleElem.className = 'text-xs font-extrabold text-navy-950 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300';
            if (showAllBtn) showAllBtn.classList.remove('hidden');
          }
        }

        // Destaque visual do Card da Pasta Ativa
        highlightActiveFolderCard(folder);

        // Atualizar badges estatísticos no topo
        const countBadge = document.getElementById('tab-drive-count');
        if (countBadge) countBadge.textContent = allDriveFiles.length;

        const statTotal = document.getElementById('drive-stat-total');
        if (statTotal) statTotal.textContent = `${allDriveFiles.length} documento(s)`;

        const statSize = document.getElementById('drive-stat-size');
        if (statSize) statSize.textContent = formatFileSize(data.totalSize || 0);

        const statFolders = document.getElementById('drive-stat-folders');
        if (statFolders) {
          const folderCount = data.foldersCount ? data.foldersCount.length : 0;
          statFolders.textContent = `${folderCount} pasta(s) com arquivos`;
        }
      } catch (err) {
        console.error('Erro ao carregar arquivos do Drive:', err);
        container.innerHTML = `
          <div class="col-span-full bg-white p-8 rounded-3xl border border-slate-200 text-center text-rose-600 text-xs">
            Erro ao conectar com o servidor para listar documentos do Drive.
          </div>
        `;
      }
    }

    function updateFolderCounts(files) {
      const counts = {
        'Modelos': 0,
        'PJ': 0,
        'PF': 0,
        'Contratos': 0,
        'Geral': 0
      };

      files.forEach(f => {
        const fold = f.folder || '';
        if (fold.includes('Peças')) counts['Modelos']++;
        else if (fold.includes('Institucionais')) counts['PJ']++;
        else if (fold.includes('Equipe')) counts['PF']++;
        else if (fold.includes('Financeiros') || fold.includes('Contratos')) counts['Contratos']++;
        else counts['Geral']++;
      });

      Object.keys(counts).forEach(key => {
        const elem = document.getElementById(`folder-count-${key}`);
        if (elem) elem.textContent = `${counts[key]} arq`;
      });
    }

    function highlightActiveFolderCard(folder) {
      document.querySelectorAll('.drive-folder-card').forEach(card => {
        card.classList.remove('ring-2', 'ring-emerald-500', 'shadow-lg', 'bg-white');
      });

      let catId = 'Geral';
      if (folder.includes('Peças')) catId = 'Modelos';
      else if (folder.includes('Institucionais')) catId = 'PJ';
      else if (folder.includes('Equipe')) catId = 'PF';
      else if (folder.includes('Financeiros') || folder.includes('Contratos')) catId = 'Contratos';
      else if (folder === 'Geral') catId = 'Geral';
      else return;

      const activeCard = document.getElementById(`folder-card-${catId}`);
      if (activeCard) {
        activeCard.classList.add('ring-2', 'ring-emerald-500', 'shadow-lg', 'bg-white');
      }
    }

    function selectDriveCategory(catName) {
      selectedDriveCategory = catName;
      loadDriveFiles(catName);
    }

    function filterDriveFiles() {
      const term = (document.getElementById('drive-search-input')?.value || '').toLowerCase().trim();
      loadDriveFiles(selectedDriveCategory, term);
    }

    function formatFileSize(bytes) {
      const b = parseInt(bytes, 10) || 0;
      if (b === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function renderDriveFiles(list) {
      const container = document.getElementById('drive-files-container');
      if (!container) return;

      if (!list || list.length === 0) {
        container.innerHTML = `
          <div class="col-span-full bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
            <div class="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center text-3xl mx-auto">
              📁
            </div>
            <h5 class="font-serif font-bold text-base text-navy-950">Nenhum documento nesta pasta</h5>
            <p class="text-xs text-slate-500 max-w-md mx-auto">
              Clique no botão "➕ Fazer Upload de Documento" acima para armazenar modelos de peças, procurações, contratos ou documentos institucionais.
            </p>
          </div>
        `;
        return;
      }

      container.innerHTML = list.map(doc => {
        const ext = (doc.file_type || doc.filename.split('.').pop() || '').toLowerCase();
        let icon = '📄';
        let badgeColor = 'bg-blue-100 text-blue-900 border-blue-200';

        if (['pdf'].includes(ext)) { icon = '📕'; badgeColor = 'bg-rose-100 text-rose-900 border-rose-200'; }
        else if (['doc', 'docx'].includes(ext)) { icon = '📝'; badgeColor = 'bg-blue-100 text-blue-900 border-blue-200'; }
        else if (['xls', 'xlsx', 'csv'].includes(ext)) { icon = '📊'; badgeColor = 'bg-emerald-100 text-emerald-900 border-emerald-200'; }
        else if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) { icon = '🖼️'; badgeColor = 'bg-purple-100 text-purple-900 border-purple-200'; }
        else if (['zip', 'rar', '7z'].includes(ext)) { icon = '📦'; badgeColor = 'bg-amber-100 text-amber-900 border-amber-200'; }

        return `
          <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-md hover:shadow-lg transition-all space-y-3 flex flex-col justify-between">
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center space-x-2.5 min-w-0">
                  <div class="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-xl shadow-sm flex-shrink-0">
                    ${icon}
                  </div>
                  <div class="min-w-0">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}">${doc.folder}</span>
                    <h5 class="font-bold text-slate-900 text-xs sm:text-sm truncate pt-1" title="${doc.title}">${doc.title}</h5>
                  </div>
                </div>
              </div>

              ${doc.notes ? `<p class="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 italic" title="${doc.notes}">${doc.notes}</p>` : ''}

              <div class="text-[11px] text-slate-500 pt-1 space-y-0.5 font-medium border-t border-slate-100">
                <div class="flex justify-between">
                  <span>Tamanho: <strong class="text-slate-800 font-mono">${formatFileSize(doc.file_size)}</strong></span>
                  <span>Extensão: <strong class="text-slate-800 font-mono uppercase">${ext}</strong></span>
                </div>
                <div class="flex justify-between text-[10px]">
                  <span>Enviado por: <strong class="text-slate-700">${doc.uploaded_by || 'Admin'}</strong></span>
                  <span>Data: <strong class="text-slate-700">${formatDate(doc.created_at)}</strong></span>
                </div>
              </div>
            </div>

            <!-- Botões de Ação -->
            <div class="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100">
              <a 
                href="${doc.file_path}" 
                target="_blank" 
                class="px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] text-center transition-all flex items-center justify-center space-x-1"
                title="Visualizar ou Abrir arquivo"
              >
                <span>👁️ Ver</span>
              </a>

              <a 
                href="${doc.file_path}" 
                download 
                class="px-2 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[11px] text-center transition-all flex items-center justify-center space-x-1"
                title="Baixar arquivo para seu computador"
              >
                <span>⬇️ Baixar</span>
              </a>

              <button 
                onclick="deleteDriveFile('${doc.id}', '${encodeURIComponent(doc.title)}')" 
                class="px-2 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-[11px] text-center transition-all flex items-center justify-center space-x-1 cursor-pointer"
                title="Excluir documento do Drive"
              >
                <span>🗑️ Excluir</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function openDriveUploadModal(editId = null) {
      const modal = document.getElementById('drive-upload-modal');
      if (!modal) return;
      document.getElementById('drive-upload-form').reset();
      document.getElementById('drive-edit-id').value = editId || '';
      document.getElementById('drive-error-msg').classList.add('hidden');

      if (selectedDriveCategory && selectedDriveCategory !== 'Todas') {
        document.getElementById('drive-upload-folder').value = selectedDriveCategory;
      }

      modal.classList.remove('hidden');
    }

    function closeDriveUploadModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('drive-upload-modal', 'deste upload no Drive')) return;
      }
      const modal = document.getElementById('drive-upload-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function handleSaveDriveUpload(e) {
      e.preventDefault();
      const editId = document.getElementById('drive-edit-id').value;
      const folder = document.getElementById('drive-upload-folder').value;
      const title = document.getElementById('drive-upload-title').value;
      const notes = document.getElementById('drive-upload-notes').value;

      const errorDiv = document.getElementById('drive-error-msg');
      const errorText = document.getElementById('drive-error-text');
      const saveBtn = document.getElementById('drive-save-btn');

      errorDiv.classList.add('hidden');

      if (editId) {
        try {
          saveBtn.disabled = true;
          const res = await fetch(`/api/drive/files/${editId}`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, folder, notes })
          });
          const data = await res.json();
          saveBtn.disabled = false;
          if (res.ok && data.success) {
            if (typeof window.clearUnsavedChanges === 'function') {
              window.clearUnsavedChanges('drive-upload-modal');
            }
            closeDriveUploadModal(true);
            loadDriveFiles();
            alert('✅ Dados do documento atualizados com sucesso!');
          } else {
            errorText.textContent = data.error || 'Erro ao atualizar documento.';
            errorDiv.classList.remove('hidden');
          }
        } catch (err) {
          saveBtn.disabled = false;
          errorText.textContent = 'Erro de conexão com o servidor.';
          errorDiv.classList.remove('hidden');
        }
        return;
      }

      const filesInput = document.getElementById('drive-upload-files');
      if (!filesInput.files || filesInput.files.length === 0) {
        errorText.textContent = 'Selecione ao menos um arquivo para envio.';
        errorDiv.classList.remove('hidden');
        return;
      }

      const formData = new FormData();
      formData.append('folder', folder);
      formData.append('title', title);
      formData.append('notes', notes);
      for (let i = 0; i < filesInput.files.length; i++) {
        formData.append('drive_files', filesInput.files[i]);
      }

      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span>Enviando...</span>';

      try {
        const res = await fetch('/api/drive/upload', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData
        });

        const data = await res.json();
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span>💾 Enviar Documento para o Drive</span>';

        if (res.ok && data.success) {
          if (typeof window.clearUnsavedChanges === 'function') {
            window.clearUnsavedChanges('drive-upload-modal');
          }
          closeDriveUploadModal(true);
          loadDriveFiles();
          alert('✅ Documento(s) adicionado(s) ao Drive com sucesso!');
        } else {
          errorText.textContent = data.error || 'Erro ao realizar upload.';
          errorDiv.classList.remove('hidden');
        }
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span>💾 Enviar Documento para o Drive</span>';
        errorText.textContent = 'Erro ao comunicar com o servidor.';
        errorDiv.classList.remove('hidden');
      }
    }

    async function deleteDriveFile(id, titleEncoded) {
      const title = decodeURIComponent(titleEncoded);
      if (!confirm(`⚠️ Tem certeza que deseja excluir permanentemente o documento "${title}" (#${id}) do Drive?`)) return;

      try {
        const res = await fetch(`/api/drive/files/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadDriveFiles();
          alert('🗑️ Documento excluído do Drive com sucesso.');
        } else {
          alert(data.error || 'Erro ao excluir documento.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }


  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.initDriveTab = typeof initDriveTab !== 'undefined' ? initDriveTab : window.initDriveTab;
  window.loadDriveFiles = typeof loadDriveFiles !== 'undefined' ? loadDriveFiles : window.loadDriveFiles;
  window.updateFolderCounts = typeof updateFolderCounts !== 'undefined' ? updateFolderCounts : window.updateFolderCounts;
  window.highlightActiveFolderCard = typeof highlightActiveFolderCard !== 'undefined' ? highlightActiveFolderCard : window.highlightActiveFolderCard;
  window.selectDriveCategory = typeof selectDriveCategory !== 'undefined' ? selectDriveCategory : window.selectDriveCategory;
  window.filterDriveFiles = typeof filterDriveFiles !== 'undefined' ? filterDriveFiles : window.filterDriveFiles;
  window.formatFileSize = typeof formatFileSize !== 'undefined' ? formatFileSize : window.formatFileSize;
  window.renderDriveFiles = typeof renderDriveFiles !== 'undefined' ? renderDriveFiles : window.renderDriveFiles;
  window.openDriveUploadModal = typeof openDriveUploadModal !== 'undefined' ? openDriveUploadModal : window.openDriveUploadModal;
  window.closeDriveUploadModal = typeof closeDriveUploadModal !== 'undefined' ? closeDriveUploadModal : window.closeDriveUploadModal;
  window.handleSaveDriveUpload = typeof handleSaveDriveUpload !== 'undefined' ? handleSaveDriveUpload : window.handleSaveDriveUpload;
  window.deleteDriveFile = typeof deleteDriveFile !== 'undefined' ? deleteDriveFile : window.deleteDriveFile;
})();
