// Módulo Core: Notificações em Tempo Real (SSE, Web Audio Chime e Toasts)

let sseConnection = null;

function initRealtimeNotifications() {
  const token = getToken();
  if (!token) return;

  if (sseConnection) {
    sseConnection.close();
  }

  try {
    sseConnection = new EventSource(`/api/notifications/stream?token=${token}`);

    sseConnection.addEventListener('connected', (e) => {
      console.log('⚡ [SSE] Conexão em tempo real estabelecida com o servidor!');
    });

    sseConnection.addEventListener('foguete_novo', (e) => {
      try {
        const data = JSON.parse(e.data);
        playNotificationSound();
        showToastNotification(`🚀 Novo Foguete: #${data.payload.protocol_number}`, data.payload.subject, 'foguete');
        if (typeof loadRocketStats === 'function') loadRocketStats();
        if (typeof loadRockets === 'function') loadRockets();
      } catch (err) {}
    });

    sseConnection.addEventListener('foguete_resposta', (e) => {
      try {
        const data = JSON.parse(e.data);
        playNotificationSound();
        showToastNotification(`💬 Resposta no Foguete #${data.payload.protocol_number}`, `${data.payload.author_name}: ${data.payload.message}`, 'foguete');
        if (typeof loadRocketStats === 'function') loadRocketStats();
        if (typeof loadRockets === 'function') loadRockets();
      } catch (err) {}
    });

    sseConnection.addEventListener('novo_lead', (e) => {
      try {
        const data = JSON.parse(e.data);
        playNotificationSound();
        showToastNotification(`👤 Novo Atendimento no Site!`, `${data.payload.name} (${data.payload.area})`, 'lead');
        if (typeof loadLeads === 'function') loadLeads();
      } catch (err) {}
    });

    sseConnection.onerror = () => {
      console.warn('⚡ [SSE] Conexão perdida. Tentando reconectar automaticamente...');
    };
  } catch (err) {
    console.error('⚡ [SSE] Erro ao iniciar EventSource:', err);
  }
}

/**
 * Toca um aviso sonoro elegante e sutil usando a Web Audio API nativa
 */
function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.1);
    osc1.stop(ctx.currentTime + 0.35);
    osc2.stop(ctx.currentTime + 0.35);
  } catch (e) {
    // Web Audio blocked by browser policy until first click
  }
}

/**
 * Exibe um toast flutuante no canto superior direito
 */
function showToastNotification(title, message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed top-5 right-5 z-[9999] flex flex-col space-y-3 max-w-sm w-full pointer-events-none';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = 'p-4 rounded-2xl bg-navy-950 text-white shadow-2xl border border-gold-500/50 flex items-start space-x-3 pointer-events-auto transform translate-y-[-20px] opacity-0 transition-all duration-300';
  
  let icon = '🔔';
  if (type === 'foguete') icon = '🚀';
  if (type === 'lead') icon = '👤';

  toast.innerHTML = `
    <div class="text-xl flex-shrink-0">${icon}</div>
    <div class="flex-1 space-y-0.5">
      <h4 class="text-xs font-black text-gold-400 font-serif">${title}</h4>
      <p class="text-[11px] text-slate-300 leading-snug">${message}</p>
    </div>
    <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white text-xs">✕</button>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-[-20px]', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-[-20px]');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initRealtimeNotifications, 1000);
});
