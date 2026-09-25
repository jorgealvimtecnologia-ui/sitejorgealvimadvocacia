#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OCR de documentos (RG / CNH) — "Zero Digitação".
Lê uma foto/scan e extrai nome, CPF, RG, data de nascimento e filiação para
pré-preencher o cadastro do cliente. Chamado pelo Node (src/modules/ocr/ocr.routes.js)
seguindo o mesmo padrão do radar_crawler.py (execFile python3 + JSON no stdout).

Uso:
    python3 ocr_documento.py --file <caminho_da_imagem> [--type rg|cnh|auto]

Saída (stdout): SEMPRE um JSON único.
    { "ok": true, "tipo": "cnh", "campos": {..}, "confianca": 0.0-1.0 }
    { "ok": false, "erro": "mensagem", "codigo": "SEM_TESSERACT" | ... }

Dependências no servidor: tesseract-ocr (binário, idioma por) + pip: pytesseract pillow
    sudo apt-get install -y tesseract-ocr tesseract-ocr-por
    pip install pytesseract pillow
"""
import sys
import json
import re
import argparse


def _fail(msg, codigo="ERRO"):
    print(json.dumps({"ok": False, "erro": msg, "codigo": codigo}, ensure_ascii=False))
    sys.exit(0)  # sai 0: o erro é comunicado no JSON, não no exit code


def _load_deps():
    try:
        import pytesseract  # noqa
        from PIL import Image, ImageOps, ImageFilter  # noqa
        return pytesseract, Image, ImageOps, ImageFilter
    except Exception as e:  # ambiente sem OCR instalado
        _fail(
            "OCR indisponivel no servidor: instale 'tesseract-ocr tesseract-ocr-por' "
            "e 'pip install pytesseract pillow'. Detalhe: " + str(e),
            "SEM_TESSERACT",
        )


# ---------------------------------------------------------------------------
#  Extração de campos por expressão regular (tolerante a ruído do OCR)
# ---------------------------------------------------------------------------
CPF_RE = re.compile(r"(\d{3})\D?(\d{3})\D?(\d{3})\D?(\d{2})")
DATA_RE = re.compile(r"(\d{2})[\/\.\- ](\d{2})[\/\.\- ](\d{4})")
RG_RE = re.compile(r"\b(\d{1,2}\.?\d{3}\.?\d{3}[-\.]?[0-9Xx])\b")


def _digits(s):
    return re.sub(r"\D", "", s or "")


def _valida_cpf(cpf):
    c = _digits(cpf)
    if len(c) != 11 or c == c[0] * 11:
        return False
    for i in (9, 10):
        soma = sum(int(c[n]) * ((i + 1) - n) for n in range(i))
        dv = (soma * 10) % 11
        dv = 0 if dv == 10 else dv
        if dv != int(c[i]):
            return False
    return True


def _fmt_cpf(cpf):
    c = _digits(cpf)
    return f"{c[0:3]}.{c[3:6]}.{c[6:9]}-{c[9:11]}" if len(c) == 11 else cpf


# Palavras que aparecem em RÓTULOS/template de RG/CNH (trilíngue), nunca em nomes de
# pessoas. Uma linha que contenha qualquer uma delas é rótulo, não o valor do nome.
_ROTULOS = {
    "SOBRENOME", "NAME", "SURNAME", "NOMBRE", "APELLIDOS", "FILIACAO", "FILIACION",
    "HABILITACAO", "LICENSE", "LICENCIA", "LICENCA", "CONDUCIR", "CONDUCII", "DRIVER",
    "IDENTIDADE", "IDENTITY", "REGISTRO", "VALIDADE", "VALIDITY", "NASCIMENTO", "BIRTH",
    "NACIMIENTO", "EXPEDICAO", "CATEGORIA", "PERMISSAO", "ORGAO", "EMISSOR", "PRIMEIRA",
    "PRIMERA", "FIRST", "ASSINATURA", "SIGNATURE", "PORTADOR", "LOCAL", "MUNICIPIO",
}


def _parece_nome(trecho):
    """True/valor quando o trecho parece um nome de pessoa (letras, 2–6 palavras,
    sem palavras de rótulo)."""
    txt = re.sub(r"[^A-Za-zÀ-ÿ ]", " ", trecho or "")
    txt = re.sub(r"\s+", " ", txt).strip()
    palavras = [w for w in txt.split() if len(w) >= 2]
    if not (2 <= len(palavras) <= 6):
        return ""
    if any(w.upper() in _ROTULOS for w in palavras):
        return ""
    nome = " ".join(palavras)
    if not (6 <= len(nome) <= 60):
        return ""
    return nome.upper()


def _pega_nome(linhas, rotulos):
    """Acha o VALOR do nome: localiza o rótulo e pega a 1ª linha seguinte que pareça
    um nome de pessoa, PULANDO as linhas de rótulo/template do documento."""
    for i, ln in enumerate(linhas):
        up = ln.upper()
        achou = [rot for rot in rotulos if rot in up]
        if not achou:
            continue
        # 1) texto depois do rótulo, na mesma linha
        pos = max(up.find(rot) + len(rot) for rot in achou)
        cand = _parece_nome(ln[pos:])
        if cand:
            return cand
        # 2) varre as próximas linhas até achar algo que pareça nome
        for j in range(i + 1, min(i + 5, len(linhas))):
            cand = _parece_nome(linhas[j])
            if cand:
                return cand
    return ""


def _nome_mrz(texto):
    """Extrai o nome do titular da MRZ (rodapé da CNH-e / passaporte): a linha do nome
    tem só letras A-Z e '<' (sem dígitos). Ex.: 'JORGE<<EDUARDO<DA<SILVA<ALVIM<' →
    'JORGE EDUARDO DA SILVA ALVIM'. Fonte muito mais confiável que os rótulos visuais."""
    for ln in texto.splitlines():
        s = ln.strip().replace(" ", "")
        if len(s) >= 12 and "<" in s and re.fullmatch(r"[A-Z<]+", s):
            nome = re.sub(r"<+", " ", s).strip()
            nome = re.sub(r"\s+", " ", nome)
            if len(nome.split()) >= 2 and len(nome) >= 6:
                return nome.upper()
    return ""


def _pega_filiacao_mae(linhas):
    """Sob 'FILIAÇÃO' costuma vir pai e depois mãe. Coleta os nomes-de-pessoa após o
    rótulo e devolve o 2º (mãe); se só houver um, devolve esse."""
    encontrados = []
    achou = False
    for ln in linhas:
        if not achou:
            if "FILIA" in ln.upper():
                achou = True
            continue
        cand = _parece_nome(ln)
        if cand:
            encontrados.append(cand)
        if len(encontrados) >= 2:
            break
    if len(encontrados) >= 2:
        return encontrados[1]
    return encontrados[0] if encontrados else ""


def extrair_campos(texto):
    linhas = [l.strip() for l in texto.splitlines() if l.strip()]
    campos = {"nome": "", "cpf": "", "rg": "", "data_nascimento": "", "nome_mae": ""}

    # CPF (valida dígitos verificadores; pega o primeiro válido)
    for m in CPF_RE.finditer(texto):
        cand = "".join(m.groups())
        if _valida_cpf(cand):
            campos["cpf"] = _fmt_cpf(cand)
            break

    # Data de nascimento (a primeira data plausível dd/mm/aaaa)
    for m in DATA_RE.finditer(texto):
        d, mth, y = m.groups()
        if 1 <= int(d) <= 31 and 1 <= int(mth) <= 12 and 1900 <= int(y) <= 2100:
            campos["data_nascimento"] = f"{d}/{mth}/{y}"
            break

    # RG
    mrg = RG_RE.search(texto)
    if mrg:
        campos["rg"] = mrg.group(1)

    # Nome do titular: a MRZ (zona de leitura mecânica no rodapé da CNH) é a fonte mais
    # confiável; se não houver, cai na heurística por rótulo.
    campos["nome"] = _nome_mrz(texto) or _pega_nome(linhas, ["NOME"])
    # Filiação: a mãe costuma ser o 2º nome sob "FILIAÇÃO" (o 1º é o pai).
    campos["nome_mae"] = _pega_filiacao_mae(linhas)

    return campos


def detecta_tipo(texto, forcado):
    if forcado in ("rg", "cnh"):
        return forcado
    up = texto.upper()
    if any(k in up for k in ["CARTEIRA NACIONAL", "HABILITACAO", "HABILITAÇÃO", "CNH", "DETRAN"]):
        return "cnh"
    if any(k in up for k in ["REGISTRO GERAL", "IDENTIDADE", "SSP", "SECRETARIA"]):
        return "rg"
    return "desconhecido"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--type", default="auto", choices=["rg", "cnh", "auto"])
    ap.add_argument("--debug", action="store_true", help="inclui o texto bruto do OCR na saída (calibração)")
    args = ap.parse_args()

    pytesseract, Image, ImageOps, ImageFilter = _load_deps()

    # Pré-processa uma imagem (tons de cinza, autocontraste, nitidez) e roda o Tesseract.
    def ocr_image(im):
        try:
            p = ImageOps.grayscale(im)
            p = ImageOps.autocontrast(p)
            p = p.filter(ImageFilter.SHARPEN)
        except Exception:
            p = im
        try:
            return pytesseract.image_to_string(p, lang="por")
        except Exception:
            # fallback sem o pacote de idioma português instalado
            try:
                return pytesseract.image_to_string(p)
            except Exception as e:
                _fail("Falha ao executar o Tesseract: " + str(e), "FALHA_TESSERACT")

    # Detecta PDF (assinatura %PDF ou extensão). Muita gente escaneia RG/CNH em PDF.
    is_pdf = args.file.lower().endswith(".pdf")
    if not is_pdf:
        try:
            with open(args.file, "rb") as fh:
                is_pdf = fh.read(5).startswith(b"%PDF-")
        except Exception:
            pass

    textos = []
    if is_pdf:
        try:
            import pymupdf as fitz  # nome novo (evita o aviso de deprecação do 'import fitz')
        except Exception:
            try:
                import fitz  # PyMuPDF (compat. versões antigas)
            except Exception as e:
                _fail("Para ler PDF, instale o PyMuPDF no servidor (pip install pymupdf) — "
                      "ou envie uma FOTO (JPG/PNG) do documento. Detalhe: " + str(e), "SEM_PDF")
        # Silencia avisos/erros do MuPDF para não poluir o stdout (que carrega só o JSON).
        try:
            fitz.TOOLS.mupdf_display_errors(False)
        except Exception:
            pass
        try:
            doc = fitz.open(args.file)
        except Exception as e:
            _fail("Nao foi possivel abrir o PDF: " + str(e), "PDF_INVALIDO")
        # RG/CNH costumam ter 1-2 lados; lê no máximo 3 páginas para não estourar o tempo.
        for i in range(min(doc.page_count, 3)):
            pix = doc[i].get_pixmap(matrix=fitz.Matrix(300 / 72, 300 / 72))  # ~300 DPI
            textos.append(ocr_image(Image.frombytes("RGB", (pix.width, pix.height), pix.samples)))
        doc.close()
    else:
        try:
            img = Image.open(args.file)
        except Exception as e:
            _fail("Nao foi possivel abrir a imagem: " + str(e), "IMAGEM_INVALIDA")
        textos.append(ocr_image(img))

    texto = "\n".join(textos)

    campos = extrair_campos(texto)
    tipo = detecta_tipo(texto, args.type)
    preenchidos = sum(1 for v in campos.values() if v)
    confianca = round(preenchidos / len(campos), 2)

    saida = {
        "ok": True,
        "tipo": tipo,
        "campos": campos,
        "confianca": confianca,
    }
    if args.debug:
        saida["raw_text"] = texto  # apenas para calibração local; NUNCA usado pela rota web
    print(json.dumps(saida, ensure_ascii=False))


if __name__ == "__main__":
    main()
