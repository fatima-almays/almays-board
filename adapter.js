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
    var css = '#pinGate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:radial-gradient(1200px 600px at 70% -10%,#728C82 0%,#4C685A 45%,#22332c 100%);font-family:inherit;padding:16px}'
      + '#pinGate .pg{width:min(360px,100%);background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.35);padding:28px 24px 22px;text-align:center;color:#22332c}'
      + '#pinGate img{height:44px;margin:0 auto 14px;display:block}#pinGate h2{margin:0 0 4px;font-size:19px}#pinGate p{margin:0 0 18px;color:#5b6b64;font-size:13.5px}'
      + '#pinGate input{width:100%;box-sizing:border-box;text-align:center;font-size:26px;letter-spacing:12px;padding:12px 10px;border:1.5px solid #cfd8d3;border-radius:12px;font-family:inherit;color:#22332c}'
      + '#pinGate input:focus{outline:3px solid #AEC486;border-color:#4C685A}#pinGate button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:12px;background:#4C685A;color:#fff;font:600 15px inherit;font-family:inherit;cursor:pointer}'
      + '#pinGate button:disabled{opacity:.7;cursor:default}#pinGate .err{color:#b3261e;font-size:13px;margin-top:10px;min-height:18px}#pinGate .sh{animation:pgsh .35s}@keyframes pgsh{25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}';
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var logo = document.querySelector('header img, .band img');
    var g = document.createElement("div"); g.id = "pinGate";
    g.innerHTML = '<form class="pg" autocomplete="off">' + (logo ? '<img src="'+logo.src+'" alt="Al Mays">' : '')
      + '<h2>Marketing Weekly Board</h2><p>Enter your PIN to continue</p>'
      + '<input id="pgIn" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" aria-label="PIN" autofocus>'
      + '<button type="submit" id="pgGo">Enter</button><div class="err" id="pgErr"></div></form>';
    var mount = function(){ document.body.appendChild(g); var i = g.querySelector("#pgIn"); i.focus(); i.oninput = function(){ i.value = i.value.replace(/\D/g, ""); }; };
    if(document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
    g.querySelector("form").onsubmit = function(ev){
      ev.preventDefault();
      var i = g.querySelector("#pgIn"), b = g.querySelector("#pgGo"), er = g.querySelector("#pgErr"), pin = i.value.trim();
      if(!pin){ i.focus(); return; }
      b.disabled = true; b.textContent = "Checking…"; er.textContent = "";
      auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).then(function(){
        return auth.currentUser ? {user: auth.currentUser} : auth.signInAnonymously();
      }).then(function(c){
        return fs.collection("bossLinks").doc(c.user.uid).set({key: key + "-" + pin, at: new Date().toISOString()}).then(function(){
          return fs.collection("people").doc(c.user.uid).set({name: "Mohammad"}, {merge: true});
        });
      }).then(function(){ b.textContent = "Welcome ✓"; location.replace(location.origin + location.pathname); }, function(e){
        console.error(e); b.disabled = false; b.textContent = "Enter"; i.value = ""; i.focus();
        er.textContent = "Incorrect PIN. Please try again."; var f = g.querySelector(".pg"); f.classList.remove("sh"); void f.offsetWidth; f.classList.add("sh");
      });
    };
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
