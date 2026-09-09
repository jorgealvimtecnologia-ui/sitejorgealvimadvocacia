/**
 * Módulo CONTEÚDO DO SITE — Gerenciamento dos 6 boxes de Áreas de Atuação
 * exibidos na página inicial (index.html).
 */
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const siteContentRouter = express.Router();

// Inicialização da Tabela de Boxes da Página Inicial
db.exec(`
  CREATE TABLE IF NOT EXISTS site_practice_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    box_order INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    items_json TEXT NOT NULL,
    image_url TEXT NOT NULL,
    badge TEXT DEFAULT NULL,
    action_label TEXT DEFAULT 'Anexar Notificação / Consultar',
    action_link TEXT DEFAULT '#contato',
    updated_at TEXT NOT NULL
  );
`);

// Seeder Inicial Idempotente dos 6 Boxes Oficiais do Escritório
const countAreas = db.prepare(`SELECT COUNT(*) as total FROM site_practice_areas`).get().total;
if (countAreas === 0) {
  const now = new Date().toISOString();
  const defaultBoxes = [
    {
      box_order: 1,
      title: 'Direito dos Transportes e do Trânsito',
      description: 'Defesa especializada contra penalidades indevidas, processos de suspensão/cassação de CNH, acidentes de trânsito e assessoria a transportadores.',
      items: [
        'Defesa em processos de suspensão e cassação de CNH',
        'Recursos contra multas graves, bafômetro e autuações indevidas',
        'Indenizações por acidentes de trânsito e seguradoras'
      ],
      image_url: 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=800&q=70',
      badge: 'Especialidade',
      action_label: 'Anexar Notificação / Consultar',
      action_link: '#contato'
    },
    {
      box_order: 2,
      title: 'Direito Civil & Contratos',
      description: 'Elaboração e revisão contratual minuciosa, ações de cobrança, recuperação de créditos e reparações por danos patrimoniais e morais.',
      items: [
        'Análise e blindagem de cláusulas contratuais',
        'Indenizações por danos materiais e morais',
        'Cobranças extrajudiciais e judiciais de inadimplentes'
      ],
      image_url: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=70',
      badge: null,
      action_label: 'Anexar Contrato / Consultar',
      action_link: '#contato'
    },
    {
      box_order: 3,
      title: 'Direito de Família',
      description: 'Condução sensível, rápida e estratégica de divórcios consensuais e litigiosos, fixação e execução de pensão, guarda e união estável.',
      items: [
        'Divórcio consensual em cartório e litigioso',
        'Fixação, revisão e execução de pensão alimentícia',
        'Guarda compartilhada, convivência e união estável'
      ],
      image_url: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=800&q=70',
      badge: null,
      action_label: 'Consultar sobre esta área',
      action_link: '#contato'
    },
    {
      box_order: 4,
      title: 'Direito Trabalhista',
      description: 'Defesa intransigente de direitos em rescisões, horas extras, insalubridade, pejotização e acordos estratégicos.',
      items: [
        'Cálculo preciso e cobrança de verbas rescisórias',
        'Reconhecimento de vínculo de emprego e pejotização',
        'Indenizações por danos morais e assédio no trabalho'
      ],
      image_url: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&q=70',
      badge: null,
      action_label: 'Consultar sobre esta área',
      action_link: '#contato'
    },
    {
      box_order: 5,
      title: 'Direito Previdenciário (INSS)',
      description: 'Planejamento previdenciário e concessão de benefícios: aposentadorias por idade/tempo/especial, auxílio por incapacidade e BPC/LOAS.',
      items: [
        'Planejamento da melhor aposentadoria',
        'Ações contra benefícios negados pelo INSS',
        'Revisão da vida toda e cálculo de tempo especial'
      ],
      image_url: 'https://images.unsplash.com/photo-1516307365426-bea591f05011?auto=format&fit=crop&w=800&q=70',
      badge: null,
      action_label: 'Consultar sobre esta área',
      action_link: '#contato'
    },
    {
      box_order: 6,
      title: 'Direito Militar & Forças Armadas',
      description: 'Defesa técnica e especializada para integrantes do Exército, Marinha, Aeronáutica e Forças Auxiliares. Atuação com a experiência prática do Dr. Jorge Alvim, Subtenente R1 do Exército Brasileiro.',
      items: [
        'Sindicâncias, FATD, Conselhos de Disciplina e Processos Administrativos',
        'Reformas militares, pensões, revisão de proventos e ações na Justiça Militar',
        'Defesas disciplinares no âmbito do RDE (Dec. 4.346/2002)'
      ],
      image_url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=800&q=70',
      badge: 'Subtenente R1 Exército',
      action_label: 'Consultar sobre esta área',
      action_link: '#contato'
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO site_practice_areas (
      box_order, title, description, items_json, image_url, badge, action_label, action_link, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const b of defaultBoxes) {
    stmt.run(
      b.box_order,
      b.title,
      b.description,
      JSON.stringify(b.items),
      b.image_url,
      b.badge,
      b.action_label,
      b.action_link,
      now
    );
  }
  console.log('🏛️ [SITE] 6 Boxes de Áreas de Atuação semeados com sucesso!');
} else {
  // Migração idempotente: atualizar Box 3 legado caso contenha Sucessões ou Inventário
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE site_practice_areas
    SET title = 'Direito de Família',
        description = 'Condução sensível, rápida e estratégica de divórcios consensuais e litigiosos, fixação e execução de pensão, guarda e união estável.',
        items_json = ?,
        updated_at = ?
    WHERE box_order = 3 AND (title LIKE '%Sucessões%' OR description LIKE '%inventário%')
  `).run(
    JSON.stringify([
      'Divórcio consensual em cartório e litigioso',
      'Fixação, revisão e execução de pensão alimentícia',
      'Guarda compartilhada, convivência e união estável'
    ]),
    now
  );
}

// 1. GET /api/site/practice-areas (Público - Usado pela Home)
siteContentRouter.get('/api/site/practice-areas', (req, res) => {
  try {
    const areas = db.prepare(`SELECT * FROM site_practice_areas ORDER BY box_order ASC`).all();
    const formatted = areas.map(a => {
      let items = [];
      try {
        items = typeof a.items_json === 'string' ? JSON.parse(a.items_json) : (a.items_json || []);
      } catch (e) {
        items = (a.items_json || '').split('\n').filter(Boolean);
      }
      return {
        ...a,
        items
      };
    });
    res.json(formatted);
  } catch (err) {
    console.error('Erro ao listar áreas de atuação do site:', err);
    res.status(500).json({ error: 'Erro ao carregar áreas do site.' });
  }
});

// 2. GET /api/admin/site/practice-areas (Admin)
siteContentRouter.get('/api/admin/site/practice-areas', requireAuth, (req, res) => {
  try {
    const areas = db.prepare(`SELECT * FROM site_practice_areas ORDER BY box_order ASC`).all();
    const formatted = areas.map(a => {
      let items = [];
      try {
        items = typeof a.items_json === 'string' ? JSON.parse(a.items_json) : (a.items_json || []);
      } catch (e) {
        items = (a.items_json || '').split('\n').filter(Boolean);
      }
      return {
        ...a,
        items
      };
    });
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar áreas de atuação.' });
  }
});

// 3. PUT /api/admin/site/practice-areas/:id (Admin - Atualizar um dos 6 boxes)
siteContentRouter.put('/api/admin/site/practice-areas/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, items, image_url, badge, action_label, action_link } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Título e descrição são obrigatórios.' });
    }

    const itemsJson = Array.isArray(items) ? JSON.stringify(items) : (typeof items === 'string' ? JSON.stringify(items.split('\n').map(s => s.trim()).filter(Boolean)) : '[]');
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE site_practice_areas 
      SET title = ?, description = ?, items_json = ?, image_url = ?, badge = ?, action_label = ?, action_link = ?, updated_at = ?
      WHERE id = ?
    `).run(
      title.trim(),
      description.trim(),
      itemsJson,
      (image_url || '').trim(),
      badge ? badge.trim() : null,
      (action_label || 'Consultar').trim(),
      (action_link || '#contato').trim(),
      now,
      id
    );

    logAudit(req, {
      event_type: 'ATUALIZACAO',
      event_name: 'ATUALIZAR_BOX_SITE',
      module: 'SITE_CONTENT',
      resource_id: id,
      description: `Atualização do Box #${id} da Página Inicial: "${title}".`
    });

    res.json({ success: true, message: 'Box da página inicial atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar box do site:', err);
    res.status(500).json({ error: 'Erro ao atualizar box do site: ' + err.message });
  }
});

// 4. Upload de Imagem para os Boxes da Página Inicial
const areasStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'public', 'img', 'areas');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_') || 'box-img';
    cb(null, `${Date.now()}_${baseName}${ext}`);
  }
});
const uploadAreaImg = multer({ storage: areasStorage, limits: { fileSize: 15 * 1024 * 1024 } });

siteContentRouter.post('/api/admin/site/practice-areas/upload-image', requireAuth, uploadAreaImg.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }
    const fileUrl = `/img/areas/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  } catch (err) {
    res.status(500).json({ error: 'Erro no upload da imagem: ' + err.message });
  }
});
