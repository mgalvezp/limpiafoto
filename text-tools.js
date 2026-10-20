(() => {
  const $ = (s) => document.querySelector(s);
  const tabs = [...document.querySelectorAll('.toolTab')];
  const photoTool = $('#photoTool');
  const textTool = $('#textTool');
  const input = $('#humanInput');
  const output = $('#humanOutput');
  const humanizeBtn = $('#humanizeText');
  const copyBtn = $('#copyHumanized');
  const clearBtn = $('#clearText');
  const inputCount = $('#inputCount');
  const outputCount = $('#outputCount');
  const status = $('#humanStatus');
  const report = $('#humanReport');
  const stats = $('#humanStats');
  const changeList = $('#changeList');
  const changeBadge = $('#changeBadge');

  const options = {
    hidden: $('#optHidden'), spaces: $('#optSpaces'), dashes: $('#optDashes'),
    quotes: $('#optQuotes'), whitespace: $('#optWhitespace'), entities: $('#optEntities'),
    symbols: $('#optSymbols'), paragraphs: $('#optParagraphs')
  };

  const labels = {
    hidden: 'Unicode oculto', spaces: 'Espacios especiales', dashes: 'Guiones tipográficos',
    quotes: 'Comillas tipográficas', whitespace: 'Espaciado sobrante', entities: 'Entidades HTML',
    symbols: 'Símbolos frecuentes', paragraphs: 'Saltos de línea excesivos'
  };

  function countLabel(n){ return `${n.toLocaleString('es-CL')} ${n === 1 ? 'carácter' : 'caracteres'}`; }
  function updateCounts(){
    inputCount.textContent = countLabel(input.value.length);
    outputCount.textContent = countLabel(output.value.length);
    humanizeBtn.disabled = !input.value.length;
  }

  function countMatches(text, regex){
    const m = text.match(regex); return m ? m.length : 0;
  }

  function decodeEntities(text){
    let count = 0;
    const named = { nbsp:' ', amp:'&', quot:'"', apos:"'", lt:'<', gt:'>' };
    const out = text.replace(/&(#x?[0-9a-f]+|nbsp|amp|quot|apos|lt|gt);/gi, (full, entity) => {
      let value;
      if(entity[0] === '#'){
        const hex = entity[1]?.toLowerCase() === 'x';
        const raw = entity.slice(hex ? 2 : 1);
        const code = parseInt(raw, hex ? 16 : 10);
        if(!Number.isFinite(code) || code < 0 || code > 0x10FFFF) return full;
        try { value = String.fromCodePoint(code); } catch { return full; }
      } else value = named[entity.toLowerCase()];
      if(value === undefined || value === full) return full;
      count++;
      return value;
    });
    return {text:out,count};
  }

  function applyRule(text, key, replacer, regexForCount){
    const count = countMatches(text, regexForCount);
    if(!count) return {text,count:0};
    return {text:text.replace(regexForCount, replacer),count};
  }

  function humanize(source){
    let text = source;
    const changes = {};

    if(options.entities.checked){
      const r = decodeEntities(text); text = r.text; changes.entities = r.count;
    }
    if(options.hidden.checked){
      const re = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0]/g;
      const r = applyRule(text,'hidden','',re); text=r.text; changes.hidden=r.count;
    }
    if(options.spaces.checked){
      const re = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
      const r = applyRule(text,'spaces',' ',re); text=r.text; changes.spaces=r.count;
    }
    if(options.dashes.checked){
      let c = 0;
      text = text.replace(/[\u2014\u2015]/g, () => { c++; return ' - '; });
      text = text.replace(/[\u2010\u2011\u2012\u2013\u2212]/g, () => { c++; return '-'; });
      changes.dashes = c;
    }
    if(options.quotes.checked){
      let c = 0;
      text = text.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, () => { c++; return '"'; });
      text = text.replace(/[\u2018\u2019\u201A\u201B\u2032]/g, () => { c++; return "'"; });
      changes.quotes = c;
    }
    if(options.symbols.checked){
      let c = 0;
      text = text.replace(/\u2026/g, () => { c++; return '...'; });
      text = text.replace(/\u00B7/g, () => { c++; return '·'; });
      changes.symbols = c;
    }
    if(options.whitespace.checked){
      let c = 0;
      text = text.split('\n').map(line => {
        const trailing = line.match(/[ \t]+$/); if(trailing) c += trailing[0].length;
        let clean = line.replace(/[ \t]+$/g,'');
        clean = clean.replace(/[ \t]{2,}/g, m => { c += Math.max(1,m.length-1); return ' '; });
        return clean;
      }).join('\n');
      text = text.replace(/ +([,.;:!?])/g, (m,p) => { c++; return p; });
      text = text.replace(/([,.;:!?])([^\s\n"'\)\]])/g, (m,p,n) => { c++; return `${p} ${n}`; });
      text = text.replace(/ ?- ?/g, m => {
        if(m === ' - ') return m;
        if(m.includes(' ')){ c++; return ' - '; }
        return m;
      });
      changes.whitespace = c;
    }
    if(options.paragraphs.checked){
      let c=0;
      text = text.replace(/\n{3,}/g, m => { c += m.length-2; return '\n\n'; });
      changes.paragraphs = c;
    }

    return {text,changes};
  }

  function renderReport(source, result, changes){
    const rows = Object.entries(changes).filter(([,n]) => n > 0);
    const total = rows.reduce((s,[,n]) => s+n,0);
    const active = Object.values(options).filter(x => x.checked).length;
    changeBadge.textContent = `${total} ${total===1?'cambio':'cambios'}`;
    stats.innerHTML = [
      [total,'transformaciones'],
      [active,'ajustes activos'],
      [Math.abs(source.length-result.length),'caracteres de diferencia']
    ].map(([v,l])=>`<div class="stat"><strong>${v}</strong><span>${l}</span></div>`).join('');
    changeList.innerHTML = rows.length
      ? rows.map(([key,n])=>`<div class="changeRow"><span>${labels[key]}</span><strong>${n}</strong></div>`).join('')
      : '<div class="emptyChanges">No se encontraron caracteres o formatos que requirieran normalización con los ajustes actuales.</div>';
    report.hidden = false;
    status.textContent = total ? `${total} cambios aplicados` : 'El texto ya estaba limpio';
    status.className = `textResultStatus ${total ? 'success' : ''}`;
  }

  tabs.forEach(tab => tab.addEventListener('click', () => {
    const tool = tab.dataset.tool;
    tabs.forEach(t => { const on=t===tab; t.classList.toggle('active',on); t.setAttribute('aria-selected',String(on)); });
    photoTool.hidden = tool !== 'photo';
    textTool.hidden = tool !== 'text';
    window.scrollTo({top:0,behavior:'smooth'});
  }));

  input.addEventListener('input', () => { updateCounts(); if(!input.value){ output.value=''; report.hidden=true; copyBtn.disabled=true; status.textContent='Sin procesar'; updateCounts(); } });
  humanizeBtn.addEventListener('click', () => {
    const source=input.value;
    const r=humanize(source);
    output.value=r.text;
    copyBtn.disabled=!r.text.length;
    updateCounts();
    renderReport(source,r.text,r.changes);
  });
  clearBtn.addEventListener('click', () => { input.value=''; output.value=''; report.hidden=true; copyBtn.disabled=true; status.textContent='Sin procesar'; updateCounts(); input.focus(); });
  copyBtn.addEventListener('click', async () => {
    if(!output.value) return;
    try{
      await navigator.clipboard.writeText(output.value);
      copyBtn.textContent='Copiado ✓';
      setTimeout(()=>copyBtn.textContent='Copiar resultado',1400);
    }catch(_){
      output.removeAttribute('readonly'); output.select(); document.execCommand('copy'); output.setAttribute('readonly','');
      copyBtn.textContent='Copiado ✓'; setTimeout(()=>copyBtn.textContent='Copiar resultado',1400);
    }
  });

  updateCounts();
})();
