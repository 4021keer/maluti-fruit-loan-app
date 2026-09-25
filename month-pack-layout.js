(() => {
  const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => (Number(value)||0).toLocaleString('en-ZA',{style:'currency',currency:'ZAR'});
  const paid = loan => (loan.repayments||[]).reduce((sum,row)=>sum+(Number(row.amount)||0),0);
  const balance = loan => Math.max(0,(Number(loan.amount)||0)-paid(loan));
  function groupedOutstanding(loans) {
    const groups=new Map();
    for(const loan of loans){const key=String(loan.employeeNo||'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(loan);}
    let result='';
    for(const [number,items] of groups){
      result+=`<tr class="employee-group"><td colspan="5">${escape(number)} · ${escape(items[0].employeeName)}</td></tr>`;
      result+=items.map(x=>`<tr><td>${escape(x.applicationNo)}</td><td>${escape(x.type||'Loan')}</td><td class="num">${money(x.amount)}</td><td class="num">${money(paid(x))}</td><td class="num">${money(balance(x))}</td></tr>`).join('');
      result+=`<tr class="report-subtotal"><td colspan="4">Employee subtotal</td><td class="num">${money(items.reduce((sum,x)=>sum+balance(x),0))}</td></tr>`;
    }
    if(!loans.length)result='<tr><td colspan="5">No outstanding loan balances.</td></tr>';
    return result+`<tr class="report-total"><td colspan="4">GRAND TOTAL (BALANCE)</td><td class="num">${money(loans.reduce((sum,x)=>sum+balance(x),0))}</td></tr>`;
  }
  window.styleMonthlyLoanPack=pack=>{
    const card=document.getElementById('payrollReconPackCard');
    const summary=document.getElementById('payrollReconKpis');
    summary.innerHTML=[['New loans',pack.newLoans.length],['New loan value',money(pack.summary.newLoanTotal)],['Current outstanding',money(pack.summary.outstandingTotal)]].map(([label,value])=>`<div class="recon-kpi"><span>${label}</span><b>${value}</b></div>`).join('');
    const newRows=document.getElementById('payrollNewLoanRows');
    newRows.insertAdjacentHTML('beforeend',`<tr class="report-total"><td colspan="5">TOTAL</td><td class="num">${money(pack.newLoans.reduce((sum,x)=>sum+(Number(x.amount)||0),0))}</td><td class="num">${money(pack.newLoans.reduce((sum,x)=>sum+(Number(x.payment)||0),0))}</td></tr>`);
    newRows.querySelectorAll('tr').forEach(row=>{if(row.cells.length===7){row.cells[5].classList.add('num');row.cells[6].classList.add('num');}});
    const rows=document.getElementById('payrollOutstandingRows'),box=rows.closest('.tablebox');
    let section=card.querySelector('.report-continuation');
    if(!section){
      const oldTitle=box.previousElementSibling;if(oldTitle?.tagName==='H4')oldTitle.remove();
      section=document.createElement('section');section.className='report-continuation';box.before(section);section.append(box);
    }
    section.querySelector('.report-heading')?.remove();
    const heading=card.querySelector('.report-heading').cloneNode(true);
    heading.querySelector('h1').textContent='OUTSTANDING LOAN BALANCES';
    const basis=document.createElement('div');basis.innerHTML='<b>Balance basis</b>Current recorded balance';heading.querySelector('.report-meta').append(basis);
    section.prepend(heading);
    rows.closest('table').querySelector('thead').innerHTML='<tr><th>Loan #</th><th>Type</th><th>Original</th><th>Paid</th><th>Balance</th></tr>';
    rows.innerHTML=groupedOutstanding(pack.outstanding);
    let note=section.querySelector('.report-section-note');if(!note){note=document.createElement('p');note.className='report-section-note';section.append(note);}note.textContent='Outstanding balances reflect current recorded repayments, not a historical month-end snapshot.';
    const signoff=card.querySelector('.signoff-box');
    signoff.innerHTML=['Prepared by','Checked by','Approved by'].map(label=>`<div>${label}<div class="signature-line"></div>Date: <span class="signature-date"></span></div>`).join('');
    section.append(signoff);
  };
})();
