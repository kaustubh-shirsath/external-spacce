/* =========================================================================
   Agent Portfolio v3 — role-aware (TC / TL / Supervisor), product-level, date-filtered.
   Data: window.PF_DATA (portfolio-data.js) — real, masked. Portfolio as of 20 Nov 2026.
   ========================================================================= */
(function(){
const D0 = window.PF_DATA;
const LAST = 20;                       // last data day (20 Nov)
const BKT_LOAN = ['Bkt 0','Bkt 1','Bkt 2','Bkt 3','Bkt 4','Bkt 5','Bkt 6','Bkt 6+'];
const BKT_EDL = ['SMA - 0','SMA - 1','SMA - 2','SS - 1','SS - 2','SS - 3','180+'];
const PM = {
  borrow:{label:'Borrow', color:'#2563EB', kind:'loan', bkts:BKT_LOAN, start:6, cyc:'Cycle 6 Nov → 5 Dec', sup:'S1', rn:{tc:'TC',tl:'TL',sup:'Supervisor'}},
  cc:{label:'Credit Card', color:'#059669', kind:'cc', bkts:BKT_LOAN, start:1, cyc:'Month from 1 Nov', sup:'S2', rn:{tc:'TC',tl:'TL',sup:'Supervisor'}},
  edl:{label:'EDL', color:'#7C3AED', kind:'edl', bkts:BKT_EDL, start:8, cyc:'Bank cycle 8 Nov → 7 Dec', sup:'Z1', rn:{tc:'Field agent',tl:'Mentor',sup:'ZRM'}},
};
const CONTACT = new Set(['PTP','CB','PAID','RTP','DISPUTE','Payment Inquiry','CPTP','BPTP','PP','DECEASED','CLAIMS_PAID','LINK_GENERATED']);
const NOCONTACT = new Set(['RNR','NC','Voicemail','LM','SKIP','WN','WRONG_NUMBER']);
const DISPO_NAME = {RNR:'Ringing, no response',NC:'Not contactable',CB:'Call back',PTP:'Promise to pay',PAID:'Says paid',Voicemail:'Voicemail',LM:'Left message',RTP:'Refused to pay',
  'Payment Inquiry':'Payment inquiry',BPTP:'Broken PTP',CPTP:'Confirmed PTP',PP:'Part payment',DECEASED:'Deceased',LINK_GENERATED:'Link generated','No disposition':'No disposition yet'};

/* ---------- state ---------- */
const S = { role:'tc', product:'borrow', tab:'main', drillTC:null, drillTL:null, sel:null, sort:{k:null,d:-1}, q:'', page:1, expanded:{}, pop:null, from:6, to:LAST };

/* ---------- formatting ---------- */
const nz = v => (v==null||isNaN(v)) ? 0 : v;
const fI = v => v==null||isNaN(v) ? '—' : Math.round(v).toLocaleString('en-IN');
const fR = v => { if(v==null||isNaN(v)) return '—'; const a=Math.abs(v); if(a>=1e7) return '₹'+(v/1e7).toFixed(2)+'Cr'; if(a>=1e5) return '₹'+(v/1e5).toFixed(2)+'L'; if(a>=1e3) return '₹'+(v/1e3).toFixed(1)+'K'; return '₹'+Math.round(v); };
const fRF = v => v==null||isNaN(v) ? '—' : '₹'+Math.round(v).toLocaleString('en-IN');
const fP = v => v==null||!isFinite(v) ? '—' : (v*100).toFixed(1)+'%';
const fMSS = s => { if(s==null||!isFinite(s)) return '—'; const m=Math.floor(s/60), x=Math.round(s%60); return `${m}:${String(x).padStart(2,'0')}`; };
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const add = (a,b) => a ? a.map((x,i)=>nz(x)+nz(b[i])) : b.map(nz);
const dl = d => `${d} Nov`;
const rangeLbl = () => S.from===S.to ? dl(S.to) : `${S.from}–${S.to} Nov`;
const isFull = () => S.from===meta().start && S.to===LAST;

/* ---------- data helpers ---------- */
const meta = () => PM[S.product];
const data = () => D0[S.product];
const rn = () => meta().rn;
const isEDL = () => meta().kind==='edl';
const allCodes = () => Object.keys(data().tcs).sort();
const tlOf = c => data().tcs[c].tl;
const codesOfTL = tl => allCodes().filter(c=>tlOf(c)===tl);
const tcLabel = c => `${isEDL()?'Agent':'TC'} ${c}`;
const tlLabel = t => `${isEDL()?'Mentor':'TL'} ${t}`;
const unitTC = (n) => `${n} ${isEDL()? (n===1?'agent':'agents') : (n===1?'TC':'TCs')}`;
const bktsOf = codes => { const s=new Set(); codes.forEach(c=>Object.keys(data().tcs[c].b).forEach(b=>s.add(b))); return meta().bkts.filter(b=>s.has(b)); };
const bktRange = codes => { const b=bktsOf(codes).map(x=>x.replace(' - ','-')); if(!b.length) return ''; return b.length===1? b[0] : (b[0].startsWith('Bkt')? `${b[0]} – ${b[b.length-1].replace('Bkt ','')}` : `${b[0]} → ${b[b.length-1]}`); };

function view(){
  const D=data();
  if(S.drillTC) return {mode:'tc', codes:[S.drillTC], tl:tlOf(S.drillTC)};
  if(S.role==='tc') return {mode:'tc', codes:[D.persona[0]], tl:D.persona[1]};
  if(S.role==='tl' || S.drillTL){ const tl=S.drillTL||D.persona[1]; return {mode:'tl', tl, codes:filtSel(codesOfTL(tl))}; }
  return {mode:'sup', codes:filtSel(allCodes())};
}
function filtSel(codes){ return S.sel ? codes.filter(c=>S.sel.has(c)) : codes; }
function scopeCodes(){ const D=data(); if(S.role==='tl' || S.drillTL) return codesOfTL(S.drillTL||D.persona[1]); return allCodes(); }

/* ---------- aggregation (portfolio as of 20 Nov; resolution & connectivity over S.from..S.to) ---------- */
function M(codes){
  const D=data(), P=meta(), cc=P.kind==='cc', edl=P.kind==='edl', f=S.from, t=S.to;
  const bk={}, rb={}; let base=null, res=null, act=[0,0,0], rec=0, snapS=[0,0,0,0], ptpE=[0,0]; const cats={};
  codes.forEach(c=>{
    Object.entries(D.tcs[c].b).forEach(([b,v])=>{ bk[b]=add(bk[b],v); base=add(base,v); });
    Object.entries((D.res||{})[c]||{}).forEach(([b,days])=>Object.entries(days).forEach(([d,v])=>{ d=+d; if(d<f||d>t) return; rb[b]=add(rb[b],v); res=add(res,v); }));
    if(!edl){
      Object.entries((D.act||{})[c]||{}).forEach(([d,v])=>{ d=+d; if(d>=f&&d<=t) act=add(act,v); });
      const sn=((D.snap||{})[c]||{})[t]; if(sn){ snapS=add(snapS,sn.s); Object.entries(sn.c).forEach(([k,n])=>cats[k]=(cats[k]||0)+n); }
    } else {
      const dd=(D.day||{})[c]||{}; Object.entries(dd).forEach(([d,v])=>{ d=+d; if(d>=f&&d<=t) rec+=nz(v[0]); });
      let k=t; while(k>=P.start && !dd[k]) k--; if(dd[k]) ptpE=add(ptpE,[dd[k][1],dd[k][2]]);
    }
  });
  base = base || [0,0,0,0,0]; res = res || (cc?[0,0,0,0]:[0,0,0,0,0]);
  const m = {codes, bk, resBk:rb, cats, cases:base[0], pos:base[1], od:base[2], e1:base[3], paid:base[4], res:res[0], resPos:res[1]};
  if(cc){ m.mindue=res[2]; m.full=res[3]; } else { m.stbl=res[2]; m.norm=res[3]; m.rb=res[4]; }
  m.resPct = m.cases? m.res/m.cases : null; m.posResPct = m.pos? m.resPos/m.pos : null;
  if(!edl){ [m.calls,m.conn,m.talk]=act; m.connRate=m.calls? m.conn/m.calls : null; m.avgTalk=m.conn? m.talk/m.conn : null;
    [m.contacted,m.ptp,m.ptpAmt,m.ptpAmtN]=snapS; m.contactedPct=m.cases? m.contacted/m.cases : null; }
  else { m.rec=rec; [m.ptp,m.ptpAmt]=ptpE; m.ptpAmtN=m.ptp; }
  return m;
}

/* ---------- info tooltips ---------- */
Object.assign(INFO, {
  'pf.cases':{t:'Total Cases', f:'Allocated cases on 20 Nov (one row per customer). Borrow: current_month_collections_mis · CC: current_month_collections_mis_cc · EDL: bank_collections_mis, bucket ≠ Standard.'},
  'pf.pos':{t:'POS', f:'SUM(pos) — principal outstanding, ₹, as of 20 Nov. EDL: principal_outstanding.'},
  'pf.od':{t:'Overdue Amt', f:'Borrow: MIS emi — total overdue to clear the bucket. EDL: total_overdue.'},
  'pf.e1':{t:'1 EMI Amt', f:'Borrow: MIS stbl_emi — one EMI, the amount that stabilises the case. EDL: installment_amount.'},
  'pf.rba':{t:'Remaining Bill', f:'SUM(remaining_bill_amount) — full payoff on the current CC bill, ₹.'},
  'pf.mda':{t:'Min Due Amt', f:'SUM(min_due_amount) — clears the CC overdue (CC’s “1 EMI”).'},
  'pf.res':{t:'Cases Resolved', f:"Customers who left FWD during the selected dates and are still resolved on 20 Nov.\nBorrow: flow NORM / STBL / RB · CC: MINDUE_PAID / PAID · EDL: outcome ≠ FWD", n:'Full cycle = everything resolved so far this cycle. % is of all allocated cases.'},
  'pf.posres':{t:'POS Resolved', f:'POS (as of 20 Nov) of the cases resolved in the selected dates. % is of total POS.'},
  'pf.stbl':{t:'Stab', f:'Resolved cases now in STBL (paid 1 EMI, bucket held). EDL: outcome Stable.'},
  'pf.norm':{t:'Norm', f:'Resolved cases now NORM (paid all dues). EDL: outcome Norm.'},
  'pf.rb':{t:'Rollback', f:'Resolved cases now RB (moved back a bucket). EDL: outcome RB.'},
  'pf.mindue':{t:'Min Due Resolved', f:'CC cases resolved with status MINDUE_PAID (min due cleared).'},
  'pf.fulldue':{t:'Full Due Resolved', f:'CC cases resolved with status PAID (whole bill paid).'},
  'pf.conncalls':{t:'Connected Calls', f:"Calls with status answered / CONNECTED in the selected dates. copsdb_gold.tele_call_log, Acefone + Ameyo, matched on the TC's login. Small text = calls dialled."},
  'pf.ptp':{t:'Active PTP', f:'Customers whose latest PTP date is on or after the end date and who are still unresolved that day. Amount = amountpromised, shown only where TCs entered it.', n:'EDL: ptp_date / ptp_amount from bank_collections_mis.'},
  'pf.rec':{t:'Recovered', f:'SUM(recovery_ftd) over the selected dates — bank_collections_mis (EDL).'},
  'pf.avgtalk':{t:'Avg talk time', f:'Talk time ÷ connected calls in the selected dates (m:ss).'},
  'pf.contacted':{t:'Connected users', f:'Customers with at least one contact disposition from a TC since cycle start, up to the end date (PTP, CB, PAID, RTP, DISPUTE, Payment Inquiry, CPTP, BPTP, PP, DECEASED …).', n:'Acefone manual dials carry no customer id, so per-customer connects come from dispositions.'},
  'pf.dispo':{t:'Disposition mix', f:'Distinct customers by their LATEST TC disposition category as of the end date (copsdb_gold.collection_note, TC notes only — AI / auto notes excluded).'},
  'pf.totalcalls':{t:'Total Calls', f:'Dispositions logged by TCs on this customer this cycle (each manual call is disposed).', n:'MIS calls_count is empty and Acefone manual dials have no customer id, so dialler counts can’t be joined per customer yet.'},
  'pf.cat':{t:'Category', f:'Latest TC disposition category this cycle (collection_note.category_code).'},
  'pf.ldisp':{t:'Last Disposition', f:'MIS latest_disposition (includes AI / auto-dial outcomes; Category shows the latest TC disposition).'},
  'pf.bdisp':{t:'Best Disposition', f:'CC MIS best_disposition — the best outcome reached on this bill, not the latest. Category shows the latest TC disposition.'},
  'pf.ccod':{t:'Overdue Amt', f:'CC MIS principal_overdue.', n:'In today’s CC MIS this equals POS for every bill — Min Due is the amount that actually clears the overdue.'},
  'pf.edlcat':{t:'Category', f:'EDL has no TC dispositions in this data. Shows PTP when bank MIS ptp_date ≥ 20 Nov and the loan is still FWD.'},
  'pf.edlprod':{t:'Profile Type', f:'EDL: product_name from bank_collections_mis (edl_inventory / edl_migrated / …).'},
  'pf.edlfield':{t:'Field data', f:'EDL is field-collected; visits and dispositions live in mCollect, not in this dataset.'},
  'pf.edlfu':{t:'Follow Up', f:'EDL: ptp_date from bank_collections_mis.'},
});

/* ---------- top-level render ---------- */
function render(){
  const root=document.getElementById('pfRoot'); if(!root) return;
  const v=view();
  root.innerHTML = head(v) + kpis(v) + tabs(v) + `<div class="pf-body">${S.tab==='summary'? summary(v) : (v.mode==='tc'? cases(v) : team(v))}</div>`;
  const u=document.getElementById('pfUser'); const D=data();
  if(u) u.innerHTML = `<span class="avatar"></span>${S.role==='tc'? tcLabel(D.persona[0]) : S.role==='tl'? tlLabel(D.persona[1]) : rn().sup+' '+meta().sup}`;
}
window.pfRender = render;

/* ---------- header ---------- */
function head(v){
  const P=meta(), D=data();
  let sub, crumbs='';
  if(v.mode==='tc') sub = S.drillTC ? `${rn().tc} view · ${tlLabel(v.tl)} · ${bktRange(v.codes)}` : (isEDL()? 'Field agent personal dashboard (EDL is field-collected)' : 'Collection agents personal dashboard');
  else if(v.mode==='tl') sub = `${isEDL()?'Mentor':'Team lead'} dashboard · ${tlLabel(v.tl)} · ${unitTC(codesOfTL(v.tl).length)} · ${bktRange(codesOfTL(v.tl))}`;
  else sub = `${rn().sup} dashboard · ${D.tls.length} ${isEDL()?'mentors':'TLs'} · ${unitTC(allCodes().length)}`;
  if(S.drillTC || S.drillTL){
    const parts=[`<a onclick="pf.home()">${S.role==='sup' ? 'Teams' : 'My Team'}</a>`];
    if(S.role==='sup'){ const tl=S.drillTL||tlOf(S.drillTC); parts.push(S.drillTC? `<a onclick="pf.drillTL('${tl}')">${tlLabel(tl)}</a>` : `<span>${tlLabel(tl)}</span>`); }
    if(S.drillTC) parts.push(`<span>${tcLabel(S.drillTC)}</span>`);
    crumbs = `<div class="pf-crumb">${parts.join('<span>/</span>')}</div>`;
  }
  const roles = `<div class="pf-roles" title="Prototype: switch the logged-in role"><span class="lbl">VIEW AS</span>${['tc','tl','sup'].map(r=>`<button class="${S.role===r?'on':''}" onclick="pf.role('${r}')">${{tc:'TC',tl:'TL',sup:'Supervisor'}[r]}</button>`).join('')}</div>`;
  const seg = `<div class="pf-seg" role="tablist" aria-label="Product">${Object.entries(PM).map(([k,p])=>`<button class="${S.product===k?'on':''}" onclick="pf.product('${k}')"><span class="dot" style="background:${p.color}"></span>${p.label}</button>`).join('')}</div>`;
  const selN = S.sel? S.sel.size : 0;
  const selBtn = v.mode!=='tc' ? `<div class="pf-dd"><button class="pf-ddbtn ${selN?'dark':''}" onclick="pf.pop(event,'sel')">${selN? `${selN} selected <span class="cnt">${selN}</span>` : `Select ${isEDL()?'agents':'TCs'}`}<span class="chev"></span></button>${S.pop==='sel'? selPop():''}</div>` : '';
  const info = `<div class="pf-dd"><button class="pf-ddbtn dark" onclick="pf.pop(event,'info')">Additional Info<span class="chev"></span></button>${S.pop==='info'? infoPop():''}</div>`;
  return `<div class="pf-head"><div class="pf-title"><div class="pf-ico">${ICON}</div><div>${crumbs}<h2>My Portfolio - Collection</h2><p>${esc(sub)}</p></div></div><div class="pf-head-r">${roles}${seg}${selBtn}${info}</div></div>`;
}
const ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><g fill="#5B4FE8"><rect x="10.6" y="1.5" width="2.8" height="7" rx="1.4"/><rect x="10.6" y="15.5" width="2.8" height="7" rx="1.4" opacity=".55"/><rect x="1.5" y="10.6" width="7" height="2.8" rx="1.4" opacity=".75"/><rect x="15.5" y="10.6" width="7" height="2.8" rx="1.4" opacity=".9"/><rect x="4.2" y="4.2" width="2.8" height="6" rx="1.4" transform="rotate(-45 5.6 7.2)" opacity=".6"/><rect x="17" y="13.8" width="2.8" height="6" rx="1.4" transform="rotate(-45 18.4 16.8)" opacity=".8"/></g></svg>`;
const CAL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;

function selPop(){
  const on=c=>!S.sel||S.sel.has(c); let body='';
  if(S.role==='sup' && !S.drillTL){ data().tls.forEach(t=>{ body+=`<div class="grp">${tlLabel(t.id)}</div>` + codesOfTL(t.id).map(c=>`<label><input type="checkbox" data-c="${c}" ${on(c)?'checked':''}> ${tcLabel(c)}</label>`).join(''); }); }
  else body = scopeCodes().map(c=>`<label><input type="checkbox" data-c="${c}" ${on(c)?'checked':''}> ${tcLabel(c)} <span class="pf-bk">${bktRange([c])}</span></label>`).join('');
  return `<div class="pf-pop" onclick="event.stopPropagation()" id="pfSelPop"><h4>Show ${isEDL()?'agents':'TCs'}</h4>${body}<div class="acts"><button class="pf-btn sm" onclick="pf.selAll()">Clear</button><button class="pf-btn sm pri" onclick="pf.selApply()">Apply</button></div></div>`;
}
function infoPop(){
  const P=meta();
  return `<div class="pf-pop" onclick="event.stopPropagation()" style="width:340px">
   <h4>Data in this prototype</h4>
   <p>Real ${P.label} numbers. Portfolio (cases, POS, overdue) is as of <b>20 Nov 2026</b> — the last day with complete dialler data (Acefone call logs stop after 20 Nov). ${P.cyc}.</p>
   <p>The date filter changes resolution and connectivity: resolved = left FWD in those dates and still resolved on 20 Nov; connected calls = calls in those dates; active PTP / dispositions = as of the end date.</p>
   <p>Names are masked: ${rn().tc}s, ${rn().tl}s and ${rn().sup}s show as codes. Customer ids are truncated.</p>
   <h4>Teams shown</h4><p>Borrow: 1 supervisor → 3 TLs → 37 TCs. CC: 1 supervisor → 2 TLs → 27 TCs. EDL: 1 ZRM → 6 mentors → 43 field agents.</p>
   <h4>Sources</h4><p>Collections MIS (Borrow, CC), bank_collections_mis (EDL), copsdb_gold.tele_call_log, collection_note, agent_detail.</p></div>`;
}
function datePop(){
  const P=meta(), st=P.start;
  const pre=[['Full cycle',st,LAST],[`Today (${dl(LAST)})`,LAST,LAST],[`Yesterday (${dl(LAST-1)})`,LAST-1,LAST-1],['Last 7 days',Math.max(st,LAST-6),LAST],['First 7 days',st,Math.min(LAST,st+6)]];
  const iso = d => `2026-11-${String(d).padStart(2,'0')}`;
  return `<div class="pf-pop" onclick="event.stopPropagation()" style="width:290px" id="pfDatePop">
    <h4>Resolution & connectivity period</h4>
    <div class="pf-presets">${pre.map(([l,a,b])=>`<button class="pf-fc ${S.from===a&&S.to===b?'on':''}" onclick="pf.range(${a},${b})">${l}</button>`).join('')}</div>
    <h4>Custom</h4>
    <div class="pf-dates"><label>From<input type="date" id="pfFrom" min="${iso(st)}" max="${iso(LAST)}" value="${iso(S.from)}"></label><label>To<input type="date" id="pfTo" min="${iso(st)}" max="${iso(LAST)}" value="${iso(S.to)}"></label></div>
    <div class="acts"><span class="pf-hint">Data available ${dl(st)} – ${dl(LAST)}</span><button class="pf-btn sm pri" onclick="pf.rangeApply()">Apply</button></div></div>`;
}

/* ---------- KPI strip ---------- */
function kpis(v){
  const m=M(v.codes), P=meta(), cc=P.kind==='cc', edl=P.kind==='edl';
  const tiles = [
    {l:'Total Cases', k:'pf.cases', v:fI(m.cases), s: v.mode==='tc'? `${bktRange(v.codes)} · as of 20 Nov` : `${unitTC(v.codes.length)} · ${bktRange(v.codes)}`},
    cc? {l:'Remaining Bill', k:'pf.rba', v:fR(m.od), s:`Min due ${fR(m.e1)} · POS ${fR(m.pos)}`} : {l:'Total POS', k:'pf.pos', v:fR(m.pos), s:`Overdue ${fR(m.od)} · 1 EMI ${fR(m.e1)}`},
    {l:'Cases Resolved', k:'pf.res', v:`${fI(m.res)} <span class="pf-pill nt">${fP(m.resPct)}</span>`, s: (cc? `Min due ${fI(m.mindue)} · Full due ${fI(m.full)}` : `Stab ${fI(m.stbl)} · Norm ${fI(m.norm)} · RB ${fI(m.rb)}`) + ` · ${rangeLbl()}`},
    {l:'POS Resolved', k:'pf.posres', v:`${fR(m.resPos)} <span class="pf-pill nt">${fP(m.posResPct)}</span>`, s:`of ${fR(m.pos)} POS · ${rangeLbl()}`},
    edl? {l:'Recovered', k:'pf.rec', v:fR(m.rec), s:`${rangeLbl()} · active PTP ${fI(m.ptp)} as of ${dl(S.to)}`} : {l:'Connected Calls', k:'pf.conncalls', v:fI(m.conn), s:`of ${fI(m.calls)} dialled · ${rangeLbl()} · active PTP ${fI(m.ptp)} as of ${dl(S.to)}`},
  ];
  return `<div class="pf-kpis"><dl>${tiles.map(t=>`<div class="pf-kpi"><dt>${t.l} ${ib(t.k)}</dt><dd>${t.v}</dd><div class="s">${esc(t.s)}</div></div>`).join('')}</dl></div>`;
}

/* ---------- tabs + date filter ---------- */
function tabs(v){
  const D=data(), P=meta();
  let mainLbl, cnt;
  if(v.mode==='tc'){ mainLbl='Assigned Cases'; cnt = (v.codes[0]===D.persona[0]) ? D.rowsTotal : M(v.codes).cases; }
  else if(v.mode==='tl'){ mainLbl= isEDL()?'My Agents':'My Team'; cnt=v.codes.length; }
  else { mainLbl='Teams'; cnt=`${D.tls.length} × ${v.codes.length}`; }
  const dbtn = `<div class="pf-dd"><button class="pf-ddbtn dark pf-datebtn ${isFull()?'':'act'}" onclick="pf.pop(event,'date')">${CAL} ${rangeLbl()}${isFull()?' · Full cycle':''}<span class="chev"></span></button>${S.pop==='date'? datePop():''}</div>`;
  return `<div class="pf-tabs"><div class="tl">
    <button class="pf-tab ${S.tab==='main'?'on':''}" onclick="pf.tab('main')">${mainLbl} <span class="c">${cnt}</span></button>
    <button class="pf-tab ${S.tab==='summary'?'on':''}" onclick="pf.tab('summary')">Summary</button></div>
    <div class="pf-tabs-r"><span class="pf-asof">Portfolio as of 20 Nov · ${P.cyc}</span>${dbtn}</div></div>`;
}

/* ---------- SUMMARY (same for every role, scoped) ---------- */
function summary(v){
  const P=meta(), m=M(v.codes), cc=P.kind==='cc';
  const rows = P.bkts.filter(b=>m.bk[b]);
  const head = cc
    ? [['Bucket',''],['Cases allocated','pf.cases'],['Remaining Bill Amt','pf.rba'],['Cases resolved','pf.res'],['POS resolved','pf.posres'],['Min Due users','pf.mindue'],['Full Due users','pf.fulldue']]
    : [['Bucket',''],['Cases allocated','pf.cases'],['POS allocated','pf.pos'],['Cases resolved','pf.res'],['POS resolved','pf.posres'],['Stab users','pf.stbl'],['Normalised users','pf.norm'],['Rollback users','pf.rb']];
  const line = (name,b,r,tot) => { r = r || (cc?[0,0,0,0]:[0,0,0,0,0]);
    const cells = cc
      ? [fI(b[0]), fR(b[2]), `${fI(r[0])}<span class="sub">${fP(b[0]?r[0]/b[0]:null)}</span>`, `${fR(r[1])}<span class="sub">${fP(b[1]?r[1]/b[1]:null)}</span>`, fI(r[2]), fI(r[3])]
      : [fI(b[0]), fR(b[1]), `${fI(r[0])}<span class="sub">${fP(b[0]?r[0]/b[0]:null)}</span>`, `${fR(r[1])}<span class="sub">${fP(b[1]?r[1]/b[1]:null)}</span>`, fI(r[2]), fI(r[3]), fI(r[4])];
    return `<tr class="${tot?'tot':''}"><td>${tot?'<b style="font-weight:500">Total</b>':`<span class="pf-bk">${name}</span>`}</td>${cells.map(c=>`<td class="r">${c}</td>`).join('')}</tr>`; };
  const totB = rows.reduce((a,b)=>add(a,m.bk[b]),null)||[0,0,0,0,0];
  const totR = rows.reduce((a,b)=>m.resBk[b]?add(a,m.resBk[b]):a,null);
  const bucketCard = `<div class="pf-card"><div class="pf-card-h"><h3>Portfolio by bucket <span class="hint">${scopeLabel(v)} · resolved ${rangeLbl()}</span></h3></div>
    <div class="pf-scroll"><table class="pf-t"><thead><tr>${head.map(([l,k],i)=>`<th class="${i?'r':''}">${l}${k?' '+ib(k):''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(b=>line(b,m.bk[b],m.resBk[b],false)).join('')}${line('',totB,totR,true)}</tbody></table></div></div>`;
  return bucketCard + connectivity(v,m);
}
function scopeLabel(v){ return v.mode==='tc'? tcLabel(v.codes[0]) : v.mode==='tl'? `${tlLabel(v.tl)} · ${unitTC(v.codes.length)}` : `${rn().sup} ${meta().sup} · ${unitTC(v.codes.length)}`; }

function connectivity(v,m){
  const P=meta();
  if(P.kind==='edl'){
    return `<div class="pf-card"><div class="pf-card-h"><h3>Recovery & PTP <span class="hint">field-collected — no dialler data</span></h3></div>
      <div class="pf-grid2">
        ${st('Recovered','pf.rec',fR(m.rec),rangeLbl())}
        ${st('Active PTP cases','pf.ptp',fI(m.ptp),`as of ${dl(S.to)}`)}
        ${st('Active PTP amount','pf.ptp',fR(m.ptpAmt),`as of ${dl(S.to)}`)}
        ${st('Recovered this cycle','pf.rec',fR(m.paid),'bank recovery_mtd, 8–20 Nov')}
      </div>
      <div class="pf-note">EDL agents are field officers: visits and dispositions are logged in mCollect, which is not in this dataset, so calls and disposition mix are not shown. <b>Ask:</b> bring mCollect feedback into the same disposition model.</div></div>`;
  }
  const tiles = `<div class="pf-grid2 g5">
    ${st('Connected calls','pf.conncalls',fI(m.conn),`of ${fI(m.calls)} dialled (${fP(m.connRate)}) · ${rangeLbl()}`)}
    ${st('Avg talk time / connected call','pf.avgtalk',fMSS(m.avgTalk),rangeLbl())}
    ${st('Total connected users','pf.contacted',fI(m.contacted),`${fP(m.contactedPct)} of ${fI(m.cases)} · to ${dl(S.to)}`)}
    ${st('Active PTP cases','pf.ptp',fI(m.ptp),`as of ${dl(S.to)}`)}
    ${m.ptp && !m.ptpAmtN ? st('Active PTP amount','pf.ptp','<span style="color:var(--g400)">Not captured</span>',`no amount entered on these ${fI(m.ptp)} PTPs`) : st('Active PTP amount','pf.ptp',fR(m.ptpAmt),`entered on ${fI(m.ptpAmtN)} of ${fI(m.ptp)} PTPs`)}
  </div>`;
  const cats = Object.entries(m.cats).sort((a,b)=>b[1]-a[1]);
  const tot = cats.reduce((s,[,n])=>s+n,0)||1; const max = cats.length? cats[0][1] : 1;
  const top = cats.slice(0,11), rest = cats.slice(11).reduce((s,[,n])=>s+n,0); if(rest) top.push(['Other',rest]);
  const col = k => k==='No disposition'? '#E5E7EB' : CONTACT.has(k)? '#6366F1' : NOCONTACT.has(k)? '#9CA3AF' : '#C7D2FE';
  const bars = top.map(([k,n])=>`<div class="pf-db"><div class="k" title="${esc(DISPO_NAME[k]||k)}">${esc(k)}${DISPO_NAME[k]&&!DISPO_NAME[k].startsWith(k)?`<small>${esc(DISPO_NAME[k])}</small>`:''}</div><div class="b"><i style="width:${(n/max*100).toFixed(1)}%;background:${col(k)}"></i></div><div class="v">${fI(n)}<small>${fP(n/tot)}</small></div></div>`).join('');
  return `<div class="pf-card"><div class="pf-card-h"><h3>Connectivity <span class="hint">${scopeLabel(v)} · ${rangeLbl()}</span></h3></div>${tiles}
    <div class="pf-dispo"><div class="pf-card-h" style="padding:0 0 8px;border:none"><h3 style="font-size:13px">Customers by latest disposition · as of ${dl(S.to)} ${ib('pf.dispo')}</h3>
      <div class="lg"><span><i style="background:#6366F1"></i>Contact</span><span><i style="background:#9CA3AF"></i>No contact</span><span><i style="background:#C7D2FE"></i>Other</span><span><i style="background:#E5E7EB"></i>No disposition</span></div></div>${bars}</div></div>`;
}
const st = (l,k,v,s) => `<div class="pf-st"><div class="l">${l} ${k?ib(k):''}</div><div class="v">${v}</div><div class="s">${esc(s)}</div></div>`;

/* ---------- TC MAIN: Assigned Cases (live format, compact) ---------- */
function rowsFor(code){ const D=data(); return code===D.persona[0] ? D.rows : null; }
const dayNum = s => parseInt(s,10);
function caseMatch(r){ const q=S.q.trim().toLowerCase(); return !q || String(r[0]).toLowerCase().includes(q); }
function cases(v){
  const m=M(v.codes), code=v.codes[0], rows=rowsFor(code), D=data(), cols=colsCases();
  const tools = `<div class="pf-tools">
     <button class="pf-sel" onclick="toast('Multi Allocation filter')">Multi Allocation<span class="chev"></span></button>
     <button class="pf-sel" onclick="toast('Tags filter')">Tags<span class="chev"></span></button>
     <button class="pf-sel" onclick="toast('Case Category filter')">Case Category<span class="chev"></span></button>
     <button class="pf-sel dark" onclick="toast('More filters')">More Filters<span class="chev"></span><span class="gdot"></span></button>
     <div class="pf-search">${SEARCH}<input placeholder="Filter by User Name or UUID" value="${esc(S.q)}" oninput="pf.q(this.value)"></div>
     <button class="pf-btn" onclick="toast('Refreshed')">⟳ Refresh Tickets</button></div>`;
  let body;
  if(!rows){
    body = `<div class="pf-empty"><b>Case list loads from the live API</b>This prototype carries the case list for ${tcLabel(D.persona[0])} only. In Spacce this tab calls the same Assigned Cases API for the selected ${rn().tc.toLowerCase()}.<br><br><button class="pf-btn" onclick="pf.tab('summary')">See ${tcLabel(code)}’s summary</button></div>`;
  } else {
    const fr = rows.filter(caseMatch); const per=10, pages=Math.max(1,Math.ceil(fr.length/per)); if(S.page>pages) S.page=pages;
    const pr = fr.slice((S.page-1)*per, S.page*per);
    body = `<div class="pf-scroll"><table class="pf-t flat"><thead><tr>${cols.map((c,i)=>`<th class="${c.r?'r':''} ${i===0?'stk':''}">${c.l}${c.k?' '+ib(c.k):''}</th>`).join('')}</tr></thead>
      <tbody>${pr.length? pr.map(r=>`<tr>${cols.map((c,i)=>`<td class="${c.r?'r':''} ${i===0?'stk mono':''}">${c.f(r,code)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}"><div class="pf-empty"><b>No matching cases</b>Clear the search to see all cases.</div></td></tr>`}</tbody></table></div>
      <div class="pf-pager"><span>Showing page <b>${S.page}</b> of <b>${S.q? pages : Math.ceil(D.rowsTotal/per)}</b> <span style="color:var(--g400)">· prototype loads a sample of ${rows.length} of ${fI(D.rowsTotal)} cases</span></span>
      <div class="pg"><button onclick="pf.page(-1)">‹</button>${Array.from({length:Math.min(pages,4)},(_,i)=>`<button class="${S.page===i+1?'on':''}" onclick="pf.page(0,${i+1})">${i+1}</button>`).join('')}<button onclick="pf.page(1)">›</button></div>
      <select onchange="toast('Rows per page')"><option>Show 10 rows</option><option>Show 25 rows</option><option>Show 50 rows</option></select></div>`;
  }
  return `<div class="pf-card"><div class="pf-card-h"><h3>Assigned Cases (${fI(rows? D.rowsTotal : m.cases)})</h3>${tools}</div>${body}</div>`;
}
const SEARCH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
function flowChip(f){ const s=String(f||'').toUpperCase(); const map={FWD:'fwd',STBL:'stbl',STABLE:'stable',NORM:'norm',RB:'rb',MINDUE_PAID:'mindue',PAID:'paid',UNPAID:'unpaid',PARTIAL_PAID:'partial'};
  const lbl={MINDUE_PAID:'MIN DUE',PARTIAL_PAID:'PARTIAL'}[s]||s; return `<span class="pf-ch ${map[s]||'cat'}">${esc(lbl)}</span>`; }
function catChip(c){ if(!c||c==='—') return '<span class="mut">—</span>'; return `<span class="pf-ch ${c==='PTP'?'ptp':'cat'}">${esc(c)}</span>`; }
const mask8 = s => `<span title="truncated for the public prototype">${esc(s)}…</span>`;
function colsCases(){
  const P=meta(), tc = c => `<span class="mut">tc.${c.toLowerCase()}@…</span>`, dash = () => '<span class="mut">—</span>';
  const act = `<button class="pf-go" onclick="openProfile()">View</button>`;
  if(P.kind==='edl') return [
    {l:'Loan A/C', f:r=>esc(r[0])},{l:'Agent Email', f:(r,c)=>tc(c)},{l:'User Name', f:()=>'<span class="mut">••••••</span>'},{l:'User Phone', f:()=>'<span class="mut">••••••••</span>'},
    {l:'Category', k:'pf.edlcat', f:r=>(r[7] && r[5]==='FWD' && dayNum(r[7])>=LAST)?catChip('PTP'):dash()},{l:'Outcome', f:r=>flowChip(r[5])},
    {l:'Overdue Amt', r:1, f:r=>fRF(r[4])},{l:'POS', k:'pf.pos', r:1, f:r=>fRF(r[3])},{l:'Profile Type', k:'pf.edlprod', f:r=>`<span class="mut">${esc(r[6])}</span>`},
    {l:'Bucket', f:r=>`<span class="pf-bk">${esc(r[1])}</span> <span class="mut">${r[2]}d</span>`},{l:'Tags', f:dash},{l:'Total Calls', k:'pf.edlfield', r:1, f:dash},{l:'Comments', f:dash},
    {l:'Last Dispo', k:'pf.edlfield', f:dash},{l:'Follow Up', k:'pf.edlfu', f:r=>r[7]?esc(r[7]):dash()},{l:'Multi Alloc', f:dash},
    {l:'PTP Amt', r:1, f:r=>r[8]?fRF(r[8]):dash()},{l:'Recovered MTD', r:1, f:r=>fRF(r[9])},{l:'Action', f:()=>act}];
  const cc = P.kind==='cc';
  return [
    {l:'UUID', f:r=>mask8(r[0])},{l:'Agent Email', f:(r,c)=>tc(c)},{l:'User Name', f:()=>'<span class="mut">••••••</span>'},{l:'User Phone', f:()=>'<span class="mut">••••••••</span>'},
    {l:'Category', k:'pf.cat', f:r=>catChip(r[9])},{l:'Outcome', f:r=>flowChip(r[3])},
    ...(cc? [{l:'Overdue Amt', k:'pf.ccod', r:1, f:r=>fRF(r[14])},{l:'Remaining Bill', k:'pf.rba', r:1, f:r=>fRF(r[4])},{l:'Min Due', r:1, f:r=>fRF(r[5])},{l:'POS', k:'pf.pos', r:1, f:r=>fRF(r[6])}]
          : [{l:'Overdue Amt', k:'pf.od', r:1, f:r=>fRF(r[4])},{l:'POS', k:'pf.pos', r:1, f:r=>fRF(r[5])}]),
    {l:'Profile Type', f:r=>esc(r[cc?7:6])},{l:'Bucket', f:r=>`<span class="pf-bk">${esc(r[1])}</span>`},{l:'Tags', f:dash},
    {l:'Total Calls', k:'pf.totalcalls', r:1, f:r=>fI(r[11])},{l:'Comments', f:dash},
    {l:cc?'Best Dispo':'Last Dispo', k:cc?'pf.bdisp':'pf.ldisp', f:r=>esc(r[8]||'—')},{l:'Follow Up', f:r=>r[10]?esc(r[10]):dash()},
    {l:'Multi Alloc', f:r=>r[13]?'Multi':'Single'},{l:'Action', f:()=>act}];
}

/* ---------- TL / SUPERVISOR MAIN: same business metrics as the TC view, aggregated ---------- */
function teamCols(){
  const P=meta(), cc=P.kind==='cc', edl=P.kind==='edl';
  const G1='Portfolio · as of 20 Nov', G2=`Resolution · ${rangeLbl()}`, G3= edl? `Recovery · ${rangeLbl()}` : `Connectivity · ${rangeLbl()}`, G4=`PTP · as of ${dl(S.to)}`;
  const ptpCell = (v,m) => m.ptp? `${fI(m.ptp)}${m.ptpAmt?`<span class="sub">${fR(m.ptpAmt)}</span>`:''}` : '<span class="mut">0</span>';
  return [
    {k:'cases',l:edl?'Loans':'Cases',g:G1,f:fI,info:'pf.cases'},
    {k:'od',l:cc?'Remaining Bill':'Overdue Amt',g:G1,f:fR,info:cc?'pf.rba':'pf.od'},
    {k:'e1',l:cc?'Min Due Amt':'1 EMI Amt',g:G1,f:fR,info:cc?'pf.mda':'pf.e1'},
    {k:'pos',l:'POS',g:G1,f:fR,info:'pf.pos'},
    {k:'res',l:'Cases Res.',g:G2,f:(v,m)=>`${fI(m.res)}<span class="sub">${fP(m.resPct)}</span>`,info:'pf.res',csv:[['Cases resolved','res'],['Cases resolved %','resPct',1]]},
    {k:'resPos',l:'POS Res.',g:G2,f:(v,m)=>`${fR(m.resPos)}<span class="sub">${fP(m.posResPct)}</span>`,info:'pf.posres',csv:[['POS resolved','resPos'],['POS resolved %','posResPct',1]]},
    ...(cc? [{k:'mindue',l:'Min Due Res.',g:G2,f:fI,info:'pf.mindue'},{k:'full',l:'Full Due Res.',g:G2,f:fI,info:'pf.fulldue'}]
          : [{k:'stbl',l:'Stab',g:G2,f:fI,info:'pf.stbl'},{k:'norm',l:'Norm',g:G2,f:fI,info:'pf.norm'},{k:'rb',l:'Rollback',g:G2,f:fI,info:'pf.rb'}]),
    edl? {k:'rec',l:'Recovered',g:G3,f:fR,info:'pf.rec'} : {k:'conn',l:'Connected Calls',g:G3,f:(v,m)=>`${fI(m.conn)}<span class="sub">of ${fI(m.calls)}</span>`,info:'pf.conncalls',csv:[['Connected calls','conn'],['Calls dialled','calls']]},
    {k:'ptp',l:'Active PTP',g:G4,f:ptpCell,info:'pf.ptp',csv:[[`Active PTP (as of ${dl(S.to)})`,'ptp'],['Active PTP amount','ptpAmt']]},
  ];
}
function team(v){
  const cols=teamCols();
  const tcMs = v.codes.map(c=>Object.assign(M([c]),{code:c}));
  const q=S.q.trim().toLowerCase().replace(/^(tc|agent)\s*/,'');
  const passes = m => !q || m.code.toLowerCase().includes(q);
  const sorter = (a,b) => { if(!S.sort.k) return a.code.localeCompare(b.code); const x=a[S.sort.k], y=b[S.sort.k]; return ((x==null?-Infinity:x)-(y==null?-Infinity:y))*S.sort.d || a.code.localeCompare(b.code); };
  const grp = []; cols.forEach(c=>{ const last=grp[grp.length-1]; if(last&&last.g===c.g) last.n++; else grp.push({g:c.g,n:1}); });
  const thead = `<thead><tr class="grp"><th class="stk"></th>${grp.map(g=>`<th colspan="${g.n}" class="g">${esc(g.g)}</th>`).join('')}<th></th></tr>
    <tr><th class="stk sort ${S.sort.k==null?'sorted':''}" onclick="pf.sort(null)">${isEDL()?'Agent':'TC'}</th>${cols.map(c=>`<th class="r sort ${S.sort.k===c.k?'sorted':''}" onclick="pf.sort('${c.k}')">${c.l}${c.info?' '+ib(c.info):''}<span class="ar">${S.sort.k===c.k?(S.sort.d>0?'▲':'▼'):'⇅'}</span></th>`).join('')}<th></th></tr></thead>`;
  const tcRow = m => `<tr class="tcrow" onclick="pf.drillTC('${m.code}')" title="Open ${tcLabel(m.code)}’s portfolio"><td class="stk"><span class="tcn">${tcLabel(m.code)} <span class="pf-bk">${bktRange([m.code])}</span></span></td>${cols.map(c=>`<td class="r">${c.f(m[c.k],m)}</td>`).join('')}<td><span class="pf-go">›</span></td></tr>`;
  const aggRow = (label, codes, cls, onclick, caret) => { const m=M(codes); return `<tr class="${cls}" ${onclick?`onclick="${onclick}"`:''}><td class="stk">${caret||''}${label}</td>${cols.map(c=>`<td class="r">${c.f(m[c.k],m)}</td>`).join('')}<td></td></tr>`; };
  let tbody='';
  if(v.mode==='tl'){
    tbody = aggRow(`Team total · ${unitTC(v.codes.length)}`, v.codes, 'tot') + tcMs.filter(passes).sort(sorter).map(tcRow).join('');
  } else {
    tbody = aggRow(`All teams · ${unitTC(v.codes.length)}`, v.codes, 'tot');
    data().tls.forEach(t=>{ const codes=v.codes.filter(c=>tlOf(c)===t.id); if(!codes.length) return; const open = S.expanded[t.id]!==false;
      const rows = tcMs.filter(m=>codes.includes(m.code)&&passes(m)).sort(sorter);
      tbody += aggRow(`${tlLabel(t.id)} <span class="pf-bk">${bktRange(codes)}</span> <span class="sub">${unitTC(codes.length)}</span> <a class="pf-lnk" onclick="event.stopPropagation();pf.drillTL('${t.id}')">open ›</a>`, codes, 'tlrow', `pf.toggle('${t.id}')`, `<span class="caret">${open?'▾':'▸'}</span>`);
      if(open) tbody += rows.map(tcRow).join('');
    });
  }
  const toolbar = `<div class="pf-card-h"><h3>${v.mode==='sup'? `${isEDL()?'Mentor':'TL'} × ${isEDL()?'agent':'TC'} portfolio` : `${isEDL()?'Agents':'TCs'} in ${tlLabel(v.tl)}`} <span class="hint">click a row to open that ${isEDL()?'agent':'TC'}’s portfolio</span></h3>
    <div class="pf-tools">
    ${v.mode==='sup'?`<button class="pf-btn sm" onclick="pf.expandAll()">${Object.values(S.expanded).some(x=>x===false)?'Expand all':'Collapse all'}</button>`:''}
    <div class="pf-search" style="width:170px">${SEARCH}<input placeholder="Find ${isEDL()?'agent':'TC'} (e.g. C06)" value="${esc(S.q)}" oninput="pf.q(this.value)"></div>
    <button class="pf-btn sm" onclick="downloadPortfolio()">⤓ Download</button></div></div>`;
  return `<div class="pf-card">${toolbar}<div class="pf-scroll"><table class="pf-t">${thead}<tbody>${tbody}</tbody></table></div>
    <div class="pf-note">Portfolio columns are as of 20 Nov. Resolution counts customers who left FWD between ${rangeLbl()} and are still resolved; ${isEDL()?'recovery is summed over the same dates':'connected calls are summed over the same dates'}; active PTP is as of ${dl(S.to)}. Change the dates with the filter above.</div></div>`;
}

/* ---------- actions ---------- */
const reset = () => { S.drillTC=null; S.drillTL=null; S.sel=null; S.sort={k:null,d:-1}; S.q=''; S.page=1; S.pop=null; S.expanded={}; };
window.pf = {
  role(r){ S.role=r; reset(); S.tab='main'; render(); },
  product(p){ S.product=p; reset(); S.from=meta().start; S.to=LAST; render(); },
  tab(t){ S.tab=t; S.pop=null; render(); },
  home(){ if(S.drillTL) S.sel=null; S.drillTC=null; S.drillTL=null; S.tab='main'; S.q=''; render(); },
  drillTL(t){ S.drillTL=t; S.drillTC=null; S.sel=null; S.q=''; S.tab='main'; render(); window.scrollTo({top:0,behavior:'smooth'}); },
  drillTC(c){ S.drillTC=c; S.tab= c===data().persona[0]?'main':'summary'; S.q=''; S.page=1; render(); window.scrollTo({top:0,behavior:'smooth'}); },
  sort(k){ if(S.sort.k===k) S.sort.d*=-1; else { S.sort.k=k; S.sort.d=-1; } render(); },
  toggle(t){ S.expanded[t] = S.expanded[t]===false; render(); },
  expandAll(){ const anyClosed=Object.values(S.expanded).some(x=>x===false); data().tls.forEach(t=>S.expanded[t.id]= anyClosed? true:false); render(); },
  q(val){ S.q=val; S.page=1; const pos=document.activeElement&&document.activeElement.selectionStart; render(); const el=[...document.querySelectorAll('#pfRoot .pf-search input')].pop(); if(el){ el.focus(); try{el.setSelectionRange(pos,pos);}catch(e){} } },
  page(d,abs){ const rows=rowsFor(view().codes[0])||[]; const pages=Math.max(1,Math.ceil(rows.filter(caseMatch).length/10)); S.page = abs || S.page+d; if(S.page<1) S.page=1; if(S.page>pages){ S.page=pages; toast(`Prototype loads a sample of ${rows.length} cases`); } render(); },
  pop(e,k){ e.stopPropagation(); S.pop = S.pop===k? null : k; render(); },
  selAll(){ S.sel=null; S.pop=null; render(); },
  selApply(){ const boxes=[...document.querySelectorAll('#pfSelPop input[type=checkbox]')]; const on=boxes.filter(b=>b.checked).map(b=>b.dataset.c); if(!on.length){ toast(`Select at least one ${isEDL()?'agent':'TC'}`); return; } S.sel = on.length===boxes.length? null : new Set(on); S.pop=null; render(); },
  range(a,b){ S.from=a; S.to=b; S.pop=null; render(); },
  rangeApply(){ const st=meta().start; const pd = id => { const v=(document.getElementById(id)||{}).value||''; const d=parseInt(v.slice(8,10),10); return (v.slice(0,7)==='2026-11' && d)? Math.min(LAST,Math.max(st,d)) : null; };
    const rd = id => { const v=(document.getElementById(id)||{}).value||''; return v.slice(0,7)==='2026-11'? parseInt(v.slice(8,10),10) : NaN; };
    let ra=rd('pfFrom'), rb2=rd('pfTo'); if(ra>rb2) [ra,rb2]=[rb2,ra];
    if(!(ra<=LAST && rb2>=st)){ toast(`Pick dates between ${dl(st)} and ${dl(LAST)}`); return; }
    let a=pd('pfFrom'), b=pd('pfTo'); if(a>b) [a,b]=[b,a]; S.from=a; S.to=b; S.pop=null; render(); },
};
document.addEventListener('click', e=>{ if(S.pop && !e.target.closest('.pf-pop')){ S.pop=null; render(); } });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && S.pop){ S.pop=null; render(); } });

/* ---------- role-aware download ---------- */
window.downloadPortfolio = function(){
  const v=view(); let rows, name;
  if(v.mode==='tc'){ const r=rowsFor(v.codes[0]);
    if(!r){ toast('Case list download comes from the live API'); return; }
    const cols=colsCases().filter(c=>c.l!=='Action'); const strip=h=>String(h).replace(/<[^>]+>/g,'').replace(/…$/,'').replace(/,/g,'');
    rows=[cols.map(c=>c.l)].concat(r.map(x=>cols.map(c=>{ const s=strip(c.f(x,v.codes[0])); return c.r? s.replace(/[₹\s]/g,'').replace(/^—$/,'') : s; })));
    name=`assigned_cases_${S.product}_${v.codes[0]}.csv`;
  } else {
    const F=[]; teamCols().forEach(c=>{ if(c.csv) c.csv.forEach(x=>F.push(x)); else F.push([c.l,c.k]); });
    const raw = (m,[,k,pct]) => { const x=m[k]; if(x==null||(typeof x==='number'&&!isFinite(x))) return ''; if(typeof x!=='number') return String(x).replace(/,/g,' '); return pct? (x*100).toFixed(2) : (Number.isInteger(x)? x : x.toFixed(2)); };
    rows=[[rn().tl, rn().tc].concat(F.map(f=>f[0]))].concat(v.codes.map(c=>{ const m=M([c]); return [tlLabel(tlOf(c)), tcLabel(c)].concat(F.map(f=>raw(m,f))); }));
    name=`${v.mode==='tl'?'team':'org'}_portfolio_${S.product}_${S.from}-${S.to}nov.csv`;
  }
  const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
  toast(`Downloaded ${name}`);
};

render();
})();
