(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const css = document.createElement('style');
  css.textContent = '#agreementPaper,#agreementDocStatusCard{display:none!important}#loanAgreementFrame{width:100%;height:1150px;border:0;background:white;margin-top:16px}';
  document.head.append(css);
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<h2>Loan Agreement</h2><p id="loanAgreementNotice">Choose a loan and click Complete to fill the agreement.</p><a href="templates/loan%20agreement.html" download="loan agreement.html">Download blank agreement</a>';
  el('agreementControls').before(card);
  const frame = document.createElement('iframe');
  frame.id = 'loanAgreementFrame';
  frame.title = 'Loan Agreement';
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  el('agreementControls').after(frame);
  const cash = n => (Number(n)||0).toLocaleString('en-ZA',{style:'currency',currency:'ZAR'});
  function values(loan, employee) {
    const amount=Number(loan.amount)||0, payment=Number(loan.payment)||0, rate=Number(loan.rate)||0;
    const months=Math.max(1,Number(loan.months)||Math.ceil(amount/(payment||1)));
    let outstanding=amount, final=0;
    for(let i=0;i<months;i++) { const due=outstanding*(1+rate/1200); final=Math.min(payment||due,due); outstanding=Math.max(0,due-final); }
    let expected='';
    if(/^\d{4}-\d{2}$/.test(loan.firstPeriod||'')) {const [y,m]=loan.firstPeriod.split('-').map(Number),date=new Date(y,m+months-2,1);expected=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;}
    return {application_no:loan.applicationNo||'',application_date:loan.applicationDate||String(loan.created||'').slice(0,10),employee_number:loan.employeeNo||'',employee_name:loan.employeeName||employee.employeeName||'',employee_id:employee.idNumber||'',department:employee.department||'',loan_type:loan.type||'Loan',loan_reason:loan.notes||'',amount_requested:cash(amount),amount_approved:cash(amount),monthly_deduction:cash(payment),first_deduction_date:loan.firstPeriod||'',annual_interest_rate:rate.toFixed(2)+'%',number_of_instalments:String(months),final_instalment:Math.abs(final-payment)>.01?cash(final):'—',expected_final_deduction:expected};
  }

  const safe = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cents = n => Math.round((n+Number.EPSILON)*100)/100;
  function schedule(loan) {
    let balance=Number(loan.amount)||0, rate=(Number(loan.rate)||0)/1200;
    const terms=Math.max(1,Math.trunc(Number(loan.months)||Math.ceil(balance/(Number(loan.payment)||1))));
    const payment=Number(loan.payment)||(rate?balance*rate/(1-Math.pow(1+rate,-terms)):balance/terms);
    const first=String(loan.firstPeriod||'');
    const parts=/^\d{4}-\d{2}$/.test(first)?first.split('-').map(Number):null;
    const rows=[];
    for(let i=0;i<terms&&balance>.005;i++) {
      const opening=balance, interest=cents(opening*rate), due=cents(opening+interest);
      const paid=i===terms-1?due:Math.min(cents(payment),due), capital=cents(paid-interest);
      balance=cents(Math.max(0,due-paid));
      const date=parts?new Date(parts[0],parts[1]-1+i,1):null;
      rows.push({number:i+1,period:date?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`:'—',opening,interest,paid,capital,closing:balance});
    }
    return rows;
  }

  function reportHeader(title, person, range, generated) {
    return `<div class="report-heading"><div class="report-brand">MALUTI FRUIT</div><h1>${safe(title)}</h1><div class="report-meta"><div><b>Report</b>${safe(title)}</div><div><b>Generated (SAST)</b>${safe(generated)}</div><div><b>Employee</b>${person}</div><div><b>Date range</b>${safe(range)}</div></div></div>`;
  }
  const runDate = () => new Date().toLocaleString('en-GB',{timeZone:'Africa/Johannesburg',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});

  function reportHtml(loan, loans) {
    const rows=schedule(loan), total=key=>rows.reduce((sum,row)=>sum+row[key],0);
    const who=`${safe(loan.employeeNo)} — ${safe(loan.employeeName)}`;
    const history=loans.filter(x=>x.employeeNo===loan.employeeNo).slice().sort((a,b)=>String(a.applicationDate||a.created||'').localeCompare(String(b.applicationDate||b.created||'')));
    const generated=runDate();
    const dates=history.map(x=>String(x.applicationDate||x.created||'').slice(0,10)).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
    const historyRange=dates.length?dates[0]+' to '+dates.at(-1)+' (application dates; all recorded loans)':'All recorded loans — application dates unavailable';
    const scheduleRange=rows.length&&rows[0].period!=='—'?rows[0].period+' to '+rows.at(-1).period+' (scheduled months)':'Scheduled dates unavailable';
    const historyRows=history.map(x=>{
      const payments=(x.repayments||[]).slice().sort((a,b)=>String(a.date||a.period||a.postedAt||'').localeCompare(String(b.date||b.period||b.postedAt||'')));
      const paid=payments.reduce((sum,r)=>sum+(Number(r.amount)||0),0), outstanding=Math.max(0,(Number(x.amount)||0)-paid);
      const status=x.status==='Cancelled'?'Cancelled':outstanding<=.01?'Fully Paid':paid>0?'Partial Paid':'New';
      let settled='',sum=0;
      if(status==='Fully Paid') { for(const r of payments) {sum+=Number(r.amount)||0;if(sum>=(Number(x.amount)||0)-.01){settled=r.date||r.period||String(r.postedAt||'').slice(0,10);break;}} settled=settled||x.paidUpPeriod||''; }
      return `<tr><td>${safe(x.applicationNo)}</td><td>${safe(x.applicationDate||String(x.created||'').slice(0,10))}</td><td>${safe(x.type||'Loan')}<br>${safe(x.notes)}</td><td>${cash(x.amount)}</td><td>${cash(paid)}</td><td>${cash(outstanding)}</td><td>${status}</td><td>${safe(settled)}</td></tr>`;
    }).join('');
    return `<section class="loan-report">${reportHeader('AMORTISATION SCHEDULE',who,scheduleRange,generated)}<p>Loan: ${safe(loan.applicationNo)} · Amount: ${cash(loan.amount)} · Annual interest: ${(Number(loan.rate)||0).toFixed(2)}%</p><table><thead><tr><th>No.</th><th>Month</th><th>Opening</th><th>Interest</th><th>Payment</th><th>Capital</th><th>Closing</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.number}</td><td>${r.period}</td><td>${cash(r.opening)}</td><td>${cash(r.interest)}</td><td>${cash(r.paid)}</td><td>${cash(r.capital)}</td><td>${cash(r.closing)}</td></tr>`).join('')}<tr><th colspan="3">Total</th><th>${cash(total('interest'))}</th><th>${cash(total('paid'))}</th><th>${cash(total('capital'))}</th><th>${cash(rows.at(-1)?.closing||0)}</th></tr></tbody></table><p>Scheduled repayments. The final instalment settles the remaining scheduled balance, including rounding differences.</p><footer>Maluti Fruit | Amortisation Schedule | Confidential</footer></section><section class="loan-report">${reportHeader('EMPLOYEE LOAN HISTORY',who,historyRange,generated)}<table><thead><tr><th>Loan #</th><th>Date</th><th>Type / reason</th><th>Amount</th><th>Total paid</th><th>Outstanding</th><th>Status</th><th>Fully paid date</th></tr></thead><tbody>${historyRows}</tbody></table><p>All loans recorded for this employee. Paid and outstanding amounts follow the app's recorded repayments.</p><footer>Maluti Fruit | Employee Loan History | Confidential</footer></section>`;
  }

  function render(complete=false,print=false) {
    const loan=db.loans.find(x=>x.id===el('agreementLoan').value);
    if(complete&&!loan) {el('loanAgreementNotice').textContent='Choose a loan first.';return false;}
    const doc=new DOMParser().parseFromString(window.loanAgreementTemplate,'text/html');
    if(complete) {
      const employee=db.employees.find(x=>x.employeeNo===loan.employeeNo)||{};
      const map=values(loan,employee);
      const repaymentRows=schedule(loan), last=repaymentRows.at(-1);
      if(last)map.final_instalment=Math.abs(last.paid-(Number(loan.payment)||0))>.01?cash(last.paid):'—';
      const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);
      let node;while((node=walker.nextNode())) node.nodeValue=node.nodeValue.replace(/\{\{\s*([^}]+)\s*\}\}/g,(_,key)=>map[key.replace(/\s/g,'')]||'________________');
    }
    if(complete) {
      const style=doc.createElement('style');
      style.textContent='.loan-report{break-before:page;page-break-before:always;padding-top:24px;margin-top:32px}.loan-report h1{font-size:18pt}.loan-report table{font-size:8.5pt;break-inside:auto;table-layout:fixed}.loan-report td:first-child{width:auto}.loan-report th,.loan-report td{border:1px solid #aaa;padding:5px;overflow-wrap:anywhere}.loan-report th{background:#e7ecef}.loan-report thead{display:table-header-group}.loan-report tr{break-inside:avoid}.loan-report footer{margin-top:16px}@media print{.loan-report{margin-top:0;padding-top:0}}';
      style.textContent += window.loanReportCss;
      doc.head.append(style);
      doc.querySelector('main').insertAdjacentHTML('beforeend',reportHtml(loan,db.loans));
    }
    frame.onload=()=>{frame.style.height=Math.max(800,frame.contentDocument.documentElement.scrollHeight+32)+'px';if(print){frame.contentWindow.focus();frame.contentWindow.print();}};
    frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;
    el('loanAgreementNotice').textContent=complete?'Agreement completed for '+(loan.employeeName||loan.employeeNo)+'.':'Blank agreement — choose a loan and click Complete.';
    return true;
  }
  // Capture these actions before the legacy Word/PDF handlers run.
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(!['prepareAgreement','previewAgreement','printAgreement','clearAgreementFields'].includes(button.id))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(button.id==='clearAgreementFields'){el('agreementLoan').selectedIndex=-1;render();}
    else render(true,button.id==='printAgreement');
  },true);
  el('agreementLoan').addEventListener('change',()=>render(Boolean(el('agreementLoan').value)));
  render();
})();
