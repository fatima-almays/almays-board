/* Al Mays board: connects the page to Firebase (database + Google sign-in). */
(function(){
  var C = window.ALMAYS_CONFIG || {};
  var ready = new Promise(function(resolve){
    if(!C.firebase || !C.firebase.apiKey || String(C.firebase.apiKey).indexOf("PASTE")===0 || !window.firebase){ resolve(null); return; }
    try{
      firebase.initializeApp(C.firebase);
      var auth = firebase.auth(), fs = firebase.firestore(), first = true;
      /* manager's private link (?m=KEY): PIN screen first, then sign in as the manager for this browser session */
      var mKey = new URLSearchParams(location.search).get("m"), gate = false;
      auth.onAuthStateChanged(function(u){
        if(gate) return;
        if(first && mKey && !(u && !u.isAnonymous)){
          gate = true;
          var check = u ? fs.collection("bossLinks").doc(u.uid).get().then(function(s){ return s.exists; }, function(){ return false; }) : Promise.resolve(false);
          check.then(function(ok){ if(ok) location.replace(location.origin + location.pathname); else pinScreen(auth, fs, mKey); });
          return;
        }
        if(first){ first=false;
          /* roles live in the database rules (emails stay private): try reading the role docs */
          var probe = function(id){ return u ? fs.collection("roles").doc(id).get().then(function(){return true;},function(){return false;}) : Promise.resolve(false); };
          Promise.all([probe("owner"), probe("editor"), probe("boss")]).then(function(r){ resolve({auth:auth, fs:fs, u:u, role:{isOwner:r[0], isEditor:r[0]||r[1], isBoss:!r[0]&&r[2]}}); });
        }
        else { location.reload(); }
      });
    }catch(e){ console.error(e); resolve(null); }
  });
  window.claude = { use: async function(name){
    var R = await ready; if(!R) return null;
    var fs = R.fs, u = R.u, role = R.role;
    if(name === "db") return fs;
    if(name === "user") return {
      isOwner: async function(){ return role.isOwner; },
      isBoss: async function(){ return role.isBoss; },
      canEdit: async function(){ return role.isEditor; },
      can: async function(n){ return n === "data.write" ? role.isEditor : false; },
      id: async function(){ return u ? u.uid : null; },
      me: async function(){ return u ? {id:u.uid, name:u.displayName||""} : null; },
      profiles: async function(ids){
        var out = {};
        await Promise.all((ids||[]).map(function(id){
          return fs.collection("people").doc(id).get().then(function(d){ out[id] = {name: d.exists ? (d.data().name||"") : ""}; }).catch(function(){ out[id] = {name:""}; });
        }));
        return out;
      }
    };
    if(name === "downloads") return { save: async function(o){
      var blob = o.data instanceof Blob ? o.data : new Blob([o.data], {type: /\.csv$/i.test(o.filename) ? "text/csv;charset=utf-8" : "text/html;charset=utf-8"});
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = o.filename; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      return {status:"saved"};
    }};
    return null;
  }};

  /* sign-in button in the header + first-time data import */
  function esc(s){ return String(s||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
  document.addEventListener("DOMContentLoaded", async function(){
    var R = await ready; var meta = document.querySelector(".band-meta"); if(!meta) return;
    var box = document.createElement("div"); box.className = "acct"; meta.appendChild(box);
    if(!R){ box.innerHTML = '<span class="acct-note" title="Firebase is not set up yet">Offline copy</span>'; return; }
    var u = R.u, role = R.role;
    if(!u){
      box.innerHTML = '<button type="button" class="acct-btn" id="acctIn"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z"/></svg><span>Sign in</span></button>';
      box.querySelector("#acctIn").onclick = function(){ R.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function(e){ alertBar("Sign-in didn't finish: "+(e && e.message || e)); }); };
    }else{
      var ini = (u.displayName||u.email||(role.isBoss?"Mohammad":"?")).trim().charAt(0).toUpperCase();
      box.innerHTML = '<button type="button" class="acct-btn signed" id="acctOut" title="Signed in as '+esc(u.email||(role.isBoss?"Manager":"guest"))+' · click to sign out"><b>'+esc(ini)+'</b><span>'+(role.isEditor? "Editor":role.isBoss? "Manager":"Viewer")+'</span></button>';
      box.querySelector("#acctOut").onclick = function(){ R.auth.signOut(); };
      if(!u.isAnonymous){ try{ await R.fs.collection("people").doc(u.uid).set({name: u.displayName || "Team member"}, {merge:true}); }catch(e){} }
      if(role.isEditor){
        try{
          var probe = await R.fs.collection("tasks").limit(1).get();
          var el = document.getElementById("snapData");
          if(probe.empty && el){ offerImport(R.fs, JSON.parse(el.textContent)); }
        }catch(e){}
      }
    }
  });
  function pinScreen(auth, fs, key){
    var css = '#pinGate div,#pinGate p,#pinGate h1,#pinGate form,#pinGate span,#pinGate img,#pinGate input,#pinGate button,#pinGate svg{all:revert;box-sizing:border-box}'
      + '#pinGate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px 16px;overflow:auto;font-family:Montserrat,system-ui,"Segoe UI",Arial,sans-serif;color:#fff;'
      + 'background:radial-gradient(900px 520px at 85% -10%,rgba(174,196,134,.35),transparent 60%),radial-gradient(700px 500px at -10% 110%,rgba(114,140,130,.45),transparent 60%),linear-gradient(160deg,#3f5a4d 0%,#2b4137 55%,#1d2d26 100%)}'
      + '#pinGate .pg-deco{position:absolute;inset:0;pointer-events:none;overflow:hidden}#pinGate .pg-deco svg{position:absolute;opacity:.18}'
      + '#pinGate .pg-form{position:relative;width:min(420px,100%);text-align:center;animation:pgIn .6s cubic-bezier(.2,.8,.2,1) both}'
      + '#pinGate .pg-logo{height:58px;width:auto;display:block;margin:0 auto 26px;filter:drop-shadow(0 4px 14px rgba(0,0,0,.25))}'
      + '#pinGate .pg-card{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:22px;padding:30px 26px 26px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 30px 80px rgba(0,0,0,.35)}'
      + '#pinGate .pg-kicker{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#AEC486;background:rgba(174,196,134,.12);border:1px solid rgba(174,196,134,.3);padding:5px 12px;border-radius:999px;margin-bottom:16px}'
      + '#pinGate h1{margin:0;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.01em}#pinGate h1 .pg-wave{display:inline-block;animation:pgWave 2.2s ease-in-out 1s 2;transform-origin:70% 70%}'
      + '#pinGate .pg-ar{margin:6px 0 0;font-size:20px;font-weight:600;color:#d9e6c6;font-family:"Tajawal","Segoe UI",Tahoma,sans-serif}'
      + '#pinGate .pg-sub{margin:16px 0 22px;font-size:13.5px;color:rgba(255,255,255,.72)}'
      + '#pinGate .pg-boxes{display:flex;gap:12px;justify-content:center;margin:0 auto}'
      + '#pinGate .pg-boxes input{width:58px;height:66px;box-sizing:border-box;text-align:center;font:700 28px Montserrat,system-ui,sans-serif;color:#fff;background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.28);border-radius:14px;caret-color:#AEC486;transition:border-color .2s,background .2s,transform .2s;-webkit-text-security:disc}'
      + '#pinGate .pg-boxes input:focus{outline:none;border-color:#AEC486;background:rgba(174,196,134,.16);transform:translateY(-2px)}'
      + '#pinGate .pg-boxes input.pg-f{border-color:rgba(174,196,134,.75)}'
      + '#pinGate button{margin-top:22px;width:100%;padding:14px;border:0;border-radius:14px;background:#AEC486;color:#1d2d26;font:700 15px Montserrat,system-ui,sans-serif;letter-spacing:.02em;cursor:pointer;transition:filter .2s,transform .1s}'
      + '#pinGate button:hover{filter:brightness(1.06)}#pinGate button:active{transform:scale(.99)}#pinGate button:disabled{opacity:.7;cursor:default}'
      + '#pinGate .pg-err{color:#ffb4a9;font-size:13px;margin-top:12px;min-height:18px}#pinGate .pg-foot{margin-top:18px;font-size:11.5px;color:rgba(255,255,255,.5);letter-spacing:.04em}'
      + '#pinGate .pg-sh{animation:pgSh .4s}@keyframes pgSh{20%,60%{transform:translateX(-9px)}40%,80%{transform:translateX(9px)}}'
      + '@keyframes pgIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes pgWave{0%,60%,100%{transform:rotate(0)}10%,30%{transform:rotate(14deg)}20%{transform:rotate(-8deg)}40%{transform:rotate(-4deg)}50%{transform:rotate(10deg)}}'
      + '#pinGate .pg-deco svg{position:absolute}#pinGate .pg-form{display:block;margin:auto}#pinGate .pg-boxes input{display:block;margin:0;padding:0}'
      + '@media (max-height:620px){#pinGate .pg-logo{height:42px;margin-bottom:16px}#pinGate .pg-card{padding:22px 24px 20px}#pinGate h1{font-size:26px}#pinGate .pg-sub{margin:10px 0 16px}#pinGate button{margin-top:16px;padding:12px}#pinGate .pg-foot{display:none}}'
      + '@media (max-width:420px){#pinGate h1{font-size:25px}#pinGate .pg-boxes input{width:52px;height:60px}#pinGate .pg-card{padding:26px 18px 22px}}';
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var leaf = '<svg viewBox="0 0 120 60" width="%W" style="%S"><path fill="#AEC486" d="M6 54C10 22 38 6 70 8c-4 30-30 48-64 46z"/><path fill="#728C82" d="M114 54C110 26 88 10 60 12c4 26 24 42 54 42z"/></svg>';
    var mk = function(w, s){ return leaf.replace("%W", w).replace("%S", s); };
    var g = document.createElement("div"); g.id = "pinGate"; g.setAttribute("role", "dialog"); g.setAttribute("aria-label", "Manager sign in");
    g.innerHTML = '<div class="pg-deco">' + mk(320, "top:-40px;right:-60px;transform:rotate(-18deg)") + mk(260, "bottom:-30px;left:-50px;transform:rotate(14deg)") + mk(140, "top:38%;left:6%;opacity:.1") + '</div>'
      + '<form class="pg-form" autocomplete="off" novalidate><img class="pg-logo" alt="Al Mays Catering Solutions">'
      + '<div class="pg-card"><span class="pg-kicker">Marketing Weekly Board</span>'
      + '<h1>Hello Boss <span class="pg-wave">👋</span></h1>'
      + '<p class="pg-sub">Enter your PIN to open the dashboard</p>'
      + '<div class="pg-boxes">' + [0,1,2,3].map(function(n){ return '<input type="tel" inputmode="numeric" autocomplete="one-time-code" aria-label="PIN digit '+(n+1)+'">'; }).join("") + '</div>'
      + '<button type="submit" id="pgGo">Open dashboard</button><div class="pg-err" id="pgErr" role="alert"></div></div>'
      + '<div class="pg-foot">AL MAYS CATERING SOLUTIONS · MARKETING</div></form>';
    var ins = g.querySelectorAll(".pg-boxes input"), b = g.querySelector("#pgGo"), er = g.querySelector("#pgErr"), form = g.querySelector("form");
    var mount = function(){
      var src = document.querySelector("header img.logo, img.logo"); if(src) g.querySelector(".pg-logo").src = src.src; else g.querySelector(".pg-logo").remove();
      document.body.appendChild(g); document.documentElement.style.overflow = "hidden"; ins[0].focus();
    };
    if(document.readyState !== "loading") mount(); else document.addEventListener("DOMContentLoaded", mount);
    ins.forEach(function(inp, n){
      inp.addEventListener("input", function(){
        var v = inp.value.replace(/\D/g, "");
        if(v.length > 1){ v.split("").forEach(function(ch, k){ if(ins[n+k]) ins[n+k].value = ch; }); }
        else inp.value = v;
        ins.forEach(function(x){ x.classList.toggle("pg-f", !!x.value); });
        var next = Array.prototype.find.call(ins, function(x){ return !x.value; });
        if(v && next) next.focus(); else if(v && !next) submit();
      });
      inp.addEventListener("keydown", function(e){
        if(e.key === "Backspace" && !inp.value && n > 0){ ins[n-1].value = ""; ins[n-1].classList.remove("pg-f"); ins[n-1].focus(); e.preventDefault(); }
        if(e.key === "ArrowLeft" && n > 0) ins[n-1].focus();
        if(e.key === "ArrowRight" && n < ins.length-1) ins[n+1].focus();
      });
    });
    var busy = false;
    var submit = function(){
      if(busy) return;
      var pin = Array.prototype.map.call(ins, function(x){ return x.value; }).join("");
      if(pin.length < ins.length){ er.textContent = "Please enter all " + ins.length + " digits."; return; }
      busy = true; b.disabled = true; b.textContent = "Checking…"; er.textContent = "";
      auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).then(function(){
        return auth.currentUser ? {user: auth.currentUser} : auth.signInAnonymously();
      }).then(function(c){
        return fs.collection("bossLinks").doc(c.user.uid).set({key: key + "-" + pin, at: new Date().toISOString()}).then(function(){
          return fs.collection("people").doc(c.user.uid).set({name: "Mohammad"}, {merge: true});
        });
      }).then(function(){ b.textContent = "Welcome, Boss ✓"; location.replace(location.origin + location.pathname); }, function(e){
        console.error(e); busy = false; b.disabled = false; b.textContent = "Open dashboard";
        ins.forEach(function(x){ x.value = ""; x.classList.remove("pg-f"); }); ins[0].focus();
        er.textContent = "Incorrect PIN. Please try again."; var c = g.querySelector(".pg-card"); c.classList.remove("pg-sh"); void c.offsetWidth; c.classList.add("pg-sh");
      });
    };
    form.onsubmit = function(ev){ ev.preventDefault(); submit(); };
  }
  function alertBar(msg){ var b=document.createElement("div"); b.className="acct-bar"; b.textContent=msg; document.body.appendChild(b); setTimeout(function(){b.remove();},6000); }
  function offerImport(fs, sn){
    var n = (sn.tasks||[]).length;
    var bar = document.createElement("div"); bar.className = "acct-bar import";
    bar.innerHTML = '<span>The online database is empty. Import the board data from Claude ('+n+' tasks)?</span><button type="button">Import now</button>';
    document.body.appendChild(bar);
    bar.querySelector("button").onclick = async function(){
      this.disabled = true; this.textContent = "Importing…";
      var strip = function(d){ var o = Object.assign({}, d); delete o.id; return o; };
      var writes = [];
      if(sn.settings) writes.push(["settings","report",sn.settings]);
      ["tasks","comments","reactions","manager","monthly","plans"].forEach(function(c){ (sn[c]||[]).forEach(function(d){ writes.push([c, d.id, strip(d)]); }); });
      try{
        for(var i=0;i<writes.length;i+=400){
          var b = fs.batch(); writes.slice(i,i+400).forEach(function(w){ b.set(fs.collection(w[0]).doc(w[1]), w[2]); }); await b.commit();
        }
        bar.innerHTML = "<span>Imported "+writes.length+" records. Reloading…</span>"; setTimeout(function(){ location.reload(); }, 1200);
      }catch(e){ bar.innerHTML = "<span>Import failed: "+esc(e && e.message || e)+"</span>"; }
    };
  }
})();
