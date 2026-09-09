/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: BLOG JURÍDICO, BOXES DA HOME & MODERAÇÃO
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

    // ================= GESTÃO DO BLOG JURÍDICO & ARTIGOS INFORMATIVOS =================
    let adminBlogPosts = [];

    async function loadAdminBlogPosts() {
      const token = getToken();
      try {
        const res = await fetch('/api/admin/blog/posts', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok && data.success) {
          adminBlogPosts = data.posts || [];
          
          // Atualiza KPIs
          const total = adminBlogPosts.length;
          const published = adminBlogPosts.filter(p => p.is_published).length;
          const views = adminBlogPosts.reduce((sum, p) => sum + (p.views_count || 0), 0);

          document.getElementById('blog-kpi-total').textContent = total;
          document.getElementById('blog-kpi-published').textContent = published;
          document.getElementById('blog-kpi-views').textContent = views.toLocaleString('pt-BR');
          
          const badge = document.getElementById('tab-blog-count');
          if (badge) badge.textContent = `${total} Artigos`;

          renderAdminBlogTable(adminBlogPosts);
        }
      } catch (err) {
        console.error('Erro ao carregar artigos do blog no painel:', err);
      }
    }

    function renderAdminBlogTable(posts) {
      const tbody = document.getElementById('admin-blog-table-body');
      if (!tbody) return;

      if (posts.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-10 text-slate-400">
              Nenhum artigo encontrado. Clique em <strong>"+ Novo Artigo"</strong> para publicar seu primeiro texto informativo.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = posts.map(p => {
        const isPub = !!p.is_published;
        const statusBadge = isPub 
          ? '<span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200">🟢 Publicado</span>'
          : '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] border border-slate-200">⚪ Rascunho</span>';

        return `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-5 py-3.5 max-w-xs">
              <div class="flex items-center space-x-3">
                <img 
                  src="${p.cover_image || 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=200&q=80'}" 
                  alt="${p.title}" 
                  class="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-slate-200 shadow-2xs"
                />
                <div class="min-w-0">
                  <div class="font-serif font-bold text-navy-950 truncate text-xs sm:text-sm" title="${p.title}">
                    ${p.title}
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono truncate">
                    /blog/${p.slug}
                  </div>
                </div>
              </div>
            </td>
            <td class="px-5 py-3.5">
              <span class="px-2 py-0.5 rounded-lg bg-amber-50 text-gold-900 font-semibold text-[11px] border border-gold-200">
                ${p.category}
              </span>
            </td>
            <td class="px-5 py-3.5 text-center font-bold text-slate-700">
              👁️ ${(p.views_count || 0).toLocaleString('pt-BR')}
            </td>
            <td class="px-5 py-3.5 text-slate-500 font-medium text-[11px]">
              ${formatDate(p.published_at)}
            </td>
            <td class="px-5 py-3.5 text-center">
              ${statusBadge}
            </td>
            <td class="px-5 py-3.5 text-right whitespace-nowrap">
              <div class="flex items-center justify-end space-x-1.5">
                <a 
                  href="/blog/${p.slug}" 
                  target="_blank" 
                  class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors" 
                  title="Visualizar Artigo no Site"
                >
                  ↗
                </a>
                <button 
                  onclick="shareAdminBlogPostToMeta(${p.id})" 
                  class="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors flex items-center space-x-1 border border-blue-200"
                  title="Divulgar este artigo no Instagram e Facebook"
                >
                  <span>📢</span>
                  <span>Postar no Insta/Face</span>
                </button>
                <button 
                  onclick="openEditBlogPostModal(${p.id})" 
                  class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors"
                >
                  Editar
                </button>
                <button 
                  onclick="deleteBlogPost(${p.id}, '${p.title.replace(/'/g, "\\'")}')" 
                  class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors"
                >
                  Excluir
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function shareAdminBlogPostToMeta(id) {
      const post = adminBlogPosts.find(p => p.id === id);
      if (!post) return;
      if (typeof window.loadArticleIntoMetaMarketing === 'function') {
        window.loadArticleIntoMetaMarketing(post);
      } else if (typeof window.switchTab === 'function') {
        window.switchTab('meta-ads');
      }
    }
    window.shareAdminBlogPostToMeta = shareAdminBlogPostToMeta;

    function filterAdminBlogPosts() {
      const search = document.getElementById('admin-blog-search').value.toLowerCase().trim();
      const cat = document.getElementById('admin-blog-category-filter').value;

      const filtered = adminBlogPosts.filter(p => {
        const matchesSearch = !search || 
          p.title.toLowerCase().includes(search) || 
          p.summary.toLowerCase().includes(search) || 
          (p.tags && p.tags.toLowerCase().includes(search));
        
        const matchesCat = (cat === 'ALL') || (p.category === cat);
        return matchesSearch && matchesCat;
      });

      renderAdminBlogTable(filtered);
    }

    function openNewBlogPostModal() {
      document.getElementById('blog-modal-title').textContent = 'Novo Artigo Jurídico (Informativo & Educativo)';
      document.getElementById('blog-edit-id').value = '';
      document.getElementById('blog-edit-title').value = '';
      document.getElementById('blog-edit-category').value = 'Direito de Trânsito & CNH';
      document.getElementById('blog-edit-summary').value = '';
      document.getElementById('blog-edit-cover').value = '';
      removeBlogCoverPreview();
      document.getElementById('blog-edit-tags').value = 'Advogado, Juiz de Fora, OAB/MG';
      document.getElementById('blog-edit-content').value = `<h2>Introdução ao Tema</h2>\n<p>Explique aqui de forma clara e acessível o problema ou dúvida jurídica frequente.</p>\n\n<h3>O que diz a Legislação?</h3>\n<p>Apresente os artigos de lei, normas ou jurisprudência aplicável.</p>\n\n<blockquote>\n  <p><strong>Orientação Prática:</strong> Destaque uma dica relevante para o cidadão ou empresário.</p>\n</blockquote>\n\n<h3>Como Buscar Auxílio Jurídico Especializado</h3>\n<p>Explique a importância da atuação profissional de um advogado para garantir o direito em Juiz de Fora e região.</p>`;
      document.getElementById('blog-edit-published').checked = true;
      document.getElementById('blog-live-preview-box').classList.add('hidden');
      document.getElementById('btn-toggle-blog-preview').textContent = '👁️ Ver Prévia';
      document.getElementById('blog-post-editor-modal').classList.remove('hidden');
    }

    function openEditBlogPostModal(id) {
      const post = adminBlogPosts.find(p => p.id === id);
      if (!post) return;

      document.getElementById('blog-modal-title').textContent = 'Editar Artigo Jurídico';
      document.getElementById('blog-edit-id').value = post.id;
      document.getElementById('blog-edit-title').value = post.title;
      document.getElementById('blog-edit-category').value = post.category;
      document.getElementById('blog-edit-summary').value = post.summary;
      document.getElementById('blog-edit-cover').value = post.cover_image || '';
      if (post.cover_image) {
        const previewBox = document.getElementById('blog-cover-preview-container');
        const previewImg = document.getElementById('blog-cover-preview-img');
        const previewUrl = document.getElementById('blog-cover-preview-url');
        if (previewBox && previewImg) {
          previewImg.src = post.cover_image;
          if (previewUrl) previewUrl.textContent = post.cover_image;
          previewBox.classList.remove('hidden');
        }
      } else {
        removeBlogCoverPreview();
      }
      document.getElementById('blog-edit-tags').value = post.tags || '';
      document.getElementById('blog-edit-content').value = post.content;
      document.getElementById('blog-edit-published').checked = !!post.is_published;
      document.getElementById('blog-live-preview-box').classList.add('hidden');
      document.getElementById('btn-toggle-blog-preview').textContent = '👁️ Ver Prévia';
      document.getElementById('blog-post-editor-modal').classList.remove('hidden');
    }

    function closeBlogEditorModal() {
      if (typeof window.hasUnsavedChangesIn === 'function' && window.hasUnsavedChangesIn('blog-post-editor-modal')) {
        const discard = confirm('⚠️ Você possui alterações não salvas neste artigo.\n\nDeseja realmente fechar e descartar as alterações?');
        if (!discard) return;
        window.clearUnsavedChanges('blog-post-editor-modal');
      }
      document.getElementById('blog-post-editor-modal').classList.add('hidden');
    }

    function saveAndShareBlogPostToMeta() {
      window._shouldShareToMetaAfterSave = true;
      const form = document.getElementById('form-admin-blog-post') || document.querySelector('#blog-post-editor-modal form');
      if (form) {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }
    }
    window.saveAndShareBlogPostToMeta = saveAndShareBlogPostToMeta;

    async function handleSaveBlogPost(e) {
      e.preventDefault();
      const token = getToken();
      const id = document.getElementById('blog-edit-id').value;
      const title = document.getElementById('blog-edit-title').value.trim();
      const category = document.getElementById('blog-edit-category').value;
      const summary = document.getElementById('blog-edit-summary').value.trim();
      const cover_image = document.getElementById('blog-edit-cover').value.trim();
      const tags = document.getElementById('blog-edit-tags').value.trim();
      const content = document.getElementById('blog-edit-content').value.trim();
      const is_published = document.getElementById('blog-edit-published').checked ? 1 : 0;
      const btn = document.getElementById('blog-submit-btn');
      const shareBtn = document.getElementById('blog-save-and-meta-btn');

      if (btn) btn.disabled = true;
      if (shareBtn) shareBtn.disabled = true;
      if (btn) btn.innerHTML = '<span>Salvando...</span>';

      try {
        const url = id ? `/api/admin/blog/posts/${id}` : '/api/admin/blog/posts';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ title, category, summary, cover_image, tags, content, is_published })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          if (typeof window.clearUnsavedChanges === 'function') {
            window.clearUnsavedChanges('blog-post-editor-modal');
          }
          closeBlogEditorModal();
          await loadAdminBlogPosts();

          if (window._shouldShareToMetaAfterSave) {
            window._shouldShareToMetaAfterSave = false;
            const targetPost = {
              id: id || data.id,
              title,
              summary: summary || title,
              cover_image,
              slug: data.slug || (adminBlogPosts.find(p => p.id == id)?.slug) || ''
            };
            if (typeof window.loadArticleIntoMetaMarketing === 'function') {
              window.loadArticleIntoMetaMarketing(targetPost);
            } else if (typeof window.switchTab === 'function') {
              window.switchTab('meta-ads');
            }
          } else {
            alert('✅ Artigo salvo com sucesso!');
          }
        } else {
          alert(data.error || 'Erro ao salvar artigo.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>💾 Salvar & Publicar Artigo</span>';
        }
        if (shareBtn) shareBtn.disabled = false;
      }
    }

    async function deleteBlogPost(id, title) {
      if (!confirm(`Deseja realmente excluir o artigo "${title}"? Esta ação não pode ser desfeita.`)) return;

      const token = getToken();
      try {
        const res = await fetch(`/api/admin/blog/posts/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('Artigo excluído com sucesso.');
          await loadAdminBlogPosts();
        } else {
          alert(data.error || 'Erro ao excluir artigo.');
        }
      } catch (err) {
        alert('Erro ao excluir artigo.');
      }
    }

    function insertBlogTag(type) {
      const textarea = document.getElementById('blog-edit-content');
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = textarea.value.substring(start, end) || 'Texto aqui';

      let replacement = '';
      if (type === 'h2') replacement = `<h2>${selected}</h2>\n`;
      else if (type === 'h3') replacement = `<h3>${selected}</h3>\n`;
      else if (type === 'p') replacement = `<p>${selected}</p>\n`;
      else if (type === 'ul') replacement = `<ul>\n  <li>${selected}</li>\n  <li>Item adicional</li>\n</ul>\n`;
      else if (type === 'quote') replacement = `<blockquote>\n  <p><strong>Dica Jurídica:</strong> ${selected}</p>\n</blockquote>\n`;
      else if (type === 'b') replacement = `<strong>${selected}</strong>`;

      textarea.setRangeText(replacement, start, end, 'end');
      textarea.focus();
    }

    function toggleBlogPreview() {
      const box = document.getElementById('blog-live-preview-box');
      const btn = document.getElementById('btn-toggle-blog-preview');
      const content = document.getElementById('blog-edit-content').value;

      if (box.classList.contains('hidden')) {
        document.getElementById('blog-live-preview-content').innerHTML = content;
        box.classList.remove('hidden');
        btn.textContent = '✕ Fechar Prévia';
      } else {
        box.classList.add('hidden');
        btn.textContent = '👁️ Ver Prévia';
      }
    }

    function setBlogImagePreset(type) {
      const presets = {
        transito: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1200&q=80',
        consumidor: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
        familia: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1200&q=80',
        banco: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80'
      };
      if (presets[type]) {
        document.getElementById('blog-edit-cover').value = presets[type];
      }
    }

    // ================= 6.1. UPLOAD DE MÍDIA NO BLOG (CAPA E CORPO) =================

    async function handleBlogCoverUpload(input) {
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      const token = getToken();
      const btn = document.getElementById('btn-upload-blog-cover');
      const origText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>Enviando...</span>';
      }

      const formData = new FormData();
      formData.append('media', file);
      formData.append('image', file);

      try {
        const res = await fetch('/api/admin/blog/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const coverInput = document.getElementById('blog-edit-cover');
          if (coverInput) coverInput.value = data.url;

          const previewBox = document.getElementById('blog-cover-preview-container');
          const previewImg = document.getElementById('blog-cover-preview-img');
          const previewUrl = document.getElementById('blog-cover-preview-url');
          if (previewBox && previewImg) {
            previewImg.src = data.url;
            if (previewUrl) previewUrl.textContent = data.url;
            previewBox.classList.remove('hidden');
          }
          if (typeof window.showToast === 'function') {
            window.showToast('Imagem de capa anexada com sucesso!', 'success');
          } else {
            alert('Imagem de capa anexada com sucesso!');
          }
        } else {
          alert(data.error || 'Erro ao fazer upload da imagem.');
        }
      } catch (err) {
        console.error('Erro no upload de capa:', err);
        alert('Erro ao enviar imagem: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = origText;
        }
        input.value = '';
      }
    }
    window.handleBlogCoverUpload = handleBlogCoverUpload;

    function removeBlogCoverPreview() {
      const coverInput = document.getElementById('blog-edit-cover');
      if (coverInput) coverInput.value = '';
      const previewBox = document.getElementById('blog-cover-preview-container');
      if (previewBox) previewBox.classList.add('hidden');
    }
    window.removeBlogCoverPreview = removeBlogCoverPreview;

    async function handleBlogContentMediaUpload(input) {
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      const token = getToken();
      const btn = document.getElementById('btn-upload-blog-content-media');
      const origText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>Anexando...</span>';
      }

      const formData = new FormData();
      formData.append('media', file);
      formData.append('image', file);

      try {
        const res = await fetch('/api/admin/blog/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const textarea = document.getElementById('blog-edit-content');
          const start = textarea.selectionStart || textarea.value.length;
          const end = textarea.selectionEnd || textarea.value.length;
          const cleanFileName = file.name.replace(/\.[^/.]+$/, '');
          const imgHtml = `\n<figure class="my-6 text-center">\n  <img src="${data.url}" alt="${cleanFileName}" class="rounded-2xl shadow-md max-w-full mx-auto border border-slate-200" />\n  <figcaption class="text-xs text-slate-500 mt-2 italic">Infográfico explicativo / Imagem ilustrativa</figcaption>\n</figure>\n`;
          textarea.setRangeText(imgHtml, start, end, 'end');
          textarea.focus();

          if (typeof window.showToast === 'function') {
            window.showToast('Mídia anexada e inserida no texto do artigo!', 'success');
          } else {
            alert('Mídia anexada e inserida no texto do artigo!');
          }
        } else {
          alert(data.error || 'Erro ao anexar mídia ao artigo.');
        }
      } catch (err) {
        console.error('Erro no upload de mídia de conteúdo:', err);
        alert('Erro ao enviar imagem: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = origText;
        }
        input.value = '';
      }
    }
    window.handleBlogContentMediaUpload = handleBlogContentMediaUpload;

    // ================= 6.2. MÓDULO DOS BOXES DA PÁGINA INICIAL =================

    async function loadSiteBoxesTab() {
      const container = document.getElementById('site-boxes-container');
      if (!container) return;

      container.innerHTML = `
        <div class="col-span-full p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
          <div class="inline-block animate-spin text-2xl mb-2">🔄</div>
          <div>Carregando os 6 boxes da página inicial...</div>
        </div>
      `;

      const token = getToken();
      try {
        const res = await fetch('/api/admin/site/practice-areas', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          renderSiteBoxes(data);
        } else {
          container.innerHTML = `
            <div class="col-span-full p-8 text-center text-rose-600 bg-rose-50 rounded-3xl border border-rose-200 text-xs">
              Falha ao carregar boxes: ${data.error || 'Erro desconhecido.'}
            </div>
          `;
        }
      } catch (err) {
        console.error('Erro ao carregar boxes do site:', err);
        container.innerHTML = `
          <div class="col-span-full p-8 text-center text-rose-600 bg-rose-50 rounded-3xl border border-rose-200 text-xs">
            Erro de rede ao carregar boxes do site: ${err.message}
          </div>
        `;
      }
    }
    window.loadSiteBoxesTab = loadSiteBoxesTab;

    function renderSiteBoxes(boxes) {
      const container = document.getElementById('site-boxes-container');
      if (!container) return;

      container.innerHTML = boxes.map(b => {
        const itemsText = Array.isArray(b.items) ? b.items.join('\n') : '';
        const badgeLabel = b.badge ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">⭐ ${escapeHtml(b.badge)}</span>` : '<span class="text-[10px] text-slate-400">Sem selo</span>';

        return `
          <div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow" id="card-site-box-${b.id}">
            <div class="space-y-3.5">
              <!-- Topo do Card -->
              <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <div class="flex items-center gap-2">
                  <span class="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs flex items-center justify-center">#${b.box_order}</span>
                  <span class="text-xs font-bold text-navy-950 uppercase tracking-wider">Box ${b.box_order} de 6</span>
                </div>
                <div>${badgeLabel}</div>
              </div>

              <!-- Imagem de Capa do Box -->
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">Foto de Fundo / Capa</label>
                <div class="relative h-36 w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 mb-2">
                  <img id="site-box-img-preview-${b.id}" src="${escapeHtml(b.image_url)}" alt="Capa Box ${b.box_order}" class="w-full h-full object-cover">
                </div>
                <div class="flex items-center gap-2">
                  <input type="text" id="site-box-img-${b.id}" value="${escapeHtml(b.image_url)}" placeholder="URL da foto..." oninput="document.getElementById('site-box-img-preview-${b.id}').src = this.value" class="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-700 focus:outline-none focus:border-indigo-500">
                  <input type="file" id="site-box-file-${b.id}" accept="image/*" class="hidden" onchange="uploadSiteBoxImage(${b.id}, this)">
                  <button type="button" onclick="document.getElementById('site-box-file-${b.id}').click()" class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0 flex items-center gap-1 shadow-2xs cursor-pointer" title="Trocar imagem fazendo upload">
                    <span>📎</span><span>Trocar Foto</span>
                  </button>
                </div>
              </div>

              <!-- Título do Box -->
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">Título da Especialidade *</label>
                <input type="text" id="site-box-title-${b.id}" value="${escapeHtml(b.title)}" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-navy-950 focus:outline-none focus:border-indigo-500">
              </div>

              <!-- Descrição -->
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">Texto Explicativo / Resumo *</label>
                <textarea id="site-box-desc-${b.id}" rows="3" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 leading-relaxed">${escapeHtml(b.description)}</textarea>
              </div>

              <!-- Tópicos em Lista (1 por linha) -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-[11px] font-bold text-slate-700">Tópicos / Bullets (1 por linha)</label>
                  <span class="text-[10px] text-slate-400">Itens com marcador dourado</span>
                </div>
                <textarea id="site-box-items-${b.id}" rows="3" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono text-slate-700 focus:outline-none focus:border-indigo-500">${escapeHtml(itemsText)}</textarea>
              </div>

              <!-- Selo / Badge e Botão -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label class="block text-[10px] font-bold text-slate-600 mb-1">Selo / Badge (Opcional)</label>
                  <input type="text" id="site-box-badge-${b.id}" value="${escapeHtml(b.badge || '')}" placeholder="Ex: Especialidade" class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-indigo-500">
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-600 mb-1">Texto do Botão de Ação</label>
                  <input type="text" id="site-box-label-${b.id}" value="${escapeHtml(b.action_label || 'Consultar')}" class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-indigo-500">
                </div>
              </div>

              <div>
                <label class="block text-[10px] font-bold text-slate-600 mb-1">Link de Destino do Botão</label>
                <input type="text" id="site-box-link-${b.id}" value="${escapeHtml(b.action_link || '#contato')}" placeholder="#contato ou URL" class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-700 focus:outline-none focus:border-indigo-500">
              </div>
            </div>

            <!-- Botão Salvar Box -->
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <a href="/#areas" target="_blank" class="text-[11px] text-slate-500 hover:text-slate-800 font-bold flex items-center gap-1">
                <span>👁️</span><span>Ver na Home</span>
              </a>
              <button 
                type="button" 
                onclick="saveSiteBox(${b.id})" 
                id="btn-save-site-box-${b.id}"
                class="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-gold-600 hover:from-amber-600 text-slate-950 font-black text-xs shadow-sm flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer border border-gold-400">
                <span>💾</span><span>Salvar Box ${b.box_order}</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    async function saveSiteBox(id) {
      const titleInput = document.getElementById(`site-box-title-${id}`);
      const descInput = document.getElementById(`site-box-desc-${id}`);
      const itemsInput = document.getElementById(`site-box-items-${id}`);
      const imgInput = document.getElementById(`site-box-img-${id}`);
      const badgeInput = document.getElementById(`site-box-badge-${id}`);
      const labelInput = document.getElementById(`site-box-label-${id}`);
      const linkInput = document.getElementById(`site-box-link-${id}`);
      const btn = document.getElementById(`btn-save-site-box-${id}`);

      const title = titleInput ? titleInput.value.trim() : '';
      const description = descInput ? descInput.value.trim() : '';
      if (!title || !description) {
        alert('Título e descrição do box são obrigatórios.');
        return;
      }

      const items = itemsInput ? itemsInput.value.split('\n').map(s => s.trim()).filter(Boolean) : [];
      const image_url = imgInput ? imgInput.value.trim() : '';
      const badge = badgeInput ? badgeInput.value.trim() : '';
      const action_label = labelInput ? labelInput.value.trim() : 'Consultar';
      const action_link = linkInput ? linkInput.value.trim() : '#contato';

      const origText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>Salvando...</span>';
      }

      const token = getToken();
      try {
        const res = await fetch(`/api/admin/site/practice-areas/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            title,
            description,
            items,
            image_url,
            badge: badge || null,
            action_label,
            action_link
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (typeof window.clearUnsavedChanges === 'function') {
            window.clearUnsavedChanges(`card-site-box-${id}`);
          }
          if (typeof window.showToast === 'function') {
            window.showToast(`Box #${id} atualizado com sucesso no site oficial!`, 'success');
          } else {
            alert(`Box #${id} atualizado com sucesso no site oficial!`);
          }
        } else {
          alert(data.error || 'Erro ao salvar box do site.');
        }
      } catch (err) {
        console.error('Erro ao salvar box do site:', err);
        alert('Erro ao salvar box: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = origText;
        }
      }
    }
    window.saveSiteBox = saveSiteBox;

    async function uploadSiteBoxImage(id, fileInput) {
      if (!fileInput.files || !fileInput.files[0]) return;
      const file = fileInput.files[0];
      const token = getToken();

      const formData = new FormData();
      formData.append('image', file);

      try {
        const res = await fetch('/api/admin/site/practice-areas/upload-image', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const imgInput = document.getElementById(`site-box-img-${id}`);
          const imgPreview = document.getElementById(`site-box-img-preview-${id}`);
          if (imgInput) imgInput.value = data.url;
          if (imgPreview) imgPreview.src = data.url;

          if (typeof window.showToast === 'function') {
            window.showToast('Nova foto do box carregada com sucesso! Clique em "Salvar" para confirmar.', 'success');
          } else {
            alert('Nova foto do box carregada! Clique em "Salvar Box" para confirmar.');
          }
        } else {
          alert(data.error || 'Erro no upload da foto do box.');
        }
      } catch (err) {
        console.error('Erro ao fazer upload da imagem do box:', err);
        alert('Erro ao enviar imagem: ' + err.message);
      } finally {
        fileInput.value = '';
      }
    }
    window.uploadSiteBoxImage = uploadSiteBoxImage;


    // MODAL DE MODERAÇÃO DE COMENTÁRIOS DO BLOG & CONTROLE DE CONTEÚDO
    // =========================================================================
    function switchBlogSubTab(subtab) {
      const postsSec = document.getElementById('admin-blog-subtab-posts');
      const commentsSec = document.getElementById('admin-blog-subtab-comments');
      const btnPosts = document.getElementById('blog-subtab-btn-posts');
      const btnComments = document.getElementById('blog-subtab-btn-comments');
      if (!postsSec || !commentsSec) return;

      if (subtab === 'posts') {
        postsSec.classList.remove('hidden');
        commentsSec.classList.add('hidden');
        if (btnPosts) btnPosts.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 via-gold-500 to-amber-600 text-white shadow-sm transition-all border border-gold-400/60';
        if (btnComments) btnComments.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-navy-950 hover:bg-slate-50 transition-all';
        loadAdminBlogPosts();
      } else {
        postsSec.classList.add('hidden');
        commentsSec.classList.remove('hidden');
        if (btnComments) btnComments.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 via-gold-500 to-amber-600 text-white shadow-sm transition-all border border-gold-400/60';
        if (btnPosts) btnPosts.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-navy-950 hover:bg-slate-50 transition-all';
        loadAdminBlogComments();
      }
    }

    let allBlogComments = [];
    async function loadAdminBlogComments() {
      try {
        const res = await fetch('/api/admin/blog/comments', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          allBlogComments = data.comments || [];
          const countEl = document.getElementById('blog-subtab-comments-count');
          if (countEl) countEl.textContent = allBlogComments.length;
          renderAdminBlogComments(allBlogComments);
        }
      } catch (err) {
        console.error('Erro ao carregar comentários do blog:', err);
      }
    }

    function renderAdminBlogComments(comments) {
      const tbody = document.getElementById('admin-blog-comments-table-body');
      if (!tbody) return;
      if (comments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400">Nenhum comentário registrado nos artigos do blog.</td></tr>';
        return;
      }
      tbody.innerHTML = comments.map(c => `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-5 py-3.5 max-w-xs">
            <p class="font-bold text-navy-950 truncate">${c.post_title || c.post_slug || 'Artigo do Blog'}</p>
            <a href="/blog" target="_blank" class="text-[11px] text-gold-700 hover:underline">Ver Artigo ↗</a>
          </td>
          <td class="px-5 py-3.5">
            <p class="font-bold text-slate-900">${c.author_name}</p>
            <p class="text-[11px] text-emerald-700 font-mono">${c.author_phone || 'S/ Whats'}</p>
            <p class="text-[10px] text-slate-400 truncate">${c.author_email || 'S/ E-mail'}</p>
          </td>
          <td class="px-5 py-3.5 max-w-sm">
            <p class="text-slate-800 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 leading-relaxed">${c.comment_text || c.content || ''}</p>
          </td>
          <td class="px-5 py-3.5 whitespace-nowrap text-slate-500 text-[11px]">
            <div>${c.created_at ? new Date(c.created_at).toLocaleString('pt-BR') : '-'}</div>
            <div class="text-[10px] text-slate-400 font-mono">IP: ${c.ip_address || '—'}</div>
          </td>
          <td class="px-5 py-3.5 text-center">
            ${(c.is_hidden === 0 || c.is_hidden === false || c.is_visible)
              ? '<span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300">✅ Visível</span>'
              : '<span class="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] border border-rose-300">👁️ Oculto</span>'}
          </td>
          <td class="px-5 py-3.5 text-right whitespace-nowrap">
            <div class="flex items-center justify-end space-x-1.5">
              <button onclick="toggleBlogCommentVisibility('${c.id}')" title="${(c.is_hidden === 0 || c.is_hidden === false) ? 'Esconder do Blog' : 'Tornar Visível'}" class="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer">
                ${(c.is_hidden === 0 || c.is_hidden === false) ? '👁️ Esconder' : '✅ Publicar'}
              </button>
              <button onclick="convertBlogCommentToLead('${c.id}')" title="Converter autor em Pré-Cliente / Lead" class="px-2.5 py-1.5 rounded-lg border border-gold-400 bg-gold-50 hover:bg-gold-100 text-gold-950 text-xs font-bold transition-all cursor-pointer">
                👤 Lead
              </button>
              <button onclick="deleteBlogComment('${c.id}')" title="Excluir Comentário" class="px-2.5 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold transition-all cursor-pointer">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    async function toggleBlogCommentVisibility(id) {
      try {
        const res = await fetch(`/api/admin/blog/comments/${id}/toggle-visibility`, {
          method: 'PUT',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadAdminBlogComments();
        } else {
          alert('Erro ao alterar visibilidade: ' + (data.error || 'Falha no servidor.'));
        }
      } catch (err) {
        alert('Erro de comunicação com o servidor.');
      }
    }

    async function deleteBlogComment(id) {
      if (!confirm('Deseja realmente excluir este comentário de forma permanente?')) return;
      try {
        const res = await fetch(`/api/admin/blog/comments/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadAdminBlogComments();
        } else {
          alert('Erro ao excluir comentário: ' + (data.error || 'Falha no servidor.'));
        }
      } catch (err) {
        alert('Erro de comunicação com o servidor.');
      }
    }

    async function convertBlogCommentToLead(id) {
      try {
        const res = await fetch(`/api/admin/blog/comments/${id}/convert-to-lead`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('✅ Autor do comentário convertido em Pré-Cliente / Lead com sucesso!');
          loadLeads();
        } else {
          alert('Erro ao converter: ' + (data.error || 'Falha no servidor.'));
        }
      } catch (err) {
        alert('Erro de comunicação com o servidor.');
      }
    }

    function filterBlogComments() {
      const term = (document.getElementById('admin-blog-comment-search')?.value || '').toLowerCase();
      const status = document.getElementById('admin-blog-comment-status-filter')?.value || 'ALL';
      const filtered = allBlogComments.filter(c => {
        const matchTerm = !term || (
          (c.author_name && c.author_name.toLowerCase().includes(term)) ||
          (c.content && c.content.toLowerCase().includes(term)) ||
          (c.author_email && c.author_email.toLowerCase().includes(term)) ||
          (c.author_phone && c.author_phone.toLowerCase().includes(term)) ||
          (c.post_title && c.post_title.toLowerCase().includes(term))
        );
        const matchStatus = status === 'ALL' || (status === 'visible' && c.is_visible) || (status === 'hidden' && !c.is_visible);
        return matchTerm && matchStatus;
      });
      renderAdminBlogComments(filtered);
    }

    // =========================================================================

  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.loadAdminBlogPosts = typeof loadAdminBlogPosts !== 'undefined' ? loadAdminBlogPosts : window.loadAdminBlogPosts;
  window.renderAdminBlogTable = typeof renderAdminBlogTable !== 'undefined' ? renderAdminBlogTable : window.renderAdminBlogTable;
  window.shareAdminBlogPostToMeta = typeof shareAdminBlogPostToMeta !== 'undefined' ? shareAdminBlogPostToMeta : window.shareAdminBlogPostToMeta;
  window.filterAdminBlogPosts = typeof filterAdminBlogPosts !== 'undefined' ? filterAdminBlogPosts : window.filterAdminBlogPosts;
  window.openNewBlogPostModal = typeof openNewBlogPostModal !== 'undefined' ? openNewBlogPostModal : window.openNewBlogPostModal;
  window.openEditBlogPostModal = typeof openEditBlogPostModal !== 'undefined' ? openEditBlogPostModal : window.openEditBlogPostModal;
  window.closeBlogEditorModal = typeof closeBlogEditorModal !== 'undefined' ? closeBlogEditorModal : window.closeBlogEditorModal;
  window.saveAndShareBlogPostToMeta = typeof saveAndShareBlogPostToMeta !== 'undefined' ? saveAndShareBlogPostToMeta : window.saveAndShareBlogPostToMeta;
  window.handleSaveBlogPost = typeof handleSaveBlogPost !== 'undefined' ? handleSaveBlogPost : window.handleSaveBlogPost;
  window.deleteBlogPost = typeof deleteBlogPost !== 'undefined' ? deleteBlogPost : window.deleteBlogPost;
  window.insertBlogTag = typeof insertBlogTag !== 'undefined' ? insertBlogTag : window.insertBlogTag;
  window.toggleBlogPreview = typeof toggleBlogPreview !== 'undefined' ? toggleBlogPreview : window.toggleBlogPreview;
  window.setBlogImagePreset = typeof setBlogImagePreset !== 'undefined' ? setBlogImagePreset : window.setBlogImagePreset;
  window.handleBlogCoverUpload = typeof handleBlogCoverUpload !== 'undefined' ? handleBlogCoverUpload : window.handleBlogCoverUpload;
  window.removeBlogCoverPreview = typeof removeBlogCoverPreview !== 'undefined' ? removeBlogCoverPreview : window.removeBlogCoverPreview;
  window.handleBlogContentMediaUpload = typeof handleBlogContentMediaUpload !== 'undefined' ? handleBlogContentMediaUpload : window.handleBlogContentMediaUpload;
  window.loadSiteBoxesTab = typeof loadSiteBoxesTab !== 'undefined' ? loadSiteBoxesTab : window.loadSiteBoxesTab;
  window.renderSiteBoxes = typeof renderSiteBoxes !== 'undefined' ? renderSiteBoxes : window.renderSiteBoxes;
  window.saveSiteBox = typeof saveSiteBox !== 'undefined' ? saveSiteBox : window.saveSiteBox;
  window.uploadSiteBoxImage = typeof uploadSiteBoxImage !== 'undefined' ? uploadSiteBoxImage : window.uploadSiteBoxImage;
  window.switchBlogSubTab = typeof switchBlogSubTab !== 'undefined' ? switchBlogSubTab : window.switchBlogSubTab;
  window.loadAdminBlogComments = typeof loadAdminBlogComments !== 'undefined' ? loadAdminBlogComments : window.loadAdminBlogComments;
  window.renderAdminBlogComments = typeof renderAdminBlogComments !== 'undefined' ? renderAdminBlogComments : window.renderAdminBlogComments;
  window.toggleBlogCommentVisibility = typeof toggleBlogCommentVisibility !== 'undefined' ? toggleBlogCommentVisibility : window.toggleBlogCommentVisibility;
  window.deleteBlogComment = typeof deleteBlogComment !== 'undefined' ? deleteBlogComment : window.deleteBlogComment;
  window.convertBlogCommentToLead = typeof convertBlogCommentToLead !== 'undefined' ? convertBlogCommentToLead : window.convertBlogCommentToLead;
  window.filterBlogComments = typeof filterBlogComments !== 'undefined' ? filterBlogComments : window.filterBlogComments;
})();
