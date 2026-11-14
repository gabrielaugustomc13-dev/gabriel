const LifecycleCore = (() => {
  const types = {
    plans: {label: 'Planos', singular: 'Plano', statuses: ['Ativo', 'Pausado', 'Encerrado']},
    classes: {label: 'Aulas e presença', singular: 'Aula', statuses: ['Agendada', 'Presente', 'Ausente', 'Cancelada']},
    payments: {label: 'Pagamentos', singular: 'Cobrança', statuses: ['Pendente', 'Pago', 'Cancelado']},
    notes: {label: 'Interações', singular: 'Interação', statuses: []}
  };
  function validate(state) {
    if (state.lifecycle === undefined) return;
    if (!state.lifecycle || typeof state.lifecycle !== 'object' || Array.isArray(state.lifecycle)) throw Error('Histórico inválido.');
    const clients = new Set(state.clients.map(client => client.id));
    for (const [key, rows] of Object.entries(state.lifecycle)) {
      if (!Object.hasOwn(types, key) || !Array.isArray(rows) || rows.length > 5000) throw Error('Histórico inválido.');
      const ids = new Set();
      for (const row of rows) {
        if (!row || typeof row.id !== 'string' || !/^[\w-]{1,120}$/.test(row.id) || ids.has(row.id) || !clients.has(row.clientId)) throw Error('Escolha um cliente válido para o histórico.');
        ids.add(row.id);
        if (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 150 || typeof row.notes !== 'string' || row.notes.length > 2000 || !dateValid(row.date)) throw Error('Revise os dados do histórico.');
        if (types[key].statuses.length && !types[key].statuses.includes(row.status)) throw Error('Status inválido.');
        if (row.endDate && (key !== 'plans' || !dateValid(row.endDate) || row.endDate < row.date)) throw Error('O término do plano deve ser posterior ao início.');
        if (key !== 'payments' && row.paidAt) throw Error('Data de pagamento inválida.');
        if (key === 'payments' && (!Number.isSafeInteger(row.cents) || row.cents <= 0 || row.cents > 10000000000 || (row.status === 'Pago' && !dateValid(row.paidAt)) || (row.status !== 'Pago' && row.paidAt))) throw Error('Revise o valor e a data do pagamento.');
      }
    }
  }
  function dateValid(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  return {types, validate};
})();
