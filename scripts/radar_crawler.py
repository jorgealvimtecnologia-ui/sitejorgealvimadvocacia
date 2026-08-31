#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
🤖 JORGE ALVIM ADVOCACIA & TECNOLOGIA - MOTOR RADAR JUDICIAL (PYTHON)
   Módulo de Consulta Unificada e Raspagem de Processos nos Tribunais
   DataJud CNJ • ComunicaAPI DJEN • PJe • SQLite Local
=============================================================================
"""

import sys
import os
import json
import re
import argparse
import sqlite3
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime

# Constantes e Endpoints dos Tribunais (DataJud CNJ)
DATAJUD_API_KEY = os.environ.get("DATAJUD_API_KEY", "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==")

DATAJUD_TRIBUNALS = {
    "tjmg": {"name": "Tribunal de Justiça de Minas Gerais", "segment": "Estadual", "endpoint": "api_publica_tjmg"},
    "trf6": {"name": "Tribunal Regional Federal 6ª Região (MG)", "segment": "Federal", "endpoint": "api_publica_trf6"},
    "trf1": {"name": "Tribunal Regional Federal 1ª Região", "segment": "Federal", "endpoint": "api_publica_trf1"},
    "trt3": {"name": "Tribunal Regional do Trabalho 3ª Região (MG)", "segment": "Trabalhista", "endpoint": "api_publica_trt3"},
    "tjsp": {"name": "Tribunal de Justiça de São Paulo", "segment": "Estadual", "endpoint": "api_publica_tjsp"},
    "stj": {"name": "Superior Tribunal de Justiça", "segment": "Superior", "endpoint": "api_publica_stj"},
    "stf": {"name": "Supremo Tribunal Federal", "segment": "Constitucional", "endpoint": "api_publica_stf"},
    "tst": {"name": "Tribunal Superior do Trabalho", "segment": "Superior", "endpoint": "api_publica_tst"}
}

def clean_digits(val: str) -> str:
    """Remove caracteres não-numéricos."""
    if not val:
        return ""
    return re.sub(r"\D", "", str(val))

def format_npu(raw_npu: str) -> str:
    """Formata o número CNJ de 20 dígitos para NNNNNNN-DD.AAAA.J.TR.OOOO."""
    digits = clean_digits(raw_npu)
    if len(digits) == 20:
        return f"{digits[0:7]}-{digits[7:9]}.{digits[9:13]}.{digits[13:14]}.{digits[14:16]}.{digits[16:20]}"
    return raw_npu

def detect_tribunal_from_npu(digits: str) -> str:
    """Identifica o tribunal de origem a partir da máscara CNJ (J.TR)."""
    if len(digits) >= 16:
        ramo = digits[13]
        trib = digits[14:16]
        if ramo == "8" and trib == "13":
            return "tjmg"
        if ramo == "4" and trib == "06":
            return "trf6"
        if ramo == "4" and trib == "01":
            return "trf1"
        if ramo == "5" and trib == "03":
            return "trt3"
        if ramo == "8" and trib == "26":
            return "tjsp"
        if ramo == "3" and trib == "00":
            return "stj"
        if ramo == "1" and trib == "00":
            return "stf"
        if ramo == "5" and trib == "00":
            return "tst"
    return None

def http_post_json(url: str, headers: dict, payload: dict, timeout: int = 8) -> dict:
    """Executa requisição HTTP POST enviando JSON com timeout."""
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status in (200, 201):
                raw = response.read().decode("utf-8")
                return json.loads(raw)
    except Exception:
        pass
    return None

def http_get_json(url: str, headers: dict, timeout: int = 8) -> dict:
    """Executa requisição HTTP GET retornando JSON com timeout."""
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status in (200, 201):
                raw = response.read().decode("utf-8")
                return json.loads(raw)
    except Exception:
        pass
    return None

def search_datajud_by_number(npu_digits: str, tribunal_code: str = None) -> list:
    """Consulta o DataJud (CNJ) pelo número exato do processo."""
    results = []
    targets = []

    if tribunal_code and tribunal_code != "all" and tribunal_code in DATAJUD_TRIBUNALS:
        targets = [tribunal_code]
    else:
        detected = detect_tribunal_from_npu(npu_digits)
        targets = [detected] if detected else ["tjmg", "trf6", "trt3", "tjsp", "stj", "trf1"]

    es_query = {
        "size": 10,
        "query": {
            "match": {
                "numeroProcesso": npu_digits
            }
        }
    }

    headers = {
        "Authorization": DATAJUD_API_KEY,
        "Content-Type": "application/json",
        "User-Agent": "JorgeAlvimAdvocacia-PythonRadar/2.0"
    }

    for trib in targets:
        trib_info = DATAJUD_TRIBUNALS.get(trib)
        if not trib_info:
            continue
        url = f"https://api-publica.datajud.cnj.jus.br/{trib_info['endpoint']}/_search"
        data = http_post_json(url, headers, es_query)
        if data and "hits" in data and "hits" in data["hits"]:
            for hit in data["hits"]["hits"]:
                normalized = normalize_datajud_hit(hit, trib)
                if normalized:
                    results.append(normalized)

    return results

def normalize_datajud_hit(hit: dict, trib_code: str) -> dict:
    """Normaliza o formato bruto do DataJud para a estrutura padrão do painel."""
    src = hit.get("_source", hit)
    raw_num = src.get("numeroProcesso", "")
    trib_info = DATAJUD_TRIBUNALS.get(trib_code, {"name": trib_code.upper(), "segment": "Estadual"})

    movements = []
    for mov in sorted(src.get("movimentos", []), key=lambda m: m.get("dataHora", ""), reverse=True):
        m_name = mov.get("nome", mov.get("tipo", "Movimentação Processual"))
        m_date = mov.get("dataHora", "")[:10]
        m_compl = ""
        for c in mov.get("complementosTabelados", []) or mov.get("complementos", []):
            if isinstance(c, dict):
                m_compl += f"{c.get('nome', '')}: {c.get('descricao', '')} "
            elif isinstance(c, str):
                m_compl += c + " "
        
        movements.append({
            "date": m_date,
            "title": m_name,
            "description": m_compl.strip() or m_name
        })

    class_name = src.get("classe", {}).get("nome", "Ação Judicial")
    orgao_name = src.get("orgaoJulgador", {}).get("nome", "Vara Cível / Órgão Julgador")
    assuntos = src.get("assuntos", [])
    assunto_name = assuntos[0].get("nome", "Direito Processual") if assuntos else "Direito Civil / Processual"
    data_ajuizamento = src.get("dataAjuizamento", "")
    if len(data_ajuizamento) >= 8:
        dist_date = f"{data_ajuizamento[:4]}-{data_ajuizamento[4:6]}-{data_ajuizamento[6:8]}"
    else:
        dist_date = "—"

    return {
        "id": f"PROC-DJ-{raw_num}-{trib_code}",
        "numero_processo": raw_num,
        "numero_formatado": format_npu(raw_num),
        "tribunal_code": trib_code.upper(),
        "tribunal_name": trib_info["name"],
        "segment": trib_info["segment"],
        "orgao_julgador": orgao_name,
        "class_name": class_name,
        "subject": assunto_name,
        "distribution_date": dist_date,
        "value": 0,
        "formatted_value": "—",
        "status": "Em Tramitação",
        "polo_ativo": [{"name": "Polo Ativo (Conforme Autos)", "document": "", "role": "Autor / Requerente"}],
        "polo_passivo": [{"name": "Polo Passivo (Conforme Autos)", "document": "", "role": "Réu / Requerido"}],
        "advogados": [{"name": "Advogados Registrados nos Autos", "oab": ""}],
        "movements": movements[:20],
        "source": "DataJud CNJ"
    }

def search_comunicaapi_by_endpoint(params: dict) -> list:
    """Realiza requisição para a ComunicaAPI / DJEN com parâmetros específicos."""
    query_str = urllib.parse.urlencode(params)
    url = f"https://comunicaapi.pje.jus.br/api/v1/comunicacao?{query_str}"
    headers = {"Accept": "application/json", "User-Agent": "JorgeAlvimAdvocacia-PythonRadar/2.0"}
    data = http_get_json(url, headers)
    if data and "items" in data and isinstance(data["items"], list):
        return data["items"]
    return []

def search_comunicaapi(query_type: str, query_term: str, tribunal: str = "all") -> list:
    """Consulta a ComunicaAPI / Diário da Justiça Nacional (DJEN)."""
    raw_items = []
    clean_term = query_term.strip()
    digits = clean_digits(clean_term)

    # 1. Busca por Número de Processo
    if query_type == "number" and digits:
        raw_items.extend(search_comunicaapi_by_endpoint({"numeroProcesso": digits, "pagina": 1, "itensPorPagina": 15}))
        if not raw_items:
            raw_items.extend(search_comunicaapi_by_endpoint({"numeroProcesso": format_npu(digits), "pagina": 1, "itensPorPagina": 15}))

    # 2. Busca por OAB
    elif query_type == "oab" and digits:
        raw_items.extend(search_comunicaapi_by_endpoint({"numeroOab": digits, "ufOab": "MG", "pagina": 1, "itensPorPagina": 25}))
        if not raw_items:
            raw_items.extend(search_comunicaapi_by_endpoint({"numeroOab": digits, "pagina": 1, "itensPorPagina": 25}))

    # 3. Busca por Nome
    elif query_type == "name" and clean_term:
        # Tenta buscar por Nome de Advogado E por Nome da Parte
        adv_items = search_comunicaapi_by_endpoint({"nomeAdvogado": clean_term, "pagina": 1, "itensPorPagina": 20})
        raw_items.extend(adv_items)
        
        parte_items = search_comunicaapi_by_endpoint({"nomeParte": clean_term, "pagina": 1, "itensPorPagina": 20})
        raw_items.extend(parte_items)

    # 4. Busca por CPF / CNPJ
    elif query_type in ("cpf", "cnpj") and digits:
        parte_items = search_comunicaapi_by_endpoint({"nomeParte": clean_term, "pagina": 1, "itensPorPagina": 15})
        raw_items.extend(parte_items)

    # Agrupar itens por número de processo para construir o processo completo
    grouped = {}
    for item in raw_items:
        num = item.get("numeroprocessocommascara") or item.get("numero_processo") or item.get("numeroProcesso")
        if not num:
            continue
        num_clean = clean_digits(num)
        if num_clean not in grouped:
            grouped[num_clean] = []
        grouped[num_clean].append(item)

    results = []
    for num_clean, items in grouped.items():
        first = items[0]
        num_fmt = first.get("numeroprocessocommascara") or format_npu(num_clean)
        trib = first.get("siglaTribunal") or first.get("sigla_tribunal") or "TJMG"
        orgao = first.get("nomeOrgao") or first.get("nome_orgao") or "Vara / Órgão Julgador"
        classe = first.get("nomeClasse") or first.get("nome_classe") or "Procedimento Judicial"
        link_doc = first.get("link", "")

        # Extrair Polos da Ação (Autores e Réus Reais)
        polo_ativo = []
        polo_passivo = []
        for it in items:
            for dest in it.get("destinatarios", []):
                p_nome = dest.get("nome", "")
                p_polo = str(dest.get("polo", "")).upper()
                if p_nome:
                    entry = {"name": p_nome, "document": ""}
                    if p_polo in ("A", "AT", "AUTOR", "ATIVO", "REQUERENTE"):
                        if not any(a["name"] == p_nome for a in polo_ativo):
                            entry["role"] = "Autor / Requerente"
                            polo_ativo.append(entry)
                    else:
                        if not any(p["name"] == p_nome for p in polo_passivo):
                            entry["role"] = "Réu / Requerido"
                            polo_passivo.append(entry)

        # Extrair Advogados
        advogados = []
        for it in items:
            for da in it.get("destinatarioadvogados", []):
                adv_info = da.get("advogado", {})
                a_name = adv_info.get("nome", "")
                a_oab = f"OAB/{adv_info.get('uf_oab', 'MG')} {adv_info.get('numero_oab', '')}"
                if a_name and not any(a["name"] == a_name for a in advogados):
                    advogados.append({"name": a_name, "oab": a_oab})

        # Se não extraiu advogados dos arrays, tentar do texto
        if not advogados:
            adv_txt = first.get("advogado_nome") or first.get("nomeAdvogado")
            if adv_txt:
                advogados.append({"name": adv_txt, "oab": f"OAB/MG {first.get('advogado_oab', '')}"})

        # Movimentações baseadas nas publicações oficiais
        movs = []
        for it in items:
            data_pub = it.get("data_disponibilizacao") or it.get("datadisponibilizacao") or it.get("dataDisponibilizacao", "")
            tipo_com = it.get("tipoComunicacao") or it.get("tipo_comunicacao") or "Intimação"
            tipo_doc = it.get("tipoDocumento") or "Publicação no DJe"
            texto_raw = it.get("texto", "")
            texto_clean = re.sub(r"<[^>]+>", " ", texto_raw).strip()
            texto_clean = re.sub(r"\s+", " ", texto_clean)
            
            movs.append({
                "date": data_pub[:10],
                "title": f"DJe: {tipo_com} ({tipo_doc})",
                "description": texto_clean[:300] + ("..." if len(texto_clean) > 300 else ""),
                "link": it.get("link")
            })

        results.append({
            "id": f"PROC-DJEN-{num_clean}",
            "numero_processo": num_clean,
            "numero_formatado": num_fmt,
            "tribunal_code": trib.upper(),
            "tribunal_name": f"Tribunal de Justiça / Superior ({trib.upper()})",
            "segment": "Estadual / Trabalhista / Federal",
            "orgao_julgador": orgao,
            "class_name": classe,
            "subject": "Publicações Oficiais e Despachos",
            "distribution_date": items[-1].get("data_disponibilizacao", "2026-01-01")[:10],
            "value": 0,
            "formatted_value": "—",
            "status": "Em Tramitação",
            "direct_portal_url": link_doc or f"https://pje.{trib.lower()}.jus.br/",
            "polo_ativo": polo_ativo or [{"name": "Polo Ativo (Conforme DJe)", "document": "", "role": "Autor"}],
            "polo_passivo": polo_passivo or [{"name": "Polo Passivo (Conforme DJe)", "document": "", "role": "Réu"}],
            "advogados": advogados or [{"name": "Advogados Registrados no DJe", "oab": ""}],
            "movements": movs,
            "source": "DJEN / ComunicaAPI"
        })

    return results

def search_local_sqlite(query_type: str, query_term: str) -> list:
    """Busca processos reais cadastrados no banco leads.db do escritório."""
    results = []
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "leads.db")
    if not os.path.exists(db_path):
        db_path = "leads.db"

    if not os.path.exists(db_path):
        return results

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        clean_term = query_term.strip()
        digits = clean_digits(clean_term)

        if query_type == "number" and digits:
            cur.execute("SELECT * FROM lawsuits WHERE cnj_number LIKE ? OR lawsuit_number LIKE ?", (f"%{clean_term}%", f"%{digits}%"))
        elif query_type == "oab":
            cur.execute("SELECT * FROM lawsuits ORDER BY created_at DESC")
        else:
            cur.execute("""
                SELECT l.* FROM lawsuits l
                LEFT JOIN clients c ON l.client_id = c.id
                WHERE c.full_name LIKE ? OR c.cpf LIKE ? OR c.cnpj LIKE ? 
                   OR l.cnj_number LIKE ? OR l.action_type LIKE ? OR l.subject LIKE ? OR l.court_branch LIKE ?
            """, (f"%{clean_term}%", f"%{clean_term}%", f"%{clean_term}%", f"%{clean_term}%", f"%{clean_term}%", f"%{clean_term}%", f"%{clean_term}%"))
        
        rows = cur.fetchall()
        for r in rows:
            client_name = "Cliente do Escritório"
            client_doc = ""
            if r["client_id"]:
                c_row = cur.execute("SELECT full_name, cpf, cnpj FROM clients WHERE id = ?", (r["client_id"],)).fetchone()
                if c_row:
                    client_name = c_row["full_name"]
                    client_doc = c_row["cpf"] or c_row["cnpj"] or ""

            movs = []
            try:
                m_rows = cur.execute("SELECT movement_date, title, description FROM lawsuit_movements WHERE lawsuit_id = ? ORDER BY movement_date DESC LIMIT 10", (r["id"],)).fetchall()
                for mr in m_rows:
                    movs.append({
                        "date": mr["movement_date"][:10] if mr["movement_date"] else "",
                        "title": mr["title"],
                        "description": mr["description"]
                    })
            except Exception:
                pass

            if not movs:
                movs = [{
                    "date": r["distribution_date"] or "2026-08-01",
                    "title": "Distribuição da Ação",
                    "description": f"Processo distribuído para {r['court_branch']}."
                }]

            results.append({
                "id": f"PROC-LOCAL-{r['id']}",
                "numero_processo": clean_digits(r["cnj_number"]),
                "numero_formatado": r["cnj_number"],
                "tribunal_code": r["tribunal"] or "TJMG",
                "tribunal_name": f"Tribunal ({r['tribunal'] or 'TJMG'})",
                "segment": "Estadual / Federal",
                "orgao_julgador": r["court_branch"] or "Vara Cível",
                "class_name": r["action_type"] or "Ação Judicial",
                "subject": r["subject"] or "Direito Civil",
                "distribution_date": r["distribution_date"] or "2026-08-01",
                "value": r["claim_value"] or 0,
                "formatted_value": f"R$ {float(r['claim_value']):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") if r["claim_value"] else "—",
                "status": r["status"] or "Em Tramitação",
                "polo_ativo": [{"name": client_name, "document": client_doc, "role": "Autor"}],
                "polo_passivo": [{"name": "Parte Requerida", "document": "", "role": "Réu"}],
                "advogados": [{"name": "Dr. Jorge Alvim", "oab": "OAB/MG 222.943"}],
                "movements": movs,
                "source": "Base do Escritório"
            })

        conn.close()
    except Exception:
        pass

    return results

def main():
    parser = argparse.ArgumentParser(description="Radar Judicial - Motor Python de Consulta a Tribunais")
    parser.add_argument("--type", default="number", choices=["number", "name", "cpf", "cnpj", "oab"], help="Tipo de consulta")
    parser.add_argument("--term", required=True, help="Termo de pesquisa (NPU, Nome, CPF, CNPJ, OAB)")
    parser.add_argument("--tribunal", default="all", help="Código do tribunal (tjmg, trt3, trf6, etc.)")
    parser.add_argument("--uf", default="MG", help="UF da OAB")

    args = parser.parse_args()

    query_type = args.type
    query_term = args.term.strip()
    tribunal = args.tribunal.lower()

    aggregated = []
    digits = clean_digits(query_term)

    # 1. Se for busca por número CNJ:
    if query_type == "number" and len(digits) >= 8:
        # A. Consulta DataJud CNJ (Movimentações e Vara)
        dj_results = search_datajud_by_number(digits, tribunal)
        
        # B. Consulta ComunicaAPI (Partes, Advogados e Publicações)
        com_results = search_comunicaapi("number", digits, tribunal)
        
        # C. Consulta Base Local
        loc_results = search_local_sqlite("number", digits)

        # Se encontrou no DataJud e na ComunicaAPI, fundir os dados
        if dj_results and com_results:
            merged = dj_results[0]
            c_item = com_results[0]
            if c_item.get("polo_ativo") and c_item["polo_ativo"][0]["name"] != "Polo Ativo (Conforme DJe)":
                merged["polo_ativo"] = c_item["polo_ativo"]
            if c_item.get("polo_passivo") and c_item["polo_passivo"][0]["name"] != "Polo Passivo (Conforme DJe)":
                merged["polo_passivo"] = c_item["polo_passivo"]
            if c_item.get("advogados") and c_item["advogados"][0]["name"] != "Advogados Registrados no DJe":
                merged["advogados"] = c_item["advogados"]
            if c_item.get("movements"):
                # Intercalar publicações com movimentações
                merged["movements"] = (c_item["movements"] + merged["movements"])[:25]
            if c_item.get("direct_portal_url"):
                merged["direct_portal_url"] = c_item["direct_portal_url"]
            aggregated.append(merged)
        elif dj_results:
            aggregated.extend(dj_results)
        elif com_results:
            aggregated.extend(com_results)
        elif loc_results:
            aggregated.extend(loc_results)

    # 2. Se for busca por OAB:
    elif query_type == "oab":
        com_results = search_comunicaapi("oab", digits or "222943", tribunal)
        aggregated.extend(com_results)
        loc_results = search_local_sqlite("oab", query_term)
        aggregated.extend(loc_results)

    # 3. Se for busca por Nome:
    elif query_type == "name":
        com_results = search_comunicaapi("name", query_term, tribunal)
        aggregated.extend(com_results)
        loc_results = search_local_sqlite("name", query_term)
        aggregated.extend(loc_results)

    # 4. Se for busca por CPF / CNPJ:
    else:
        com_results = search_comunicaapi("cpf", query_term, tribunal)
        aggregated.extend(com_results)
        loc_results = search_local_sqlite("cpf", query_term)
        aggregated.extend(loc_results)

    # Deduplicar por número de processo
    seen_numbers = set()
    deduped = []
    for proc in aggregated:
        num = proc.get("numero_processo")
        if num and num not in seen_numbers:
            seen_numbers.add(num)
            deduped.append(proc)
        elif not num:
            deduped.append(proc)

    output = {
        "success": True,
        "engine": "Python 3 Radar Crawler (DataJud • DJEN • SQLite)",
        "query_type": query_type,
        "query_term": query_term,
        "tribunal": tribunal,
        "total": len(deduped),
        "processes": deduped
    }

    print(json.dumps(output, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
