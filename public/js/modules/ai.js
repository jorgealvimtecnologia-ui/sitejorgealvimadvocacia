// Módulo Frontend: 🤖 Inteligência Artificial Jurídica & Automações

let lastAiAnalysis = null;

function openAiDraftModal() {
  const modal = document.getElementById('ai-draft-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeAiDraftModal() {
  const modal = document.getElementById('ai-draft-modal');
  if (modal) modal.classList.add('hidden');
}

async function generateAiDraft(e) {
  if (e && e.preventDefault) e.preventDefault();

  const doc_type = document.getElementById('ai-doc-type')?.value || 'peticao_inicial';
  const client_name = document.getElementById('ai-client-name')?.value || '';
  const client_cpf_cnpj = document.getElementById('ai-client-cpf')?.value || '';
  const adverse_party = document.getElementById('ai-adverse-party')?.value || '';
  const court_jurisdiction = document.getElementById('ai-court')?.value || '';
  const facts_summary = document.getElementById('ai-facts')?.value || '';
  const legal_grounds = document.getElementById('ai-grounds')?.value || '';
  const requests_summary = document.getElementById('ai-requests')?.value || '';
  const value_in_dispute = document.getElementById('ai-value')?.value || '';

  if (!client_name || !facts_summary) {
    alert('Preencha ao menos o nome do cliente e o resumo dos fatos.');
    return;
  }

  const resultContainer = document.getElementById('ai-draft-result');
  const textarea = document.getElementById('ai-draft-text');
  const btn = document.getElementById('ai-generate-btn');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Redigindo Peça com IA...</span>';
  }

  try {
    const res = await apiFetch('/api/ai/draft-document', {
      method: 'POST',
      body: JSON.stringify({
        doc_type,
        client_name,
        client_cpf_cnpj,
        adverse_party,
        court_jurisdiction,
        facts_summary,
        legal_grounds,
        requests_summary,
        value_in_dispute
      })
    });

    const data = await res.json();

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>✨ Gerar Minuta Completa com IA</span>';
    }

    if (res.ok && data.success) {
      if (textarea) textarea.value = data.content;
      if (resultContainer) resultContainer.classList.remove('hidden');
      resultContainer.scrollIntoView({ behavior: 'smooth' });
    } else {
      alert(data.error || 'Erro ao gerar minuta.');
    }
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>✨ Gerar Minuta Completa com IA</span>';
    }
    console.error('[IA] Erro na geração:', err);
    alert('Erro de comunicação com o servidor.');
  }
}

function copyAiDraftText() {
  const textarea = document.getElementById('ai-draft-text');
  if (!textarea) return;
  navigator.clipboard.writeText(textarea.value).then(() => {
    alert('✓ Texto da peça copiado com sucesso para a área de transferência!');
  });
}

function openAiPublicationModal() {
  const modal = document.getElementById('ai-pub-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeAiPublicationModal() {
  const modal = document.getElementById('ai-pub-modal');
  if (modal) modal.classList.add('hidden');
}

async function analyzePublicationWithAi(e) {
  if (e && e.preventDefault) e.preventDefault();

  const text = document.getElementById('ai-pub-text')?.value || '';
  const regime = document.getElementById('ai-pub-regime')?.value || 'CPC';

  if (!text || text.trim().length < 10) {
    alert('Cole o texto da intimação ou sentença para análise.');
    return;
  }

  const resultContainer = document.getElementById('ai-pub-result');
  const btn = document.getElementById('ai-pub-btn');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Analisando Publicação & Prazos...</span>';
  }

  try {
    const res = await apiFetch('/api/ai/analyze-publication', {
      method: 'POST',
      body: JSON.stringify({
        publication_text: text,
        regime
      })
    });

    const data = await res.json();

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🔍 Analisar e Extrair Prazo Fatal</span>';
    }

    if (res.ok && data.success) {
      lastAiAnalysis = data.analysis;
      const a = data.analysis;

      document.getElementById('ai-pub-detected-type').textContent = a.detected_type;
      document.getElementById('ai-pub-detected-cnj').textContent = a.detected_cnj || 'Não identificado no texto';
      document.getElementById('ai-pub-deadline-days').textContent = `${a.deadline_days} dias úteis (${a.regime})`;
      document.getElementById('ai-pub-fatal-date').textContent = a.fatal_date_estimate;
      document.getElementById('ai-pub-suggested-action').textContent = a.suggested_action;
      document.getElementById('ai-pub-urgency').textContent = a.urgency_level;

      if (resultContainer) resultContainer.classList.remove('hidden');
      resultContainer.scrollIntoView({ behavior: 'smooth' });
    } else {
      alert(data.error || 'Erro na análise da publicação.');
    }
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🔍 Analisar e Extrair Prazo Fatal</span>';
    }
    console.error('[IA] Erro na análise:', err);
    alert('Erro de comunicação com o servidor.');
  }
}

async function scheduleAnalyzedDeadline() {
  if (!lastAiAnalysis) return;

  try {
    const res = await apiFetch('/api/calendar', {
      method: 'POST',
      body: JSON.stringify({
        title: `Prazo: ${lastAiAnalysis.detected_type} - ${lastAiAnalysis.suggested_action.slice(0, 40)}...`,
        event_type: 'Prazo Fatal',
        start_date: lastAiAnalysis.fatal_date_estimate,
        start_time: '18:00',
        priority: lastAiAnalysis.urgency_level === 'Altíssima' ? 'Alta' : 'Media',
        description: `Agendado automaticamente pela IA a partir de publicação judicial.\nProvidência: ${lastAiAnalysis.suggested_action}\nPrazo: ${lastAiAnalysis.deadline_days} dias úteis.`
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✓ Prazo agendado na Agenda com sucesso para o dia ${lastAiAnalysis.fatal_date_estimate}!`);
      closeAiPublicationModal();
      if (typeof initCalendarTab === 'function') initCalendarTab();
    } else {
      alert(data.error || 'Erro ao agendar prazo.');
    }
  } catch (err) {
    console.error('Erro ao agendar:', err);
    alert('Erro ao registrar na agenda.');
  }
}
