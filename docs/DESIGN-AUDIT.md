# Auditoria visual (AUD-18)

Gerada por `node scripts/design-audit.js --escrever` em 2026-10-04. Mede o que as páginas realmente usam.

## O que a medição mostrou

- **83 cores diferentes** (hexadecimais) espalhadas em páginas e CSS; as mais usadas: `#B8860B` (22), `#FFFFFF` (18), `#E2E8F0` (15), `#0F172A` (15), `#CBD5E1` (14), `#94A3B8` (14), `#D97706` (13), `#F1F5F9` (12), `#0A192F` (12), `#F8FAFC` (11), `#334155` (11), `#D4AF37` (10).
- **3 versões do "azul-marinho 950"** entre as páginas — a marca deveria ter uma só: `index.html: #060D17` · `painel.html: #0B192C` · `cliente.html: #060E1A` · `colaborador.html: #060E1A` · `blog.html: #060E1A`.
- **22 combinações de degradê em botões** (cada tela inventa a sua): `from-amber-500 via-gold-500 to-amber-600` ×39, `from-emerald-600 to-teal-700` ×5, `from-teal-600 to-emerald-700` ×5, `from-amber-500 to-gold-500` ×4, `from-amber-500 to-gold-600` ×4, `from-emerald-600 to-emerald-700` ×2.
- Fontes declaradas em CSS: Plus Jakarta Sans (4), Playfair Display (2), inherit (1), monospace (1), -apple-system (1).

## Por página

| Página | Linhas | Navy 950 | Gold 600 |
| --- | ---: | --- | --- |
| index.html | 4283 | #060D17 | #A17529 |
| painel.html | 11735 | #0B192C | #A17529 |
| cliente.html | 2555 | #060E1A | #B8860B |
| colaborador.html | 1929 | #060E1A | #B8860B |
| blog.html | 1324 | #060E1A | #B8860B |
| agendar.html | 262 | — | — |
| assinar.html | 314 | — | — |
| anexar.html | 283 | — | — |

## O que fazer com isso

Ver `docs/DESIGN-SYSTEM.md`: tokens únicos (`public/css/tokens.css`), componentes-base (`public/css/components.css`) e a página-catálogo `/design-system`.
