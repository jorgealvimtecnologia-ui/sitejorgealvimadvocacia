/**
 * OCR "Zero Digitação" no cadastro de clientes.
 * Lê a foto do RG/CNH (via POST /api/ocr/documento) e pré-preenche os campos
 * nome, CPF, RG e filiação (mãe). Funciona no celular (input capture=camera).
 *
 * Backend: src/modules/ocr/ocr.routes.js + scripts/ocr_documento.py (Tesseract no servidor).
 * Degrada com elegância: se o OCR não estiver disponível no servidor, mostra aviso claro
 * e o cadastro manual segue normal.
 */
(function () {
  'use strict';

  // Mapa: campo do OCR -> id do input no formulário de cliente
  var MAPA = {
    nome: 'cli-fullname',
    cpf: 'cli-cpf',
    rg: 'cli-rg',
    nome_mae: 'cli-mother'
  };

  function statusEl() {
    return document.getElementById('cli-ocr-status');
  }

  function setStatus(html, cor) {
    var el = statusEl();
    if (!el) return;
    el.className = 'text-[11px] font-semibold mt-1 ' + (cor || 'text-slate-500');
    el.innerHTML = html;
  }

  function preencher(id, valor) {
    if (!valor) return false;
    var input = document.getElementById(id);
    if (!input) return false;
    input.value = valor;
    // dispara input/change para acionar máscaras (ex.: maskCPF) e validações
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.classList.add('ring-2', 'ring-gold-400');
    setTimeout(function () { input.classList.remove('ring-2', 'ring-gold-400'); }, 2500);
    return true;
  }

  // Chamado pelo onchange do input de arquivo (window.ocrLerDocumento)
  window.ocrLerDocumento = async function (inputEl) {
    var file = inputEl && inputEl.files && inputEl.files[0];
    if (!file) return;

    setStatus('🔄 Lendo o documento…', 'text-blue-600');

    try {
      var token = (typeof window.getToken === 'function') ? window.getToken() : null;
      var fd = new FormData();
      fd.append('documento', file);

      var res = await fetch('/api/ocr/documento', {
        method: 'POST',
        headers: token ? { 'Authorization': 'Bearer ' + token } : {},
        body: fd
      });
      var data = await res.json().catch(function () { return null; });

      if (res.status === 503) {
        setStatus('⚠️ OCR indisponível no servidor (Tesseract não instalado). Preencha manualmente.', 'text-amber-600');
        return;
      }
      if (!res.ok || !data || !data.ok) {
        var msg = (data && data.erro) ? data.erro : 'Não foi possível ler o documento. Tente uma foto mais nítida.';
        setStatus('⚠️ ' + msg, 'text-amber-600');
        return;
      }

      var campos = data.campos || {};
      var preenchidos = 0;
      Object.keys(MAPA).forEach(function (k) {
        if (preencher(MAPA[k], campos[k])) preenchidos++;
      });

      if (preenchidos === 0) {
        setStatus('⚠️ Documento lido, mas nenhum campo reconhecido. Tente outra foto ou preencha manualmente.', 'text-amber-600');
      } else {
        var tipo = data.tipo && data.tipo !== 'desconhecido' ? data.tipo.toUpperCase() : 'documento';
        setStatus('✅ ' + preenchidos + ' campo(s) preenchidos a partir do ' + tipo + '. Confira antes de salvar.', 'text-emerald-600');
      }
    } catch (e) {
      setStatus('⚠️ Falha ao enviar a imagem: ' + (e && e.message ? e.message : e), 'text-rose-600');
    } finally {
      // limpa o input para permitir reenviar a mesma foto se preciso
      try { inputEl.value = ''; } catch (_) {}
    }
  };
})();
