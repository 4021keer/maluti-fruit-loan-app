(function () {
  'use strict';
  const employeeHeaders = ['employee_number','employee_name','id_number','department','status'];
  const loanHeaders = ['loan_number','employee_number','application_date','loan_type','amount','monthly_deduction','first_deduction_month','term_months','annual_interest_rate','status','total_paid','paid_through_month','notes','cancel_month','cancel_reason'];
  const transactionHeaders = ['source','employee_number','period','amount','reference','status','accepted_at','loan_type'];
  const key = v => String(v ?? '').trim().toLowerCase();
  function parse(text) {
    text = text.replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/)[0];
    const delimiter = first.includes(';') ? ';' : ',';
    const rows = []; let row = [], cell = '', quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i+1] === '"') { cell += '"'; i++; }
        else if (c === '"') { quoted = false; closed = true; }
        else cell += c;
      } else if (c === '"' && !cell && !closed) quoted = true;
      else if (c === delimiter || c === '\n' || c === '\r') {
        row.push(cell.trim()); cell = ''; closed = false;
        if (c !== delimiter) { if (row.some(Boolean)) rows.push(row); row = []; if (c === '\r' && text[i+1] === '\n') i++; }
      } else { if (closed && !/\s/.test(c)) throw Error('Invalid text after a quoted CSV field.'); if(c === '"') throw Error('Invalid quote in CSV.'); cell += c; }
    }
    if (quoted) throw Error('Unclosed quoted CSV field.');
    row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
    if (!rows.length) throw Error('The CSV is empty.');
    const headers = rows.shift().map(key);
    if (new Set(headers).size !== headers.length || headers.some(h=>!h)) throw Error('Duplicate or empty column headings.');
    return {headers, rows};
  }
  function number(value, label, fallback) {
    if (!value && fallback !== undefined) return fallback;
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) throw Error(label + ': use numbers without currency or thousands separators.');
    const n = Number(value.replace(',', '.')); if (!Number.isFinite(n)) throw Error('Invalid '+label); return n;
  }
  function month(value, label) { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw Error(label + ': use YYYY-MM.'); return value; }
  function loanMonth(value, label, applicationDate) {
    const raw = String(value || '').trim();
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
    const names = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
    const match = raw.toLowerCase().match(/^(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?$/);
    if (!match) throw Error(label + ': use YYYY-MM or a month name such as JULY.');
    const application = date(applicationDate), appYear = Number(application.slice(0,4)), appMonth = Number(application.slice(5,7)), monthNumber = names[match[1]];
    let year = match[2] ? Number(match[2]) : appYear;
    if (!match[2] && monthNumber < appMonth) year++;
    return `${year}-${String(monthNumber).padStart(2,'0')}`;
  }
  function date(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) throw Error('Application date: use a valid YYYY-MM-DD date.'); return value; }
  function plan(text, kind, data) {
    const csv = parse(text), allowed = kind === 'employees' ? employeeHeaders : kind === 'transactions' ? transactionHeaders : loanHeaders;
    const required = kind === 'employees' ? ['employee_number','employee_name'] : kind === 'transactions' ? ['source','employee_number','period','amount'] : ['loan_number','employee_number','application_date','loan_type','amount','monthly_deduction','first_deduction_month'];
    for (const h of required) if (!csv.headers.includes(h)) throw Error('Missing column: '+h);
    for (const h of csv.headers) if (!allowed.includes(h)) throw Error('Unknown column: '+h+'. Please use the template.');
    const idField = kind === 'employees' ? 'employee_number' : kind === 'transactions' ? null : 'loan_number', counts = new Map();
    if(idField) for(const row of csv.rows) { const id=key(row[csv.headers.indexOf(idField)]); counts.set(id,(counts.get(id)||0)+1); }
    return csv.rows.map((values, i) => {
      const item = {line:i+2, status:'New', message:'Ready to add', record:null, identity:''};
      try {
        if(values.length !== csv.headers.length) throw Error('Wrong number of columns. Quote values containing commas.');
        const r = Object.fromEntries(csv.headers.map((h,j)=>[h,values[j]]));
        item.identity=idField?r[idField]:(r.source+' '+r.employee_number+' '+r.period);
        for (const h of required) if (!r[h]) throw Error('Missing '+h);
        if (idField && counts.get(key(r[idField])) > 1) throw Error('Duplicate number within this CSV; keep only one row.');
        const existing = kind==='transactions'?null:(kind==='employees'?data.employees:data.loans).find(x=>key(kind==='employees'?x.employeeNo:x.applicationNo)===key(r[idField]));
        if(existing) {item.status='Skipped'; item.message='Number already exists. Existing record is kept unchanged; use Edit to change it.'; return item;}
        if (kind === 'employees') {
          const status=key(r.status||'active'); if(!['active','inactive'].includes(status)) throw Error('Employee status must be ACTIVE or INACTIVE.');
          item.record={employeeNo:r.employee_number,employeeName:r.employee_name,idNumber:r.id_number||'',department:r.department||'',active:status==='active'};
        } else if (kind === 'transactions') {
          const source=key(r.source),sourceMap={payroll:'payroll',pastel:'pastel'};
          if(!sourceMap[source]) throw Error('Source must be Payroll or Pastel.');
          const emp=data.employees.find(x=>key(x.employeeNo)===key(r.employee_number)); if(!emp) throw Error('Employee not found. Import employees first.');
          const period=month(r.period,'Period'),amount=number(r.amount,'Amount');
          if(amount===0) throw Error('Amount cannot be zero.');
          const status=key(r.status||'pending');
          if(!['pending','accepted','posted'].includes(status)) throw Error('Status must be Pending, Accepted or Posted.');
          if(r.accepted_at && !/^\d{4}-\d{2}-\d{2}/.test(r.accepted_at)) throw Error('accepted_at must start with YYYY-MM-DD.');
          const list=data[sourceMap[source]]||[];
          const same=list.find(x=>key(x.employeeNo)===key(r.employee_number)&&key(x.period)===key(period)&&Math.abs((Number(x.amount)||0)-amount)<.005&&key(x.reference||'')===key(r.reference||''));
          if(same){item.status='Skipped';item.message='Exact transaction already exists. Existing line is kept unchanged.';return item;}
          const changed=list.find(x=>key(x.employeeNo)===key(r.employee_number)&&key(x.period)===key(period)&&key(x.reference||'')===key(r.reference||''));
          if(changed){item.status='Skipped';item.message='Same employee, period and reference already exists with a different amount. Existing line is kept unchanged.';return item;}
          item.record={store:sourceMap[source],employeeNo:emp.employeeNo,employeeName:emp.employeeName,period,amount,reference:r.reference||'',accepted:['accepted','posted'].includes(status),acceptedAt:r.accepted_at||'',loanType:r.loan_type||'',imported:new Date().toISOString()};
        } else {
          if (/^\d+(?:[.,]\d{1,2})?$/.test(String(r.status||'').trim()) && ['active','new','partial paid','partially paid','paid up','fully paid','cancelled'].includes(key(r.total_paid))) {
            const shiftedPaidThrough = r.paid_through_month;
            r.notes = r.notes || (!shiftedPaidThrough || shiftedPaidThrough === '0' ? '' : shiftedPaidThrough);
            r.paid_through_month = '';
            const shiftedStatus = r.total_paid;
            r.total_paid = r.status;
            r.status = shiftedStatus;
          }
          const emp=data.employees.find(x=>key(x.employeeNo)===key(r.employee_number)); if(!emp) throw Error('Employee not found. Import employees first.');
          const amount=number(r.amount,'Amount'),payment=number(r.monthly_deduction,'Monthly deduction');
          if(amount<=0||payment<=0) throw Error('Amount and monthly deduction must be greater than zero.');
          const paid=number(r.total_paid||'0','Total paid'),rate=number(r.annual_interest_rate||'0','Interest rate');
          if(rate!==0) throw Error('Historical balance import currently supports interest-free loans only.');
          if(paid>amount) throw Error('Total paid cannot exceed the original amount.');
          let status=key(r.status||'new'),statuses={'active':'New','new':'New','partial paid':'Partial Paid','partially paid':'Partial Paid','paid up':'Fully Paid','fully paid':'Fully Paid','cancelled':'Cancelled'};
          if(!statuses[status]) throw Error('Loan status must be New, Partial Paid, Fully Paid or Cancelled.');
          if(status==='fully paid'||status==='paid up'){if(paid!==amount) throw Error('Fully Paid requires Total Paid to equal Amount.')}
          if(status==='active'&&paid>0&&paid<amount)status='partial paid';
          if(status==='active'&&paid===amount)status='fully paid';
          if(status==='new' && paid>0) throw Error('Loans with Total Paid must have status Partial Paid or Fully Paid.');
          if((status==='partial paid'||status==='partially paid') && (paid<=0||paid>=amount)) throw Error('Partial Paid requires Total Paid to be greater than zero and less than Amount.');
          const applicationDate=date(r.application_date),first=loanMonth(r.first_deduction_month,'First deduction month',applicationDate);
          const terms=number(r.term_months||String(Math.ceil(amount/payment)),'Term'); if(!Number.isInteger(terms)||terms<1||terms>1200) throw Error('Term must be a whole number from 1 to 1200.');
          const paidMonth=paid>0?month(r.paid_through_month,'Paid through month'):'';
          if(paidMonth && paidMonth<applicationDate.slice(0,7)) throw Error('Paid through month cannot precede application date.');
          const cancelMonth=status==='cancelled'?month(r.cancel_month,'Cancellation month'):'';
          if(status==='cancelled'&&!r.cancel_reason) throw Error('Cancellation reason is required.');
          item.record={applicationNo:r.loan_number,employeeNo:emp.employeeNo,employeeName:emp.employeeName,applicationDate,type:r.loan_type,amount,payment,firstPeriod:first,months:terms,rate,status:statuses[status],notes:r.notes||'',cancelMonth,cancelReason:r.cancel_reason||'',repayments:paid>0?[{period:paidMonth,amount:paid,source:'Historical CSV',balanceAfter:amount-paid,reference:'Opening total paid; not an individual payroll payment'}]:[],...((status==='paid up'||status==='fully paid')?{paidUpPeriod:paidMonth}:{})};
        }
      } catch(e) {item.status='Error'; item.message=e.message;}
      return item;
    });
  }
  const api={parse,plan,employeeHeaders,loanHeaders,transactionHeaders};
  if(typeof module !== 'undefined' && module.exports) module.exports=api;
  if(typeof document === 'undefined') return;
  const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function csvDownload(name, headers) {
    const blob=new Blob(['\uFEFF'+headers.join(',')+'\r\n'],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function mount(parent,kind,suffix) {
    const card=document.createElement('div');card.className='card';card.style.marginBottom='16px';
    const employees=kind==='employees',transactions=kind==='transactions',label=employees?'Employees':transactions?'Transaction History':'Loan History';
    card.innerHTML=`<h2>Import ${label} CSV</h2><p class="muted">${employees?'Required columns: employee_number and employee_name. Optional: id_number, department, status. Existing employees are kept unchanged.':'Required columns: loan_number, employee_number, application_date, loan_type, amount, monthly_deduction and first_deduction_month. Existing loans are kept unchanged. Import employees first.'}</p><div class="actions"><button type="button" class="btn" data-template>Download ${label} CSV Template</button></div><label for="recordCsv-${suffix}">Select ${label} CSV</label><input id="recordCsv-${suffix}" type="file" accept=".csv,text/csv"><div class="actions"><button type="button" class="btn" data-preview>Check / Preview CSV</button><button type="button" class="btn" data-clear>Clear Preview</button><button type="button" class="primary" data-commit>Import New Rows</button></div><p data-summary role="status"></p><div style="overflow:auto;max-height:400px"><table><thead><tr><th>CSV Row</th><th>Number</th><th>Status</th><th>Details</th></tr></thead><tbody></tbody></table></div>`;
    parent.appendChild(card);
    const file=card.querySelector('input'),button=card.querySelector('[data-commit]'),summary=card.querySelector('[data-summary]'),body=card.querySelector('tbody');let pending=null;
    const clear=()=>{pending=null;body.innerHTML='';summary.textContent='';summary.className='';};
    const clearAll=()=>{clear();file.value='';};
    file.onchange=clear;
    card.querySelector('[data-clear]').onclick=clearAll;
    card.querySelector('[data-template]').onclick=()=>csvDownload(employees?'employee-import-template.csv':transactions?'transaction-history-import-template.csv':'loan-history-import-template.csv',employees?employeeHeaders:transactions?transactionHeaders:loanHeaders);
    async function previewCsv(){
      clear();try {
        const selected=file.files[0];if(!selected) throw Error('Choose a CSV file first.');if(selected.size>5*1024*1024) throw Error('Use a CSV smaller than 5 MB.');
        const text=await selected.text();if(file.files[0]!==selected)return;
        const rows=plan(text,kind,db);pending={text,name:selected.name};
        body.innerHTML=rows.map(r=>`<tr><td>${r.line}</td><td>${escape(r.identity)}</td><td>${r.status}</td><td>${escape(r.status==='New'?(employees?r.record.employeeName:transactions?`${r.record.store.toUpperCase()} - ${r.record.employeeName} - ${r.record.period} - Amount ${r.record.amount.toFixed(2)}`:`${r.record.employeeName} - ${r.record.type} - Amount ${r.record.amount.toFixed(2)} - Paid ${(r.record.repayments[0]?.amount||0).toFixed(2)} - ${r.record.status}`):r.message)}</td></tr>`).join('');
        const valid=rows.filter(r=>r.status==='New').length,errors=rows.filter(r=>r.status==='Error').length;
        summary.textContent=`${valid} new; ${rows.filter(r=>r.status==='Skipped').length} existing kept; ${errors} errors. `+(valid?'Now you can click Import New Rows. Error rows will not be imported.':'Fix errors and check the file again.');
        summary.className=valid?'good pill':'bad pill';
        return rows;
      }catch(e){summary.textContent=e.message;summary.className='bad pill';return [];}
    }
    card.querySelector('[data-preview]').onclick=previewCsv;
    button.onclick=async()=>{
      if(!pending){summary.textContent='Please click Check / Preview CSV before importing.';summary.className='bad pill';return;}
      try {
        const rows=plan(pending.text,kind,db);
        const additions=rows.filter(r=>r.status==='New');if(!additions.length)throw Error('No new rows remain. Existing records were kept.');
        if(!confirm(`Add ${additions.length} new ${label.toLowerCase()} records? Existing records will not be changed.`))return;
        const next=JSON.parse(JSON.stringify(db)),now=new Date().toISOString();
        for(const item of additions){const record={...item.record,id:crypto.randomUUID(),created:now,importSource:pending.name,importedAt:now};
          if(kind==='loans'){record.repayments=record.repayments.map(p=>({...p,id:crypto.randomUUID(),postedAt:now}));if(!next.loanTypes.some(t=>key(t.name)===key(record.type)))next.loanTypes.push({id:crypto.randomUUID(),name:record.type,active:true});else record.type=next.loanTypes.find(t=>key(t.name)===key(record.type)).name;}
          if(transactions){let store=record.store;delete record.store;next[store].push(record);}
          else next[kind==='employees'?'employees':'loans'].push(record);
        }
        localStorage.setItem(KEY,JSON.stringify(next));db=next;pending=null;render();summary.textContent=`Imported ${additions.length} new records successfully. Existing records were kept unchanged.`;
      }catch(e){summary.textContent='Import not completed: '+e.message;}
    };
  }
  const imports=document.getElementById('imports');
  if(imports){
    Array.from(imports.children).forEach(child=>child.style.display='none');
    mount(imports,'employees','employees-import');
    mount(imports,'loans','loans');
  }
})();
