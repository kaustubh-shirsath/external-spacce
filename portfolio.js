/* =========================================================================
   Agent Portfolio v2 — role-aware (TC / TL / Supervisor), product-level.
   Data: window.PF_DATA (portfolio-data.js) — real, masked, as of 20 Nov 2026.
   ========================================================================= */
(function(){
const D0 = window.PF_DATA;
const ASOF = '20 Nov';
const BKT_LOAN = ['Bkt 0','Bkt 1','Bkt 2','Bkt 3','Bkt 4','Bkt 5','Bkt 6','Bkt 6+'];
const BKT_EDL = ['SMA - 0','SMA - 1','SMA - 2','SS - 1','SS - 2','SS - 3','180+'];
const PM = {
  borrow:{label:'Borrow', color:'#2563EB', kind:'loan', bkts:BKT_LOAN, start:'6 Nov', cyc:'Cycle 6 Nov → 5 Dec', sup:'S1', calls:true, delta:true,
          rn:{tc:'TC',tl:'TL',sup:'Supervisor'}},
  cc:{label:'Credit Card', color:'#059669', kind:'cc', bkts:BKT_LOAN, start:'1 Nov', cyc:'Calls & dispositions from 1 Nov', sup:'S2', calls:true, delta:true,
          rn:{tc:'TC',tl:'TL',sup:'Supervisor'}},
  edl:{label:'EDL', color:'#7C3AED', kind:'edl', bkts:BKT_EDL, start:'1 Nov', cyc:'Bank MIS, month to date', sup:'Z1', calls:false, delta:false,
          rn:{tc:'Field agent',tl:'Mentor',sup:'ZRM'}},
};
const CONTACT = new Set(['PTP','CB','PAID','RTP','DISPUTE','Payment Inquiry','CPTP','BPTP','PP','DECEASED','CLAIMS_PAID','LINK_GENERATED']);
const NOCONTACT = new Set(['RNR','NC','Voicemail','LM','SKIP','WN','WRONG_NUMBER']);
const DISPO_NAME = {RNR:'Ringing, no response',NC:'Not contactable',CB:'Call back',PTP:'Promise to pay',PAID:'Says paid',Voicemail:'Voicemail',LM:'Left message',RTP:'Refused to pay',
  'Payment Inquiry':'Payment inquiry',BPTP:'Broken PTP',CPTP:'Confirmed PTP',PP:'Part payment',DECEASED:'Deceased',LINK_GENERATED:'Link generated',RTF:'RTF',ER:'ER',RANDOM:'Random','No disposition':'No disposition yet'};

/* ---------- state ---------- */
const S = { role:'tc', product:'borrow', tab:'main', drillTC:null, drillTL:null, sel:null, sort:{k:null,d:1}, filt:'all', q:'', caseChip:null, page:1, expanded:{}, pop:null, drawer:null };

/* ---------- formatting ---------- */
const nz = v => (v==null||isNaN(v)) ? 0 : v;
const fI = v => v==null||isNaN(v) ? '—' : Math.round(v).toLocaleString('en-IN');
const fR = v => { if(v==null||isNaN(v)) return '—'; const a=Math.abs(v); if(a>=1e7) return '₹'+(v/1e7).toFixed(2)+'Cr'; if(a>=1e5) return '₹'+(v/1e5).toFixed(2)+'L'; if(a>=1e3) return '₹'+(v/1e3).toFixed(1)+'K'; return '₹'+Math.round(v); };
const fRF = v => v==null||isNaN(v) ? '—' : '₹'+Math.round(v).toLocaleString('en-IN');
const fP = v => v==null||!isFinite(v) ? '—' : (v*100).toFixed(1)+'%';
const fPP = v => v==null||!isFinite(v) ? '—' : (v>0?'+':'')+(v*100).toFixed(1)+' pp';
const fDur = s => { if(!s) return '0m'; const h=Math.floor(s/3600), m=Math.round((s%3600)/60); return h? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m`; };
const fMSS = s => { if(s==null||!isFinite(s)) return '—'; const m=Math.floor(s/60), x=Math.round(s%60); return `${m}:${String(x).padStart(2,'0')}`; };
const fMin = m => m==null ? '—' : (m>=60 ? `${Math.floor(m/60)}h ${String(Math.round(m%60)).padStart(2,'0')}m` : `${Math.round(m)}m`);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const add = (a,b) => a ? a.map((x,i)=>nz(x)+nz(b[i])) : b.map(nz);

/* ---------- data helpers ---------- */
const meta = () => PM[S.product];
const data = () => D0[S.product];
const rn = () => meta().rn;
const allCodes = () => Object.keys(data().tcs).sort();
const tlOf = c => data().tcs[c].tl;
const codesOfTL = tl => allCodes().filter(c=>tlOf(c)===tl);
const tcLabel = c => `${S.product==='edl'?'Agent':'TC'} ${c}`;
const tlLabel = t => `${S.product==='edl'?'Mentor':'TL'} ${t}`;
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
function scopeCodes(){ // codes available in the Select TCs list (before selection)
  const D=data(); if(S.role==='tl' || S.drillTL) return codesOfTL(S.drillTL||D.persona[1]); return allCodes(); }

/* ---------- aggregation ---------- */
function agg(codes){
  const D=data(); const A={k:codes.length, bk:{}, t:null, d:[0,0,0,0], a:new Array(12).fill(0), gap:null, first:null, last:null, act:0, nc:{}, ns:new Array(9).fill(0), p:new Array(6).fill(0)};
  codes.forEach(c=>{ const x=D.tcs[c];
    Object.entries(x.b).forEach(([b,v])=>{ A.bk[b]=add(A.bk[b],v); A.t=add(A.t,v); });
    if(x.d) A.d=add(A.d,x.d);
    if(x.a){ for(let i=0;i<12;i++) A.a[i]+=nz(x.a[i]); if(x.a[6]>0) A.act++;
      if(x.a[12]!=null) A.gap=Math.max(A.gap||0,x.a[12]);
      if(x.a[13]) A.first = !A.first||x.a[13]<A.first ? x.a[13] : A.first;
      if(x.a[14]) A.last = !A.last||x.a[14]>A.last ? x.a[14] : A.last; }
    if(x.n){ Object.entries(x.n.c).forEach(([k,v])=>A.nc[k]=(A.nc[k]||0)+v); A.ns=add(A.ns,x.n.s); }
    if(x.p) A.p=add(A.p,x.p);
  });
  if(!A.t) A.t=new Array(10).fill(0);
  return A;
}
function M(codes){
  const A=agg(codes), kind=meta().kind, D=data(), t=A.t; const m={A, k:codes.length};
  if(kind==='cc'){ Object.assign(m,{cases:t[0],pos:t[1],rba:t[2],mda:t[3],res:t[4],resPos:t[5],mindue:t[6],full:t[7],partial:t[8],paid:t[9]}); }
  else { Object.assign(m,{cases:t[0],pos:t[1],res:t[2],resPos:t[3],stbl:t[4],norm:t[5],rb:t[6],od:t[7],paid:kind==='edl'?A.p[4]:t[8]}); }
  m.fwd = m.cases - m.res;
  m.resPct = m.cases? m.res/m.cases : null; m.posResPct = m.pos? m.resPos/m.pos : null;
  // same-bucket benchmark (all telecalling TCs in the product)
  let exp=0, expP=0; const ri = kind==='cc'?3:2, rpi = kind==='cc'?4:3;
  Object.entries(A.bk).forEach(([b,v])=>{ const bb=D.bench[b]; if(!bb||!bb[0]) return; exp += v[0]*(bb[ri]/bb[0]); expP += v[1]*(bb[1]? bb[rpi]/bb[1] : 0); });
  m.exp = m.cases? exp/m.cases : null; m.vsBench = (m.resPct!=null && m.exp!=null)? m.resPct-m.exp : null;
  m.expPos = m.pos? expP/m.pos : null;
  // resolved today / yesterday
  [m.resD,m.resDPos,m.resY,m.resYPos]=A.d;
  // dialler
  const a=A.a; Object.assign(m,{callsC:a[0],manC:a[1],pdC:a[2],connC:a[3],talkC:a[4],days:a[5],callsD:a[6],manD:a[7],pdD:a[8],connManD:a[9],connPdD:a[10],talkD:a[11],gap:A.gap,first:A.first,last:A.last,activeTCs:A.act});
  m.connD = m.connManD + m.connPdD;
  m.connRate = m.callsC? m.connC/m.callsC : null; m.avgTalk = m.connC? m.talkC/m.connC : null; m.callsPerCase = m.cases? m.callsC/m.cases : null;
  // dispositions & PTP
  if(kind==='edl'){ [m.ptpAct,m.ptpAmt,m.ptpToday,m.ptpBroken,m.recMtd,m.recFtd]=A.p; m.ptpAmtN=null; }
  else { const s=A.ns; Object.assign(m,{contacted:s[0],ptpAct:s[1],ptpAmt:s[2],ptpAmtN:s[3],ptpToday:s[4],ptpBroken:s[5],ptpKept:s[6],fuToday:s[7],untouched:s[8]}); m.contactedPct = m.cases? m.contacted/m.cases : null; }
  m.span = m.first? `${m.first}–${m.last}` : '—';
  return m;
}
function median(arr){ const a=arr.filter(v=>v!=null&&isFinite(v)).sort((x,y)=>x-y); if(!a.length) return null; const h=Math.floor(a.length/2); return a.length%2? a[h] : (a[h-1]+a[h])/2; }

/* ---------- flags (what needs a TL's attention) ---------- */
function teamStats(codes){ const ms=codes.map(c=>M([c])); return {medCallsD: median(ms.filter(m=>m.callsD>0).map(m=>m.callsD)), medConn: median(ms.map(m=>m.connRate))}; }
function flagsOf(c, ts){
  const m=M([c]), f=[], P=meta();
  if(m.cases<50 && P.kind!=='edl') f.push({k:'small',s:0,t:`Small book (${m.cases} cases)`,e:'New, part-time or moved out — benchmark flags skipped'});
  if(P.calls){
    if(m.callsD===0 && m.cases>=minBook()) f.push({k:'nocall',s:3,t:`No calls logged on ${ASOF}`,e:'On leave, or dialler login / sync issue — check attendance'});
    else if(m.gap>=120) f.push({k:'idle',s:2,t:`${fMin(m.gap)} longest gap between calls`,e:`Calls ${m.span} · ${m.callsD} calls`});
    if(m.callsD>0 && ts.medCallsD && m.callsD < 0.5*ts.medCallsD && m.cases>=minBook()) f.push({k:'lowcalls',s:2,t:`${m.callsD} calls vs TL team median ${Math.round(ts.medCallsD)}`,e:'Less than half the dialling of their own TL’s team'});
  }
  if(m.cases>=minBook() && m.vsBench!=null && m.vsBench<=-0.03) f.push({k:'bench',s:2,t:`Resolution ${fP(m.resPct)} vs ${fP(m.exp)} benchmark`,e:`${fPP(m.vsBench)} against same-bucket TCs`});
  if(P.kind!=='edl'){
    if(m.fwd>=20 && m.untouched/m.fwd>=0.4) f.push({k:'untouched',s:2,t:`${m.untouched} unresolved customers never dispositioned`,e:`${fP(m.untouched/m.fwd)} of unresolved book since ${P.start}`});
    if(m.ptpBroken>=25) f.push({k:'broken',s:1,t:`${m.ptpBroken} broken PTPs`,e:'PTP date passed, still unresolved — re-engage'});
  } else {
    if(m.cases>=5 && m.res===0) f.push({k:'nores',s:2,t:'No resolution this month',e:`${m.cases} overdue loans, none normalised or stabilised`});
    if(m.ptpBroken>=2) f.push({k:'broken',s:1,t:`${m.ptpBroken} broken PTPs`,e:'PTP date passed, still unresolved'});
  }
  return f;
}
const sev = f => f.reduce((s,x)=>Math.max(s,x.s),0);
const minBook = () => meta().kind==='edl' ? 10 : 50;

/* ---------- info tooltips ---------- */
Object.assign(INFO, {
  'pf.cases':{t:'Total Cases', f:'Allocated cases on the MIS date (one row per customer).\nBorrow: current_month_collections_mis · CC: current_month_collections_mis_cc (COUNT DISTINCT uuid) · EDL: bank_collections_mis, bucket ≠ Standard.'},
  'pf.pos':{t:'Total POS', f:'SUM(pos) — principal outstanding, ₹. EDL: principal_outstanding.'},
  'pf.rba':{t:'Remaining Bill', f:'SUM(remaining_bill_amount) — full payoff on the current CC bill, ₹ (MIS already in ₹).'},
  'pf.res':{t:'Resolution Rate', f:"Borrow: current_flow ≠ FWD (NORM + STBL + RB)\nCC: status ∈ {MINDUE_PAID, PAID}\nEDL: outcome ≠ FWD", n:'Cumulative since cycle start. Cases basis; POS basis shown alongside.'},
  'pf.bench':{t:'vs Benchmark', f:'Actual resolution − expected resolution.\nExpected = Σ cases per bucket × that bucket’s resolution across ALL telecalling TCs in the product, ÷ cases.', n:'TLs own 1–3 buckets each, so raw resolution is not comparable across teams. This compares every TC/TL to the same-bucket average.'},
  'pf.today':{t:'Resolved Today', f:'Customers resolved on the MIS date who were FWD the day before (MIS D vs D−1). Yesterday = D−1 vs D−2.'},
  'pf.paid':{t:'Amount Collected', f:'Borrow/CC: SUM(paid_amount) this cycle. EDL: SUM(recovery_mtd).'},
  'pf.calls':{t:'Calls (dialler)', f:'copsdb_gold.tele_call_log, vendors Acefone + Ameyo, matched on agent login.\nManual = outbound.manual.dial · PD = outbound.auto.dial.', n:`Day columns are ${ASOF} (last day with complete Acefone data).`},
  'pf.conn':{t:'Connected', f:"call_status ∈ {answered, CONNECTED}."},
  'pf.talk':{t:'Talk time', f:'SUM(call_duration) of connected calls (seconds in source).'},
  'pf.gap':{t:'Max gap', f:'Longest gap between two consecutive calls on the day — proxy for idle time.'},
  'pf.connrate':{t:'Connect %', f:'Connected calls ÷ calls dialled, cycle to date.'},
  'pf.avgtalk':{t:'Avg talk', f:'Talk time ÷ connected calls, cycle to date (m:ss).'},
  'pf.contacted':{t:'Connected users', f:'Customers with at least one contact disposition from a TC this cycle (PTP, CB, PAID, RTP, DISPUTE, Payment Inquiry, CPTP, BPTP, PP, DECEASED …) — copsdb_gold.collection_note.', n:'Acefone manual dials carry no customer id, so per-customer connects come from dispositions, not the dialler.'},
  'pf.untouched':{t:'Not dispositioned', f:'Unresolved customers with no TC disposition since cycle start.'},
  'pf.ptp':{t:'Active PTP', f:'Latest PTP date ≥ today and customer still unresolved. Amount = amountpromised (captured on some PTPs only).', n:'EDL: ptp_date / ptp_amount from bank_collections_mis.'},
  'pf.ptptoday':{t:'PTP due today', f:'Latest PTP date = today, still unresolved.'},
  'pf.broken':{t:'Broken PTP', f:'Latest PTP date has passed and customer is still unresolved.'},
  'pf.dispo':{t:'Disposition mix', f:'Distinct customers by their LATEST TC disposition category this cycle (copsdb_gold.collection_note, TC notes only — AI/auto notes excluded).'},
  'pf.totalcalls':{t:'Total Calls', f:'Dispositions logged by TCs on this customer this cycle (each manual call is disposed).', n:'MIS calls_count is empty and Acefone manual dials have no customer id, so dialler counts can’t be joined per customer yet.'},
  'pf.cat':{t:'Category', f:'Latest TC disposition category this cycle (collection_note.category_code).'},
  'pf.ldisp':{t:'Last Disposition', f:'MIS latest_disposition (includes AI / auto-dial outcomes; Category shows the latest TC disposition).'},
  'pf.bdisp':{t:'Best Disposition', f:'CC MIS best_disposition — the best outcome reached on this bill, not the latest. Category shows the latest TC disposition.'},
  'pf.ccod':{t:'Overdue Amt', f:'CC MIS principal_overdue.', n:'In today’s CC MIS this equals POS for every bill — Min Due is the amount that actually clears the overdue.'},
  'pf.edlcat':{t:'Category', f:'EDL has no TC dispositions in this data. Shows PTP when bank MIS ptp_date ≥ today and the loan is still FWD.'},
  'pf.edlprod':{t:'Profile Type', f:'EDL: product_name from bank_collections_mis (edl_inventory / edl_migrated / …).'},
  'pf.edlfield':{t:'Field data', f:'EDL is field-collected; visits and dispositions live in mCollect, not in this dataset.'},
  'pf.edlfu':{t:'Follow Up', f:'EDL: ptp_date from bank_collections_mis.'},
  'pf.stbl':{t:'Stab users', f:"Borrow: current_flow = STBL · EDL: outcome = Stable."},
  'pf.norm':{t:'Normalised users', f:"Borrow: current_flow = NORM · EDL: outcome = Norm."},
  'pf.rb':{t:'Rollback users', f:"Borrow: current_flow = RB · EDL: outcome = RB."},
  'pf.mindue':{t:'Min Due users', f:'status = MINDUE_PAID (min due cleared, bill not fully paid).'},
  'pf.fulldue':{t:'Full Due users', f:'status = PAID (bill fully paid).'},
});

/* ---------- top-level render ---------- */
function render(){
  const root=document.getElementById('pfRoot'); if(!root) return;
  const v=view();
  root.innerHTML = head(v) + kpis(v) + tabs(v) + `<div class="pf-body">${S.tab==='summary'? summary(v) : (v.mode==='tc'? cases(v) : team(v))}</div>` + drawer();
  renderRoles();
}
window.pfRender = render;

function renderRoles(){
  const u=document.getElementById('pfUser'); const D=data();
  if(u) u.innerHTML = `<span class="avatar"></span>${S.role==='tc'? tcLabel(D.persona[0]) : S.role==='tl'? tlLabel(D.persona[1]) : rn().sup+' '+meta().sup}`;
}

/* ---------- header ---------- */
function head(v){
  const P=meta(), D=data();
  let sub, crumbs='';
  if(v.mode==='tc') sub = S.drillTC ? `${rn().tc} view · ${tlLabel(v.tl)} · ${bktRange(v.codes)}` : (S.product==='edl'? 'Field agent personal dashboard (EDL is field-collected)' : 'Collection agents personal dashboard');
  else if(v.mode==='tl') sub = `${S.product==='edl'?'Mentor':'Team lead'} dashboard · ${tlLabel(v.tl)} · ${codesOfTL(v.tl).length} ${S.product==='edl'?'agents':'TCs'} · ${bktRange(codesOfTL(v.tl))}`;
  else sub = `${rn().sup} dashboard · ${D.tls.length} ${S.product==='edl'?'mentors':'TLs'} · ${allCodes().length} ${S.product==='edl'?'agents':'TCs'}`;
  if(S.drillTC || S.drillTL){
    const parts=[]; const homeLbl = S.role==='sup' ? 'Teams' : 'My Team';
    parts.push(`<a onclick="pf.home()">${homeLbl}</a>`);
    if(S.role==='sup' && (S.drillTL || S.drillTC)){ const tl=S.drillTL||tlOf(S.drillTC); parts.push(S.drillTC? `<a onclick="pf.drillTL('${tl}')">${tlLabel(tl)}</a>` : `<span>${tlLabel(tl)}</span>`); }
    if(S.drillTC) parts.push(`<span>${tcLabel(S.drillTC)}</span>`);
    crumbs = `<div class="pf-crumb">${parts.join('<span>/</span>')}</div>`;
  }
  const seg = `<div class="pf-seg" role="tablist" aria-label="Product">${Object.entries(PM).map(([k,p])=>`<button class="${S.product===k?'on':''}" onclick="pf.product('${k}')"><span class="dot" style="background:${p.color}"></span>${p.label}</button>`).join('')}</div>`;
  const selN = S.sel? S.sel.size : 0;
  const selBtn = v.mode!=='tc' || S.drillTC ? `<div class="pf-dd"><button class="pf-ddbtn ${selN?'dark':''}" onclick="pf.pop(event,'sel')">${selN? `${selN} selected <span class="cnt">${selN}</span>` : `Select ${S.product==='edl'?'agents':'TCs'}`}<span class="chev"></span></button>${S.pop==='sel'? selPop():''}</div>` : '';
  const info = `<div class="pf-dd"><button class="pf-ddbtn dark" onclick="pf.pop(event,'info')">Additional Info<span class="chev"></span></button>${S.pop==='info'? infoPop():''}</div>`;
  const roles = `<div class="pf-roles" title="Prototype: switch the logged-in role"><span class="lbl">VIEW AS</span>${['tc','tl','sup'].map(r=>`<button class="${S.role===r?'on':''}" onclick="pf.role('${r}')">${{tc:'TC',tl:'TL',sup:'Supervisor'}[r]}</button>`).join('')}</div>`;
  return `<div class="pf-head"><div class="pf-title"><div class="pf-ico">${ICON}</div><div>${crumbs}<h2>My Portfolio - Collection</h2><p>${esc(sub)}</p></div></div><div class="pf-head-r">${roles}${seg}${S.drillTC?'':selBtn}${info}</div></div>`;
}
const ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><g fill="#5B4FE8"><rect x="10.6" y="1.5" width="2.8" height="7" rx="1.4"/><rect x="10.6" y="15.5" width="2.8" height="7" rx="1.4" opacity=".55"/><rect x="1.5" y="10.6" width="7" height="2.8" rx="1.4" opacity=".75"/><rect x="15.5" y="10.6" width="7" height="2.8" rx="1.4" opacity=".9"/><rect x="4.2" y="4.2" width="2.8" height="6" rx="1.4" transform="rotate(-45 5.6 7.2)" opacity=".6"/><rect x="17" y="13.8" width="2.8" height="6" rx="1.4" transform="rotate(-45 18.4 16.8)" opacity=".8"/></g></svg>`;

function selPop(){
  const codes=scopeCodes(); const on=c=>!S.sel||S.sel.has(c);
  let body='';
  if(S.role==='sup' && !S.drillTL){ data().tls.forEach(t=>{ body+=`<div class="grp">${tlLabel(t.id)}</div>` + codesOfTL(t.id).map(c=>`<label><input type="checkbox" data-c="${c}" ${on(c)?'checked':''}> ${tcLabel(c)}</label>`).join(''); }); }
  else body = codes.map(c=>`<label><input type="checkbox" data-c="${c}" ${on(c)?'checked':''}> ${tcLabel(c)} <span class="pf-bk">${bktRange([c])}</span></label>`).join('');
  return `<div class="pf-pop" onclick="event.stopPropagation()" id="pfSelPop"><h4>Show ${S.product==='edl'?'agents':'TCs'}</h4>${body}<div class="acts"><button class="pf-btn sm" onclick="pf.selAll()">Clear</button><button class="pf-btn sm pri" onclick="pf.selApply()">Apply</button></div></div>`;
}
function infoPop(){
  const P=meta();
  return `<div class="pf-pop" onclick="event.stopPropagation()" style="width:340px">
   <h4>Data in this prototype</h4>
   <p>Real ${P.label} numbers as of <b>20 Nov 2026</b> — the last day with complete dialler data (Acefone call logs stop after 20 Nov). ${P.cyc}.</p>
   <p>Names are masked: ${rn().tc}s, ${rn().tl}s and ${rn().sup}s show as codes. Customer ids are truncated.</p>
   <h4>Teams shown</h4>
   <p>Borrow: 1 supervisor → 3 TLs → 37 TCs. CC: 1 supervisor → 2 TLs → 27 TCs. EDL: 1 ZRM → 6 mentors → 43 field agents.</p>
   <h4>Benchmark</h4><p>Same-bucket resolution of all telecalling TCs in the product (Borrow 7.3k cases per bucket on average).</p>
   <h4>Sources</h4><p>Collections MIS (Borrow, CC), bank_collections_mis (EDL), copsdb_gold.tele_call_log, collection_note, agent_detail.</p></div>`;
}

/* ---------- KPI strip ---------- */
function kpis(v){
  const m=M(v.codes), P=meta(), cc=P.kind==='cc', edl=P.kind==='edl';
  const pill = m.vsBench==null? '' : `<span class="pf-pill ${m.vsBench>=0.005?'up':m.vsBench<=-0.005?'dn':'nt'}">${fPP(m.vsBench)} vs bench</span>`;
  const tiles = [
    {l:'Total Cases', k:'pf.cases', v:fI(m.cases), s: v.mode==='tc'? bktRange(v.codes) : `${v.codes.length} ${S.product==='edl'?'agents':'TCs'} · ${bktRange(v.codes)}`},
    cc? {l:'Remaining Bill', k:'pf.rba', v:fR(m.rba), s:`POS ${fR(m.pos)} · Min due ${fR(m.mda)}`} : {l:'Total POS', k:'pf.pos', v:fR(m.pos), s:`Overdue ${fR(m.od)}`},
    {l:'Resolution Rate', k:'pf.res', v:`${fP(m.resPct)} ${pill}`, s: cc? `Min due ${fI(m.mindue)} · Full due ${fI(m.full)} · POS ${fP(m.posResPct)}` : `${fI(m.res)} cases · POS ${fP(m.posResPct)}`},
    edl? {l:'Recovered Today', k:'pf.paid', v:fR(m.recFtd), s:`${ASOF} · bank MIS recovery_ftd`} : {l:'Resolved Today', k:'pf.today', v:fI(m.resD), s:`${fR(m.resDPos)} POS · yesterday ${fI(m.resY)}`},
    {l:edl?'Recovered MTD':'Amount Collected', k:'pf.paid', v:fR(m.paid), s: m.pos? `${fP(m.paid/m.pos)} of POS` : ''},
  ];
  return `<div class="pf-kpis"><dl>${tiles.map(t=>`<div class="pf-kpi"><dt>${t.l} ${ib(t.k)}</dt><dd>${t.v}</dd><div class="s">${esc(t.s)}</div></div>`).join('')}</dl></div>`;
}

/* ---------- tabs ---------- */
function tabs(v){
  const D=data(), P=meta();
  let mainLbl, cnt;
  if(v.mode==='tc'){ mainLbl='Assigned Cases'; cnt = (v.codes[0]===D.persona[0]) ? D.rowsTotal : M(v.codes).cases; }
  else if(v.mode==='tl'){ mainLbl= S.product==='edl'?'My Agents':'My Team'; cnt=v.codes.length; }
  else { mainLbl='Teams'; cnt=`${D.tls.length} × ${v.codes.length}`; }
  return `<div class="pf-tabs"><div class="tl">
    <button class="pf-tab ${S.tab==='main'?'on':''}" onclick="pf.tab('main')">${mainLbl} <span class="c">${cnt}</span></button>
    <button class="pf-tab ${S.tab==='summary'?'on':''}" onclick="pf.tab('summary')">Summary</button></div>
    <div class="pf-asof">As of 20 Nov 2026 · ${P.cyc}</div></div>`;
}

/* ---------- SUMMARY (same for every role, scoped) ---------- */
function summary(v){
  const P=meta(), A=agg(v.codes), m=M(v.codes), cc=P.kind==='cc';
  const rows = P.bkts.filter(b=>A.bk[b]).map(b=>[b,A.bk[b]]);
  const head = cc
    ? [['Bucket',''],['Cases allocated','pf.cases'],['Remaining Bill Amt','pf.rba'],['Cases resolved','pf.res'],['POS resolved','pf.res'],['Min Due users','pf.mindue'],['Full Due users','pf.fulldue']]
    : [['Bucket',''],['Cases allocated','pf.cases'],['POS allocated','pf.pos'],['Cases resolved','pf.res'],['POS resolved','pf.res'],['Stab users','pf.stbl'],['Normalised users','pf.norm'],['Rollback users','pf.rb']];
  const line = (name,x,tot) => {
    const cells = cc
      ? [fI(x[0]), fR(x[2]), `${fI(x[4])}<span class="sub">${fP(x[0]?x[4]/x[0]:null)}</span>`, `${fR(x[5])}<span class="sub">${fP(x[1]?x[5]/x[1]:null)}</span>`, fI(x[6]), fI(x[7])]
      : [fI(x[0]), fR(x[1]), `${fI(x[2])}<span class="sub">${fP(x[0]?x[2]/x[0]:null)}</span>`, `${fR(x[3])}<span class="sub">${fP(x[1]?x[3]/x[1]:null)}</span>`, fI(x[4]), fI(x[5]), fI(x[6])];
    return `<tr class="${tot?'tot':''}"><td>${tot?'<b style="font-weight:500">Total</b>':`<span class="pf-bk">${name}</span>`}</td>${cells.map(c=>`<td class="r">${c}</td>`).join('')}</tr>`;
  };
  const bucketCard = `<div class="pf-card"><div class="pf-card-h"><h3>Portfolio by bucket <span class="hint">${scopeLabel(v)}</span></h3></div>
    <div class="pf-scroll"><table class="pf-t"><thead><tr>${head.map(([l,k],i)=>`<th class="${i?'r':''}">${l}${k?' '+ib(k):''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([b,x])=>line(b,x,false)).join('')}${line('',A.t,true)}</tbody></table></div></div>`;
  return bucketCard + connectivity(v,m);
}
function scopeLabel(v){ return v.mode==='tc'? tcLabel(v.codes[0]) : v.mode==='tl'? `${tlLabel(v.tl)} · ${v.codes.length} ${S.product==='edl'?'agents':'TCs'}` : `${rn().sup} ${meta().sup} · ${v.codes.length} ${S.product==='edl'?'agents':'TCs'}`; }

function connectivity(v,m){
  const P=meta();
  if(P.kind==='edl'){
    return `<div class="pf-card"><div class="pf-card-h"><h3>PTP book <span class="hint">field-collected — no dialler data</span></h3></div>
      <div class="pf-grid2">
        ${st('Active PTP cases','pf.ptp',fI(m.ptpAct),'PTP date ≥ today, still unresolved')}
        ${st('Active PTP amount','pf.ptp',fR(m.ptpAmt),'promised by these customers')}
        ${st('PTP due today','pf.ptptoday',fI(m.ptpToday),ASOF)}
        ${st('Broken PTPs','pf.broken',fI(m.ptpBroken),'since 1 Nov')}
      </div>
      <div class="pf-note">EDL agents are field officers: visits and dispositions are logged in mCollect, which is not in this dataset, so talk time and disposition mix are not shown. <b>Ask:</b> bring mCollect feedback into the same disposition model.</div></div>`;
  }
  const tiles = `<div class="pf-grid2">
    ${st('Total connected users','pf.contacted',fI(m.contacted),`${fP(m.contactedPct)} of ${fI(m.cases)} customers`)}
    ${st('Avg talk time / connected call','pf.avgtalk',fMSS(m.avgTalk),`${fI(m.connC)} connected of ${fI(m.callsC)} dialled (${fP(m.connRate)})`)}
    ${st('Total active PTP cases','pf.ptp',fI(m.ptpAct),`${fI(m.ptpToday)} due today · ${fI(m.ptpBroken)} broken`)}
    ${m.ptpAct && !m.ptpAmtN ? st('Total PTP amount active','pf.ptp','<span style="color:var(--g400)">Not captured</span>',`TCs didn’t enter an amount on any of the ${fI(m.ptpAct)} PTPs`) : st('Total PTP amount active','pf.ptp',fR(m.ptpAmt),`amount captured on ${fI(m.ptpAmtN)} of ${fI(m.ptpAct)} PTPs`)}
  </div>`;
  const cats = Object.entries(m.A.nc).sort((a,b)=>b[1]-a[1]);
  const tot = cats.reduce((s,[,n])=>s+n,0)||1; const max = cats.length? cats[0][1] : 1;
  const top = cats.slice(0,11), rest = cats.slice(11).reduce((s,[,n])=>s+n,0);
  if(rest) top.push(['Other',rest]);
  const col = k => k==='No disposition'? '#E5E7EB' : CONTACT.has(k)? '#6366F1' : NOCONTACT.has(k)? '#9CA3AF' : '#C7D2FE';
  const bars = top.map(([k,n])=>`<div class="pf-db"><div class="k" title="${esc(DISPO_NAME[k]||k)}">${esc(k)}${DISPO_NAME[k]&&!DISPO_NAME[k].startsWith(k)?`<small>${esc(DISPO_NAME[k])}</small>`:''}</div><div class="b"><i style="width:${(n/max*100).toFixed(1)}%;background:${col(k)}"></i></div><div class="v">${fI(n)}<small>${fP(n/tot)}</small></div></div>`).join('');
  return `<div class="pf-card"><div class="pf-card-h"><h3>Connectivity · this cycle <span class="hint">since ${P.start} · ${scopeLabel(v)}</span></h3></div>${tiles}
    <div class="pf-dispo"><div class="pf-card-h" style="padding:0 0 8px;border:none"><h3 style="font-size:13px">Customers by latest disposition ${ib('pf.dispo')}</h3>
      <div class="lg"><span><i style="background:#6366F1"></i>Contact</span><span><i style="background:#9CA3AF"></i>No contact</span><span><i style="background:#C7D2FE"></i>Other</span><span><i style="background:#E5E7EB"></i>No disposition</span></div></div>${bars}</div></div>`;
}
const st = (l,k,v,s) => `<div class="pf-st"><div class="l">${l} ${k?ib(k):''}</div><div class="v">${v}</div><div class="s">${esc(s)}</div></div>`;

/* ---------- TC MAIN: Assigned Cases (live format, compact) ---------- */
function rowsFor(code){ const D=data(); return code===D.persona[0] ? D.rows : null; }
function caseMatch(r){
  const P=meta(), q=S.q.trim().toLowerCase();
  if(q && !String(r[0]).toLowerCase().includes(q)) return false;
  const ch=S.caseChip; if(!ch) return true;
  if(P.kind==='edl'){ if(ch==='ptptoday') return r[7]===ASOF && r[5]==='FWD'; if(ch==='ptp') return !!r[7] && r[5]==='FWD' && dayNum(r[7])>=dayNum(ASOF); return true; }
  const cat=r[9], fu=r[10], flow=String(r[3]), unres = P.kind==='cc'? !['MINDUE_PAID','PAID'].includes(flow) : flow==='FWD';
  if(ch==='ptptoday') return cat==='PTP' && fu===ASOF && unres;
  if(ch==='futoday') return fu===ASOF && cat!=='PTP' && unres;
  if(ch==='broken') return cat==='PTP' && fu && dayNum(fu)<20 && unres;
  if(ch==='untouched') return cat==='—' && unres;
  return true;
}
const dayNum = s => parseInt(s,10);
function cases(v){
  const P=meta(), m=M(v.codes), code=v.codes[0], rows=rowsFor(code), D=data();
  const chips = P.kind==='edl'
    ? [['ptptoday','PTP due today',m.ptpToday,'#4F46E5'],['ptp','Active PTPs',m.ptpAct,'#16A34A']]
    : [['ptptoday','PTP due today',m.ptpToday,'#4F46E5'],['futoday','Follow-ups due today',m.fuToday,'#16A34A'],['broken','Broken PTPs',m.ptpBroken,'#D97706'],['untouched','Not dispositioned',m.untouched,'#DC2626']];
  const focus = `<div class="pf-focus"><div class="pf-chips"><span class="lb">Today’s focus</span>${chips.map(([k,l,n,c])=>`<button class="pf-fc ${S.caseChip===k?'on':''}" onclick="pf.caseChip('${k}')"><span class="dt" style="background:${c}"></span>${l} <b>${fI(n)}</b></button>`).join('')}</div>
    ${m.calls!==false && P.calls? `<div class="pf-chips"><span class="pf-fc" title="Dialler, ${ASOF}">Calls ${ASOF} <b>${fI(m.callsD)}</b></span><span class="pf-fc">Connected <b>${fI(m.connD)}</b></span><span class="pf-fc">Talk <b>${fDur(m.talkD)}</b></span></div>`:''}</div>`;
  const cols = colsCases();
  const tools = `<div class="pf-tools">
     <button class="pf-sel" onclick="toast('Multi Allocation filter')">Multi Allocation<span class="chev"></span></button>
     <button class="pf-sel" onclick="toast('Tags filter')">Tags<span class="chev"></span></button>
     <button class="pf-sel" onclick="toast('Case Category filter')">Case Category<span class="chev"></span></button>
     <button class="pf-sel dark" onclick="toast('More filters')">More Filters<span class="chev"></span><span class="gdot"></span></button>
     <div class="pf-search">${SEARCH}<input placeholder="Filter by User Name or UUID" value="${esc(S.q)}" oninput="pf.q(this.value)"></div>
     <button class="pf-btn" onclick="toast('Refreshed')">⟳ Refresh Tickets</button></div>`;
  let body;
  if(!rows){
    body = `<div class="pf-empty"><b>Case list loads from the live API</b>This prototype carries the case list for ${tcLabel(D.persona[0])} only. In Spacce this tab calls the same Assigned Cases API with the selected ${rn().tc.toLowerCase()}.<br><br><button class="pf-btn" onclick="pf.tab('summary')">See ${tcLabel(code)}’s summary</button></div>`;
  } else {
    const fr = rows.filter(caseMatch); const per=10, pages=Math.max(1,Math.ceil(fr.length/per)); if(S.page>pages) S.page=pages;
    const pr = fr.slice((S.page-1)*per, S.page*per);
    const totalPages = Math.ceil(D.rowsTotal/per);
    body = `<div class="pf-scroll"><table class="pf-t flat"><thead><tr>${cols.map((c,i)=>`<th class="${c.r?'r':''} ${i===0?'stk':''}">${c.l}${c.k?' '+ib(c.k):''}</th>`).join('')}</tr></thead>
      <tbody>${pr.length? pr.map(r=>`<tr>${cols.map((c,i)=>`<td class="${c.r?'r':''} ${i===0?'stk mono':''}">${c.f(r,code)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}"><div class="pf-empty"><b>No matching cases in the loaded page</b>Clear the filter to see all cases.</div></td></tr>`}</tbody></table></div>
      <div class="pf-pager"><span>Showing page <b>${S.page}</b> of <b>${S.caseChip||S.q? pages : totalPages}</b> <span class="mut" style="color:var(--g400)">· prototype loads the top 30 cases by POS + examples for each focus chip</span></span>
      <div class="pg"><button onclick="pf.page(-1)">‹</button>${Array.from({length:Math.min(pages,3)},(_,i)=>`<button class="${S.page===i+1?'on':''}" onclick="pf.page(0,${i+1})">${i+1}</button>`).join('')}<button onclick="pf.page(1)">›</button></div>
      <select onchange="toast('Rows per page')"><option>Show 10 rows</option><option>Show 25 rows</option><option>Show 50 rows</option></select></div>`;
  }
  return `<div class="pf-card">${focus}<div class="pf-card-h"><h3>Assigned Cases (${fI(rows? D.rowsTotal : m.cases)})</h3>${tools}</div>${body}</div>`;
}
const SEARCH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
function flowChip(f){ const s=String(f||'').toUpperCase(); const map={FWD:'fwd',STBL:'stbl',STABLE:'stable',NORM:'norm',RB:'rb',MINDUE_PAID:'mindue',PAID:'paid',UNPAID:'unpaid',PARTIAL_PAID:'partial'};
  const lbl={MINDUE_PAID:'MIN DUE',PARTIAL_PAID:'PARTIAL'}[s]||s; return `<span class="pf-ch ${map[s]||'cat'}">${esc(lbl)}</span>`; }
function catChip(c){ if(!c||c==='—') return '<span class="mut">—</span>'; return `<span class="pf-ch ${c==='PTP'?'ptp':'cat'}">${esc(c)}</span>`; }
const mask8 = s => `<span title="truncated for the public prototype">${esc(s)}…</span>`;
function colsCases(){
  const P=meta(), tc = c => `<span class="mut">tc.${c.toLowerCase()}@…</span>`;
  const act = `<button class="pf-go" onclick="openProfile()">View</button>`;
  const dash = () => '<span class="mut">—</span>';
  if(P.kind==='edl') return [
    {l:'Loan A/C', f:r=>esc(r[0])},{l:'Agent Email', f:(r,c)=>tc(c)},{l:'User Name', f:()=>'<span class="mut">••••••</span>'},{l:'User Phone', f:()=>'<span class="mut">••••••••</span>'},
    {l:'Category', k:'pf.edlcat', f:r=>(r[7] && r[5]==='FWD' && dayNum(r[7])>=dayNum(ASOF))?catChip('PTP'):dash()},{l:'Outcome', f:r=>flowChip(r[5])},
    {l:'Overdue Amt', r:1, f:r=>fRF(r[4])},{l:'POS', k:'pf.pos', r:1, f:r=>fRF(r[3])},{l:'Profile Type', k:'pf.edlprod', f:r=>`<span class="mut">${esc(r[6])}</span>`},
    {l:'Bucket', f:r=>`<span class="pf-bk">${esc(r[1])}</span> <span class="mut">${r[2]}d</span>`},{l:'Tags', f:dash},{l:'Total Calls', k:'pf.edlfield', r:1, f:dash},{l:'Comments', f:dash},
    {l:'Last Dispo', k:'pf.edlfield', f:dash},{l:'Follow Up', k:'pf.edlfu', f:r=>r[7]?esc(r[7]):dash()},{l:'Multi Alloc', f:dash},
    {l:'PTP Amt', r:1, f:r=>r[8]?fRF(r[8]):dash()},{l:'Recovered MTD', r:1, f:r=>fRF(r[9])},{l:'Action', f:()=>act}];
  const cc = P.kind==='cc';
  return [
    {l:'UUID', f:r=>mask8(r[0])},{l:'Agent Email', f:(r,c)=>tc(c)},{l:'User Name', f:()=>'<span class="mut">••••••</span>'},{l:'User Phone', f:()=>'<span class="mut">••••••••</span>'},
    {l:'Category', k:'pf.cat', f:r=>catChip(r[9])},{l:'Outcome', f:r=>flowChip(r[3])},
    ...(cc? [{l:'Overdue Amt', k:'pf.ccod', r:1, f:r=>fRF(r[14])},{l:'Remaining Bill', k:'pf.rba', r:1, f:r=>fRF(r[4])},{l:'Min Due', r:1, f:r=>fRF(r[5])},{l:'POS', k:'pf.pos', r:1, f:r=>fRF(r[6])}]
          : [{l:'Overdue Amt', r:1, f:r=>fRF(r[4])},{l:'POS', k:'pf.pos', r:1, f:r=>fRF(r[5])}]),
    {l:'Profile Type', f:r=>esc(r[cc?7:6])},{l:'Bucket', f:r=>`<span class="pf-bk">${esc(r[1])}</span>`},{l:'Tags', f:()=>'<span class="mut">—</span>'},
    {l:'Total Calls', k:'pf.totalcalls', r:1, f:r=>fI(r[11])},{l:'Comments', f:()=>'<span class="mut">—</span>'},
    {l:cc?'Best Dispo':'Last Dispo', k:cc?'pf.bdisp':'pf.ldisp', f:r=>esc(r[8]||'—')},{l:'Follow Up', f:r=>r[10]?esc(r[10]):'<span class="mut">—</span>'},
    {l:'Multi Alloc', f:r=>r[13]?'Multi':'Single'},{l:'Action', f:()=>act}];
}

/* ---------- TL / SUPERVISOR MAIN ---------- */
function teamCols(){
  const P=meta();
  if(P.kind==='edl') return [
    {k:'cases',l:'Loans',g:'Portfolio',f:fI,h:null,info:'pf.cases'},{k:'pos',l:'POS',g:'Portfolio',f:fR},
    {k:'resPct',l:'Res %',g:'Resolution',f:fP,h:'sign',info:'pf.res'},{k:'vsBench',l:'vs Bench',g:'Resolution',f:fPP,h:'sign',info:'pf.bench'},{k:'posResPct',l:'POS Res %',g:'Resolution',f:fP,h:'signpos'},
    {k:'stbl',l:'Stable',g:'Resolution',f:fI},{k:'recMtd',l:'Rec. MTD',g:'Recovery',f:fR,h:'hi',info:'pf.paid'},{k:'recFtd',l:`Rec. ${ASOF}`,g:'Recovery',f:fR},
    {k:'ptpAct',l:'Active PTP',g:'PTP',f:(v,m)=>m.ptpAct? `${fI(m.ptpAct)}<span class="sub">${fR(m.ptpAmt)}</span>`:'<span class="mut">0</span>',info:'pf.ptp'},{k:'ptpToday',l:'Due today',g:'PTP',f:fI},{k:'ptpBroken',l:'Broken',g:'PTP',f:fI,h:'lo',info:'pf.broken'}];
  return [
    {k:'cases',l:'Cases',g:'Portfolio',f:fI,info:'pf.cases'},{k:'pos',l:'POS',g:'Portfolio',f:fR},
    {k:'resPct',l:'Res %',g:'Resolution',f:fP,h:'sign',info:'pf.res'},{k:'vsBench',l:'vs Bench',g:'Resolution',f:fPP,h:'sign',info:'pf.bench'},{k:'posResPct',l:'POS Res %',g:'Resolution',f:fP,h:'signpos'},
    {k:'resD',l:'Today',g:'Resolution',f:fI,h:'hi',info:'pf.today'},{k:'resY',l:'Yest.',g:'Resolution',f:fI},
    {k:'callsD',l:'Calls',g:`Dialling · ${ASOF}`,f:(v,m)=> m.callsD? `${fI(m.callsD)}<span class="pf-mini" title="Manual ${m.manD} · PD ${m.pdD}"><i class="m" style="width:${(m.manD/m.callsD*100).toFixed(0)}%"></i><i class="p" style="width:${(m.pdD/m.callsD*100).toFixed(0)}%"></i></span>` : '<span class="mut">0</span>',h:'hi',info:'pf.calls'},
    {k:'connD',l:'Conn.',g:`Dialling · ${ASOF}`,f:fI,h:'hi',info:'pf.conn'},{k:'talkD',l:'Talk',g:`Dialling · ${ASOF}`,f:v=>fDur(v),h:'hi',info:'pf.talk'},
    {k:'span',l:'First–Last',g:`Dialling · ${ASOF}`,f:v=>v==='—'?'<span class="mut">—</span>':esc(v),sort:false},{k:'gap',l:'Max gap',g:`Dialling · ${ASOF}`,f:v=>v==null?'<span class="mut">—</span>':fMin(v),h:'lo',info:'pf.gap'},
    {k:'callsPerCase',l:'Calls/case',g:`Cycle · since ${P.start}`,f:v=>v==null?'—':v.toFixed(1),h:'hi'},{k:'connRate',l:'Connect %',g:`Cycle · since ${P.start}`,f:fP,h:'hi',info:'pf.connrate'},{k:'avgTalk',l:'Avg talk',g:`Cycle · since ${P.start}`,f:fMSS,info:'pf.avgtalk'},
    {k:'contactedPct',l:'Connected',g:'Customers',f:fP,h:'hi',info:'pf.contacted'},{k:'untouched',l:'Not dispo.',g:'Customers',f:fI,h:'lo',info:'pf.untouched'},
    {k:'ptpAct',l:'Active PTP',g:'Customers',f:(v,m)=> m.ptpAct? `${fI(m.ptpAct)}${m.ptpAmt?`<span class="sub">${fR(m.ptpAmt)}</span>`:''}`:'<span class="mut">0</span>',h:'hi',info:'pf.ptp'},
    {k:'ptpToday',l:'PTP today',g:'Customers',f:fI,info:'pf.ptptoday'},{k:'ptpBroken',l:'Broken',g:'Customers',f:fI,h:'lo',info:'pf.broken'}];
}
function heatOf(cols, ms){
  const H={}; cols.forEach(c=>{ if(!c.h || c.h==='sign' || c.h==='signpos') return; const vals=ms.filter(m=>m.cases>=minBook()).map(m=>m[c.k]).filter(v=>v!=null&&isFinite(v)).sort((a,b)=>a-b); if(vals.length<6) return;
    H[c.k]={lo:vals[Math.floor((vals.length-1)*0.25)], hi:vals[Math.ceil((vals.length-1)*0.75)], dir:c.h}; });
  return H;
}
function cellCls(c,m,H){
  if(c.h==='sign'||c.h==='signpos'){ const v = c.h==='sign'? m.vsBench : (m.posResPct!=null&&m.expPos!=null? m.posResPct-m.expPos : null); if(v==null||m.cases<minBook()) return ''; return v<=-0.03?'hb':v>=0.03?'hg':''; }
  const h=H[c.k]; if(!h||m.cases<minBook()) return ''; const v=m[c.k]; if(v==null||!isFinite(v)) return '';
  if(h.dir==='hi') return v<=h.lo?'hb':v>=h.hi?'hg':''; return v>=h.hi?'hb':v<=h.lo?'hg':'';
}

function team(v){
  const P=meta(), cols=teamCols(); const tsBy={}; data().tls.forEach(t=>tsBy[t.id]=teamStats(codesOfTL(t.id)));
  const tcMs = v.codes.map(c=>Object.assign(M([c]),{code:c, flags:flagsOf(c,tsBy[tlOf(c)])}));
  const H = heatOf(cols, tcMs);
  const att = attention(v, tcMs);
  const flagged = tcMs.filter(m=>sev(m.flags)>=2).length, below = tcMs.filter(m=>m.flags.some(f=>f.k==='bench')).length, nocall = tcMs.filter(m=>m.flags.some(f=>f.k==='nocall'||f.k==='lowcalls'||f.k==='idle')).length;
  const filt = [['all','All',tcMs.length],['flag','Needs attention',flagged],['bench','Below benchmark',below]].concat(P.calls?[['activity','Low activity',nocall]]:[]);
  const has = (m,ks) => m.flags.some(f=>ks.includes(f.k));
  const FK = {all:()=>true, flag:m=>sev(m.flags)>=2, bench:m=>has(m,['bench']), activity:m=>has(m,['nocall','lowcalls','idle']), nocall:m=>has(m,['nocall']), idle:m=>has(m,['idle','lowcalls']),
    untouched:m=>has(m,['untouched']), ptpdue:m=>nz(m.ptpToday)+nz(m.fuToday)>0, broken:m=>nz(m.ptpBroken)>0, nores:m=>has(m,['nores']), ptpedl:m=>nz(m.ptpToday)+nz(m.ptpBroken)>0};
  const FL = {nocall:`No calls on ${ASOF}`, idle:'Low dialling / idle', untouched:'Never dispositioned', ptpdue:'PTPs & follow-ups due', broken:'Broken PTPs', nores:'No resolution', ptpedl:'PTP follow-ups'};
  const passes = m => (FK[S.filt]||FK.all)(m) && (!S.q || m.code.toLowerCase().includes(S.q.trim().toLowerCase().replace(/^(tc|agent)\s*/,'')));
  const sorter = (a,b) => { if(!S.sort.k) return a.code.localeCompare(b.code); const x=a[S.sort.k], y=b[S.sort.k]; return ((x==null?-Infinity:x)-(y==null?-Infinity:y))*S.sort.d || a.code.localeCompare(b.code); };
  const grp = []; cols.forEach(c=>{ const last=grp[grp.length-1]; if(last&&last.g===c.g) last.n++; else grp.push({g:c.g,n:1}); });
  const thead = `<thead><tr class="grp"><th class="stk"></th>${grp.map(g=>`<th colspan="${g.n}" class="g">${esc(g.g)}</th>`).join('')}<th></th></tr>
    <tr><th class="stk sort ${S.sort.k==null?'sorted':''}" onclick="pf.sort(null)">${S.product==='edl'?'Agent':'TC'}</th>${cols.map(c=>`<th class="r ${c.sort===false?'':'sort'} ${S.sort.k===c.k?'sorted':''}" ${c.sort===false?'':`onclick="pf.sort('${c.k}')"`}>${c.l}${c.info?' '+ib(c.info):''}${c.sort===false?'':`<span class="ar">${S.sort.k===c.k?(S.sort.d>0?'▲':'▼'):'⇅'}</span>`}</th>`).join('')}<th></th></tr></thead>`;
  const tcRow = m => `<tr class="tcrow" onclick="pf.open('${m.code}')"><td class="stk"><span class="tcn"><span class="pf-fl s${sev(m.flags)}" title="${esc(m.flags.map(f=>f.t).join(' · ')||'On track')}"></span>${tcLabel(m.code)} <span class="pf-bk">${bktRange([m.code])}</span></span></td>${cols.map(c=>`<td class="r ${cellCls(c,m,H)}">${c.f(m[c.k],m)}</td>`).join('')}<td><span class="pf-go">›</span></td></tr>`;
  const aggRow = (label, codes, cls, onclick, caret) => { const m=M(codes); return `<tr class="${cls}" ${onclick?`onclick="${onclick}"`:''}><td class="stk">${caret||''}${label}</td>${cols.map(c=>`<td class="r">${['span','gap'].includes(c.k)&&codes.length>1? (c.k==='gap'?'<span class="mut">—</span>':(m.activeTCs!=null?`<span class="mut">${m.activeTCs}/${codes.length} dialled</span>`:'—')) : c.f(m[c.k],m)}</td>`).join('')}<td></td></tr>`; };
  let tbody='';
  if(v.mode==='tl'){
    tbody = aggRow(`Team total · ${v.codes.length} ${S.product==='edl'?'agents':'TCs'}`, v.codes, 'tot') + tcMs.filter(passes).sort(sorter).map(tcRow).join('');
  } else {
    tbody = aggRow(`All teams · ${v.codes.length} ${S.product==='edl'?'agents':'TCs'}`, v.codes, 'tot');
    data().tls.forEach(t=>{ const codes=v.codes.filter(c=>tlOf(c)===t.id); if(!codes.length) return; const open = S.expanded[t.id]!==false;
      const rows = tcMs.filter(m=>codes.includes(m.code)&&passes(m)).sort(sorter);
      const nflag = tcMs.filter(m=>codes.includes(m.code)&&sev(m.flags)>=2).length;
      tbody += aggRow(`${tlLabel(t.id)} <span class="pf-bk">${bktRange(codes)}</span> <span class="sub">${codes.length} ${S.product==='edl'?'agents':'TCs'}${nflag?` · <span style="color:var(--rd700)">${nflag} flagged</span>`:''}</span>`, codes, 'tlrow', `pf.toggle('${t.id}')`, `<span class="caret">${open?'▾':'▸'}</span>`);
      if(open) tbody += rows.map(tcRow).join('');
    });
  }
  const supCards = v.mode==='sup' ? tlCards(v, tcMs) : '';
  const toolbar = `<div class="pf-card-h"><h3>${v.mode==='sup'? `${S.product==='edl'?'Mentor':'TL'} × ${S.product==='edl'?'agent':'TC'} performance` : `${S.product==='edl'?'Agents':'TCs'} in ${tlLabel(v.tl)}`} <span class="hint">click a row for the ${S.product==='edl'?'agent':'TC'} card</span></h3>
    <div class="pf-tools"><div class="pf-chips">${filt.map(([k,l,n])=>`<button class="pf-fc ${S.filt===k?'on':''}" onclick="pf.filt('${k}')">${l} <b>${n}</b></button>`).join('')}${FL[S.filt]?`<button class="pf-fc on" onclick="pf.filt('all')" title="Clear">${FL[S.filt]} <b>${tcMs.filter(FK[S.filt]).length}</b> ✕</button>`:''}</div>
    ${v.mode==='sup'?`<button class="pf-btn sm" onclick="pf.expandAll()">${Object.values(S.expanded).some(x=>x===false)?'Expand all':'Collapse all'}</button>`:''}
    <div class="pf-search" style="width:160px">${SEARCH}<input placeholder="Find ${S.product==='edl'?'agent':'TC'} (e.g. C06)" value="${esc(S.q)}" oninput="pf.q(this.value)"></div>
    <button class="pf-btn sm" onclick="downloadPortfolio()">⤓ Download</button></div></div>`;
  return supCards + att + `<div class="pf-card">${toolbar}<div class="pf-scroll"><table class="pf-t">${thead}<tbody>${tbody}</tbody></table></div>
    <div class="pf-note">Cells are shaded against ${v.mode==='sup'?'everyone shown':'the team'}: <span class="pf-ch paid">top quarter</span> <span class="pf-ch fwd">bottom quarter</span>. vs Bench compares each ${S.product==='edl'?'agent':'TC'} with the same-bucket average across all ${P.label} ${S.product==='edl'?'field agents':'telecalling TCs'}. Books under ${minBook()} ${S.product==='edl'?'loans':'cases'} are not shaded or flagged on benchmark.</div></div>`;
}

function attention(v, tcMs){
  const P=meta(), m=M(v.codes), cards=[];
  const who = (list, fmt, key) => list.slice(0,6).map(x=>`<span class="pf-who" onclick="pf.open('${x.code}')"><b>${x.code}</b>${fmt?' '+fmt(x):''}</span>`).join('') + (list.length>6?`<span class="pf-who" onclick="pf.filt('${key}')">+${list.length-6} more</span>`:'');
  if(P.calls){
    const nc = tcMs.filter(x=>x.flags.some(f=>f.k==='nocall'));
    if(nc.length) cards.push({s:3,t:`No calls on ${ASOF}`,n:nc.length,d:'Allocated TCs with zero dialler activity — leave, login or sync issue. Their customers went uncalled.',w:who(nc,null,'nocall')});
    const idle = tcMs.filter(x=>x.flags.some(f=>f.k==='idle'||f.k==='lowcalls')).sort((a,b)=>nz(b.gap)-nz(a.gap));
    if(idle.length) cards.push({s:2,t:'Low dialling or long idle gaps',n:idle.length,d:`Under half their TL team’s median${v.mode==='tl'?` (${Math.round(teamStats(codesOfTL(v.tl)).medCallsD||0)} calls)`:''}, or a 2h+ gap between calls.`,w:who(idle,x=>`<span class="sub">${x.callsD}c · ${fMin(x.gap)}</span>`,'idle')});
  }
  const bench = tcMs.filter(x=>x.flags.some(f=>f.k==='bench')).sort((a,b)=>a.vsBench-b.vsBench);
  if(bench.length) cards.push({s:2,t:'Below bucket benchmark',n:bench.length,d:`3 pp or more under the same-bucket average. ${v.mode==='sup'?'Compare TLs on the scorecards above.':''}`,w:who(bench,x=>`<span class="sub">${fPP(x.vsBench)}</span>`,'bench')});
  if(P.kind!=='edl'){
    const un = tcMs.filter(x=>x.flags.some(f=>f.k==='untouched')).sort((a,b)=>b.untouched-a.untouched);
    if(un.length) cards.push({s:2,t:'Customers never dispositioned',n:fI(un.reduce((s,x)=>s+x.untouched,0)),d:`Unresolved customers with no TC disposition since ${P.start}, across ${un.length} TCs. Reassign or push to PD.`,w:who(un,x=>`<span class="sub">${x.untouched}</span>`,'untouched')});
    cards.push({s:1,t:`PTPs and follow-ups due ${ASOF}`,n:fI(m.ptpToday+m.fuToday),d:`${fI(m.ptpToday)} PTPs + ${fI(m.fuToday)} follow-ups due. Active PTP book ${fI(m.ptpAct)}${m.ptpAmt?` (${fR(m.ptpAmt)} captured)`:''}.`,w:who(tcMs.filter(x=>x.ptpToday+x.fuToday>0).sort((a,b)=>(b.ptpToday+b.fuToday)-(a.ptpToday+a.fuToday)),x=>`<span class="sub">${x.ptpToday+x.fuToday}</span>`,'ptpdue')});
    const br = tcMs.filter(x=>x.ptpBroken>0).sort((a,b)=>b.ptpBroken-a.ptpBroken);
    if(m.ptpBroken) cards.push({s:1,t:'Broken PTPs to re-engage',n:fI(m.ptpBroken),d:`PTP date passed, customer still unresolved. ${fI(m.ptpKept)} PTPs kept this cycle.`,w:who(br,x=>`<span class="sub">${x.ptpBroken}</span>`,'broken')});
  } else {
    const nr = tcMs.filter(x=>x.flags.some(f=>f.k==='nores'));
    if(nr.length) cards.push({s:2,t:'No resolution this month',n:nr.length,d:'Agents with 5+ overdue loans and none normalised or stabilised.',w:who(nr,x=>`<span class="sub">${x.cases}</span>`,'nores')});
    if(m.ptpToday||m.ptpBroken) cards.push({s:1,t:'PTP follow-ups',n:fI(m.ptpToday+m.ptpBroken),d:`${fI(m.ptpToday)} due ${ASOF}, ${fI(m.ptpBroken)} broken since 1 Nov.`,w:who(tcMs.filter(x=>x.ptpToday+x.ptpBroken>0),x=>`<span class="sub">${x.ptpToday+x.ptpBroken}</span>`,'ptpedl')});
  }
  if(v.mode==='sup' && data().multiTl) cards.push({s:0,t:'Team mapping to fix',n:data().multiTl,d:`${data().multiTl} TCs have cases under two TLs in the MIS. Shown under the TL with most of their cases — ask ops to clean the mapping.`,w:''});
  cards.sort((a,b)=>b.s-a.s);
  if(!cards.length) return '';
  return `<div class="pf-att">${cards.map(c=>`<div class="pf-ac s${c.s}"><div class="h"><span class="t">${c.t}</span><span class="n">${c.n}</span></div><div class="d">${c.d}</div><div class="who">${c.w}</div></div>`).join('')}</div>`;
}

function tlCards(v, tcMs){
  const P=meta();
  return `<div class="pf-tls">${data().tls.map(t=>{ const codes=v.codes.filter(c=>tlOf(c)===t.id); if(!codes.length) return ''; const m=M(codes);
    const fl=tcMs.filter(x=>codes.includes(x.code)&&sev(x.flags)>=2).length;
    const w=Math.min(100,(m.resPct||0)*100/Math.max(0.0001,Math.max(m.resPct||0,m.exp||0)*1.25)), e=Math.min(100,(m.exp||0)*100/Math.max(0.0001,Math.max(m.resPct||0,m.exp||0)*1.25));
    return `<div class="pf-tlc" onclick="pf.drillTL('${t.id}')"><div class="top"><span class="nm">${tlLabel(t.id)}</span><span class="pf-bk">${bktRange(codes)}</span></div>
      <div class="mt">${codes.length} ${S.product==='edl'?'agents':'TCs'} · ${fI(m.cases)} cases · ${fR(m.pos)}</div>
      <div class="row" style="margin-top:6px"><span>Resolution</span><b>${fP(m.resPct)} <span class="pf-pill ${m.vsBench>=0.005?'up':m.vsBench<=-0.005?'dn':'nt'}">${fPP(m.vsBench)}</span></b></div>
      <div class="pf-bar" title="Bar = actual, marker = same-bucket benchmark ${fP(m.exp)}"><i style="width:${w.toFixed(1)}%"></i><em style="left:${e.toFixed(1)}%"></em></div>
      ${P.calls? `<div class="row"><span>Calls ${ASOF} / active TC</span><b>${m.activeTCs? fI(m.callsD/m.activeTCs) : 0} <span class="sub">${m.activeTCs}/${codes.length} dialled</span></b></div>
      <div class="row"><span>Connect % · cycle</span><b>${fP(m.connRate)}</b></div>
      <div class="row"><span>Active PTP</span><b>${fI(m.ptpAct)}${m.ptpAmt?` · ${fR(m.ptpAmt)}`:''}</b></div>`
      : `<div class="row"><span>Recovered MTD</span><b>${fR(m.recMtd)}</b></div><div class="row"><span>Active PTP</span><b>${fI(m.ptpAct)} · ${fR(m.ptpAmt)}</b></div>`}
      <div class="flg ${fl?'':'ok'}">${fl? `${fl} ${S.product==='edl'?'agents':'TCs'} need attention ›` : 'No flags ›'}</div></div>`; }).join('')}</div>`;
}

/* ---------- TC drawer ---------- */
function drawer(){
  if(!S.drawer) return '';
  const c=S.drawer, P=meta(), m=M([c]), f=flagsOf(c, teamStats(codesOfTL(tlOf(c))));
  const cats = Object.entries(m.A.nc).sort((a,b)=>b[1]-a[1]).slice(0,7); const max=cats.length?cats[0][1]:1;
  const kv = (k,v,s) => `<div><div class="k">${k}</div><div class="v">${v}${s?`<small>${s}</small>`:''}</div></div>`;
  return `<div class="pf-scrim" onclick="pf.close()"></div><aside class="pf-drawer" role="dialog" aria-label="${tcLabel(c)}">
    <div class="dh"><div><h3><span class="pf-fl s${sev(f)}"></span>${tcLabel(c)} <span class="pf-bk">${bktRange([c])}</span></h3><p>${tlLabel(tlOf(c))} · ${fI(m.cases)} cases · ${fR(m.pos)} POS</p></div><button class="x" onclick="pf.close()" aria-label="Close">×</button></div>
    <div class="db">
      <div class="sec">Why flagged</div>${f.length? f.map(x=>`<div class="pf-flag"><span class="pf-fl s${x.s}"></span><div>${esc(x.t)}<em>${esc(x.e)}</em></div></div>`).join('') : '<div class="pf-flag"><span class="pf-fl s0"></span><div>On track<em>No flags on activity, benchmark or PTPs</em></div></div>'}
      <div class="sec">Resolution</div><div class="pf-kv">
        ${kv('Resolution', fP(m.resPct), fPP(m.vsBench)+' vs bench')}${kv('POS resolved', fP(m.posResPct), fR(m.resPos))}
        ${P.delta? kv('Resolved today', fI(m.resD), fR(m.resDPos)) + kv('Resolved yesterday', fI(m.resY), fR(m.resYPos)) : kv('Recovered MTD', fR(m.recMtd)) + kv(`Recovered ${ASOF}`, fR(m.recFtd))}</div>
      ${P.calls? `<div class="sec">Dialling · ${ASOF}</div><div class="pf-kv">
        ${kv('Calls', fI(m.callsD), `${m.manD} manual · ${m.pdD} PD`)}${kv('Connected', fI(m.connD), fDur(m.talkD)+' talk')}
        ${kv('First – last call', m.span)}${kv('Longest gap', m.gap==null?'—':fMin(m.gap))}</div>
        <div class="sec">Cycle since ${P.start}</div><div class="pf-kv">
        ${kv('Calls / case', m.callsPerCase==null?'—':m.callsPerCase.toFixed(1), `${fI(m.callsC)} calls`)}${kv('Connect %', fP(m.connRate), fMSS(m.avgTalk)+' avg talk')}
        ${kv('Connected users', fI(m.contacted), fP(m.contactedPct))}${kv('Not dispositioned', fI(m.untouched), 'unresolved')}
        ${kv('Active PTP', fI(m.ptpAct), m.ptpAmt?fR(m.ptpAmt):'')}${kv('Broken PTP', fI(m.ptpBroken), `${fI(m.ptpKept)} kept`)}</div>
        <div class="sec">Customers by latest disposition</div>${cats.map(([k,n])=>`<div class="pf-db" style="grid-template-columns:110px 1fr 40px"><div class="k">${esc(k)}</div><div class="b"><i style="width:${(n/max*100).toFixed(0)}%;background:${k==='No disposition'?'#E5E7EB':CONTACT.has(k)?'#6366F1':NOCONTACT.has(k)?'#9CA3AF':'#C7D2FE'}"></i></div><div class="v">${n}</div></div>`).join('')}`
      : `<div class="sec">PTP book</div><div class="pf-kv">${kv('Active PTP', fI(m.ptpAct), fR(m.ptpAmt))}${kv('Due today', fI(m.ptpToday))}${kv('Broken', fI(m.ptpBroken))}${kv('Stable', fI(m.stbl))}</div>`}
    </div>
    <div class="df"><button class="pf-btn" onclick="pf.close();toast('Nudge sent to ${tcLabel(c)} (prototype)')">Nudge ${S.product==='edl'?'agent':'TC'}</button><button class="pf-btn pri" onclick="pf.drillTC('${c}')">Open ${tcLabel(c)}’s portfolio</button></div></aside>`;
}

/* ---------- actions ---------- */
const reset = () => { S.drillTC=null; S.drillTL=null; S.sel=null; S.sort={k:null,d:1}; S.filt='all'; S.q=''; S.caseChip=null; S.page=1; S.drawer=null; S.pop=null; S.expanded={}; };
window.pf = {
  role(r){ S.role=r; reset(); S.tab='main'; render(); },
  product(p){ S.product=p; reset(); render(); },
  tab(t){ S.tab=t; S.pop=null; render(); },
  home(){ if(S.drillTL) S.sel=null; S.drillTC=null; S.drillTL=null; S.tab='main'; S.q=''; S.caseChip=null; S.filt='all'; render(); },
  drillTL(t){ if(S.drillTC && S.drillTL===t){ S.drillTC=null; S.tab='main'; render(); return; } S.drillTL=t; S.drillTC=null; S.sel=null; S.filt='all'; S.q=''; S.tab='main'; S.drawer=null; render(); window.scrollTo({top:0,behavior:'smooth'}); },
  drillTC(c){ S.drillTC=c; S.drawer=null; S.tab= c===data().persona[0]?'main':'summary'; S.q=''; S.caseChip=null; S.page=1; render(); window.scrollTo({top:0,behavior:'smooth'}); },
  open(c){ S.drawer=c; render(); },
  close(){ S.drawer=null; render(); },
  sort(k){ if(S.sort.k===k) S.sort.d*=-1; else { S.sort.k=k; S.sort.d=-1; } render(); },
  filt(k){ S.filt=k; render(); },
  toggle(t){ S.expanded[t] = S.expanded[t]===false; render(); },
  expandAll(){ const anyClosed=Object.values(S.expanded).some(x=>x===false); data().tls.forEach(t=>S.expanded[t.id]= anyClosed? true:false); render(); },
  q(val){ S.q=val; S.page=1; const pos=document.activeElement&&document.activeElement.selectionStart; render(); const el=[...document.querySelectorAll('#pfRoot .pf-search input')].pop(); if(el){ el.focus(); try{el.setSelectionRange(pos,pos);}catch(e){} } },
  caseChip(k){ S.caseChip = S.caseChip===k? null : k; S.page=1; render(); },
  page(d,abs){ const rows=rowsFor(view().codes[0])||[]; const pages=Math.max(1,Math.ceil(rows.filter(caseMatch).length/10)); S.page = abs || S.page+d; if(S.page<1) S.page=1; if(S.page>pages){ S.page=pages; toast('Prototype loads the top '+rows.length+' cases by POS'); } render(); },
  pop(e,k){ e.stopPropagation(); S.pop = S.pop===k? null : k; render(); },
  selAll(){ S.sel=null; S.pop=null; render(); },
  selApply(){ const boxes=[...document.querySelectorAll('#pfSelPop input[type=checkbox]')]; const on=boxes.filter(b=>b.checked).map(b=>b.dataset.c); S.sel = on.length===boxes.length? null : new Set(on); S.pop=null; render(); },
};
document.addEventListener('click', e=>{ if(S.pop && !e.target.closest('.pf-pop')){ S.pop=null; render(); } });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && (S.drawer||S.pop)){ S.drawer=null; S.pop=null; render(); } });

/* ---------- role-aware download ---------- */
window.downloadPortfolio = function(){
  const v=view(), P=meta(); let rows, name;
  if(v.mode==='tc'){ const r=rowsFor(v.codes[0]);
    if(!r){ toast('Case list download comes from the live API'); return; }
    const cols=colsCases(); const strip=h=>String(h).replace(/<[^>]+>/g,'').replace(/…$/,'').replace(/,/g,' ');
    rows=[cols.filter(c=>c.l!=='Action').map(c=>c.l)].concat(r.map(x=>cols.filter(c=>c.l!=='Action').map(c=>strip(c.f(x,v.codes[0])))));
    name=`assigned_cases_${S.product}_${v.codes[0]}.csv`;
  } else {
    const F = P.kind==='edl'
      ? [['Loans','cases'],['POS','pos'],['Res %','resPct',1],['vs Bench (pp)','vsBench',1],['POS Res %','posResPct',1],['Stable','stbl'],['Recovered MTD','recMtd'],['Recovered today','recFtd'],['Active PTP','ptpAct'],['PTP amount','ptpAmt'],['PTP due today','ptpToday'],['Broken PTP','ptpBroken']]
      : [['Cases','cases'],['POS','pos'],['Res %','resPct',1],['vs Bench (pp)','vsBench',1],['POS Res %','posResPct',1],['Resolved today','resD'],['Resolved yesterday','resY'],['Calls','callsD'],['Manual','manD'],['PD','pdD'],['Connected','connD'],['Talk sec','talkD'],['First call','first'],['Last call','last'],['Max gap min','gap'],['Calls per case','callsPerCase'],['Connect %','connRate',1],['Avg talk sec','avgTalk'],['Connected users %','contactedPct',1],['Not dispositioned','untouched'],['Active PTP','ptpAct'],['PTP amount','ptpAmt'],['PTP due today','ptpToday'],['Broken PTP','ptpBroken']];
    const raw = (m,[,k,pct]) => { const x=m[k]; if(x==null||(typeof x==='number'&&!isFinite(x))) return ''; if(typeof x!=='number') return x; return pct? (x*100).toFixed(2) : (Number.isInteger(x)? x : x.toFixed(2)); };
    rows=[[rn().tl, rn().tc].concat(F.map(f=>f[0]))].concat(v.codes.map(c=>{ const m=M([c]); return [tlLabel(tlOf(c)), tcLabel(c)].concat(F.map(f=>raw(m,f))); }));
    name=`${v.mode==='tl'?'team':'org'}_portfolio_${S.product}.csv`;
  }
  const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
  toast(`Downloaded ${name}`);
};

render();
})();
