'use strict';

/**
 * Injeção de marca d'água (watermark) no PDF no momento do download.
 *
 * Objetivo anti-pirataria: estampar, no rodapé de TODAS as páginas, dados que
 * individualizam o comprador (e-mail + CPF parcialmente mascarado + id do
 * pedido + data). Isso desencoraja o compartilhamento, pois a cópia vazada
 * aponta para quem comprou.
 *
 * Observações:
 *  - O arquivo privado original NUNCA é alterado. Geramos um buffer novo em
 *    memória a cada download.
 *  - Mascaramos o CPF (ex.: 123.***.***-09) no rodapé para reduzir exposição de
 *    dado pessoal sensível (LGPD) mantendo a rastreabilidade. O CPF completo
 *    fica apenas no registro do pedido, de acesso restrito.
 */

const fs = require('fs');
const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');

function maskCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return cpf || '';
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

/**
 * @param {object} opts
 * @param {string} opts.sourcePath  caminho absoluto do PDF privado original
 * @param {string} opts.email
 * @param {string} opts.cpf
 * @param {string} opts.orderUuid
 * @returns {Promise<Buffer>} PDF com marca d'água
 */
async function watermarkPdf({ sourcePath, email, cpf, orderUuid }) {
  const bytes = fs.readFileSync(sourcePath);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const stamp = `Licenciado para ${email} | CPF ${maskCpf(cpf)} | Pedido ${orderUuid} | ${new Date()
    .toISOString().slice(0, 10)}`;

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width } = page.getSize();
    const size = 7;
    const textWidth = font.widthOfTextAtSize(stamp, size);

    // Faixa de fundo discreta no rodapé para garantir legibilidade
    page.drawRectangle({
      x: 0, y: 0, width, height: 16,
      color: rgb(0.96, 0.96, 0.96), opacity: 0.85,
    });
    page.drawText(stamp, {
      x: Math.max(8, (width - textWidth) / 2),
      y: 5,
      size,
      font,
      color: rgb(0.25, 0.25, 0.25),
    });

    // Marca d'água diagonal, bem leve, dificultando recorte do rodapé
    page.drawText(email, {
      x: width / 2 - 120, y: 120,
      size: 24, font, color: rgb(0.6, 0.6, 0.6),
      rotate: degrees(45), opacity: 0.08,
    });
  }

  // Metadado também carimbado (rastreável mesmo após "imprimir para PDF")
  pdfDoc.setSubject(`Licenca: ${email} / pedido ${orderUuid}`);

  const out = await pdfDoc.save();
  return Buffer.from(out);
}

module.exports = { watermarkPdf, maskCpf };
