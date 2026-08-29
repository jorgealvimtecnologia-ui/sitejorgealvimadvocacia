/**
 * Jorge Alvim Advocacia - Scripts Interativos
 */

// Configurações Gerais do Escritório (Facilmente editáveis)
const SITE_CONFIG = {
  // Substitua pelo número real de WhatsApp com DDD e código do país (ex: 5511999999999)
  whatsappNumber: '5511999999999', 
  defaultMessage: 'Olá! Gostaria de agendar uma consulta e obter orientação jurídica com o Dr. Jorge Alvim.',
};

document.addEventListener('DOMContentLoaded', () => {
  initNavbarScroll();
  initMobileMenu();
  initFaqAccordion();
  initPhoneMask();
  initContactForm();
  initSmoothScroll();
});

/**
 * 1. Estilização do Header ao Rolar a Página
 */
function initNavbarScroll() {
  const header = document.getElementById('main-header');
  if (!header) return;

  const handleScroll = () => {
    if (window.scrollY > 30) {
      header.classList.add('bg-navy-950/95', 'shadow-lg', 'border-b', 'border-gold-500/20', 'backdrop-blur-md');
      header.classList.remove('bg-transparent');
    } else {
      header.classList.remove('bg-navy-950/95', 'shadow-lg', 'border-b', 'border-gold-500/20', 'backdrop-blur-md');
      header.classList.add('bg-transparent');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();
}

/**
 * 2. Controle do Menu Mobile
 */
function initMobileMenu() {
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  const closeBtn = document.getElementById('mobile-menu-close');
  const menuLinks = document.querySelectorAll('.mobile-nav-link');

  if (!toggleBtn || !mobileMenu) return;

  const openMenu = () => {
    mobileMenu.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  };

  const closeMenu = () => {
    mobileMenu.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  };

  toggleBtn.addEventListener('click', openMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);

  menuLinks.forEach(link => {
    link.addEventListener('click', closeMenu);
  });
}

/**
 * 3. Accordion Interativo de Perguntas Frequentes (FAQ)
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const button = item.querySelector('.faq-button');
    const content = item.querySelector('.faq-content');
    const icon = item.querySelector('.faq-icon');

    if (!button || !content) return;

    button.addEventListener('click', () => {
      const isOpen = !content.classList.contains('hidden');

      // Fecha todos os outros itens
      faqItems.forEach(otherItem => {
        const otherContent = otherItem.querySelector('.faq-content');
        const otherIcon = otherItem.querySelector('.faq-icon');
        if (otherContent && otherContent !== content) {
          otherContent.classList.add('hidden');
          otherContent.style.maxHeight = null;
          if (otherIcon) otherIcon.style.transform = 'rotate(0deg)';
        }
      });

      // Alterna o item atual
      if (isOpen) {
        content.classList.add('hidden');
        content.style.maxHeight = null;
        if (icon) icon.style.transform = 'rotate(0deg)';
        button.setAttribute('aria-expanded', 'false');
      } else {
        content.classList.remove('hidden');
        if (icon) icon.style.transform = 'rotate(180deg)';
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/**
 * 4. Máscara de Telefone Brasileira: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
 */
function initPhoneMask() {
  const phoneInputs = document.querySelectorAll('input[type="tel"]');

  phoneInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length > 11) value = value.slice(0, 11);

      if (value.length > 10) {
        // (11) 98765-4321
        value = value.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
      } else if (value.length > 5) {
        // (11) 9876-5432
        value = value.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
      } else if (value.length > 2) {
        // (11) 9876
        value = value.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
      } else if (value.length > 0) {
        value = value.replace(/^(\d*)$/, '($1');
      }

      e.target.value = value;
    });
  });
}

/**
 * 5. Formulário de Contato Direto para WhatsApp
 */
function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('form-name')?.value.trim() || '';
    const phone = document.getElementById('form-phone')?.value.trim() || '';
    const area = document.getElementById('form-area')?.value || 'Geral / Outros';
    const message = document.getElementById('form-message')?.value.trim() || '';

    if (!name || !phone) {
      alert('Por favor, preencha seu nome e telefone para contato.');
      return;
    }

    // Formata o texto para envio direto ao WhatsApp
    let fullText = `*Novo Contato via Site - Jorge Alvim Advocacia*\n\n`;
    fullText += `*Nome:* ${name}\n`;
    fullText += `*Telefone:* ${phone}\n`;
    fullText += `*Área de Interesse:* ${area}\n`;
    if (message) {
      fullText += `*Descrição do Caso/Dúvida:* ${message}\n`;
    }
    fullText += `\n_Enviado através da página jorgealvimadvocacia.com.br_`;

    const encodedText = encodeURIComponent(fullText);
    const whatsappUrl = `https://wa.me/${SITE_CONFIG.whatsappNumber}?text=${encodedText}`;

    // Abre o WhatsApp em nova aba
    window.open(whatsappUrl, '_blank');
    
    // Feedback visual amigável
    const successFeedback = document.getElementById('form-success-feedback');
    if (successFeedback) {
      successFeedback.classList.remove('hidden');
      form.reset();
      setTimeout(() => {
        successFeedback.classList.add('hidden');
      }, 6000);
    }
  });
}

/**
 * 6. Navegação com Rolagem Suave para Âncoras
 */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#' || !targetId) return;

      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        const headerOffset = 80;
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// Exporta caso precise de chamadas externas
export { SITE_CONFIG };
