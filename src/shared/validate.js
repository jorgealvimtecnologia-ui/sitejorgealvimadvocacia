/**
 * Validação de entrada centralizada — sem dependências externas.
 * Uso como middleware:  app.post('/rota', validateBody({ nome:{required:true,trim:true,max:200} }), handler)
 * Dentro do handler, os valores saneados ficam em req.valid.
 * Ou direto:  const r = validate(obj, schema); if(!r.ok) ...
 *
 * Regras por campo: { required, trim, type:'string'|'number'|'int', min, max, enum:[], default, label }
 */
export function validate(body, schema) {
  const errors = [];
  const value = {};
  for (const [field, rules] of Object.entries(schema)) {
    let v = body ? body[field] : undefined;
    if (rules.trim && typeof v === 'string') v = v.trim();
    const empty = (v === undefined || v === null || v === '');
    if (rules.required && empty) { errors.push(`${rules.label || field} é obrigatório.`); continue; }
    if (empty) { if ('default' in rules) value[field] = rules.default; continue; }
    if (rules.type === 'number') {
      const n = Number(String(v).replace(',', '.'));
      if (Number.isNaN(n)) { errors.push(`${rules.label || field} deve ser um número.`); continue; }
      v = n;
    } else if (rules.type === 'int') {
      const n = parseInt(v, 10);
      if (Number.isNaN(n)) { errors.push(`${rules.label || field} deve ser um número inteiro.`); continue; }
      v = n;
    }
    if (typeof v === 'string') {
      if (rules.min != null && v.length < rules.min) { errors.push(`${rules.label || field} deve ter ao menos ${rules.min} caracteres.`); continue; }
      if (rules.max != null && v.length > rules.max) v = v.slice(0, rules.max);
    }
    if (rules.enum && !rules.enum.includes(v)) { errors.push(`${rules.label || field} inválido.`); continue; }
    value[field] = v;
  }
  return { ok: errors.length === 0, errors, value };
}

export function validateBody(schema) {
  return (req, res, next) => {
    const r = validate(req.body || {}, schema);
    if (!r.ok) return res.status(400).json({ error: r.errors[0], errors: r.errors });
    req.valid = r.value;
    next();
  };
}
