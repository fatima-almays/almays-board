/* Al Mays board: connects the page to Firebase (database + Google sign-in). */
(function(){
  var C = window.ALMAYS_CONFIG || {};
  var ready = new Promise(function(resolve){
    if(!C.firebase || !C.firebase.apiKey || String(C.firebase.apiKey).indexOf("PASTE")===0 || !window.firebase){ resolve(null); return; }
    try{
      firebase.initializeApp(C.firebase);
      var auth = firebase.auth(), fs = firebase.firestore(), first = true;
      auth.onAuthStateChanged(function(u){
        if(first){ first=false;
          /* roles live in the database rules (emails stay private): try reading the role docs */
          var probe = function(id){ return u ? fs.collection("roles").doc(id).get().then(function(){return true;},function(){return false;}) : Promise.resolve(false); };
          Promise.all([probe("owner"), probe("editor")]).then(function(r){ resolve({auth:auth, fs:fs, u:u, role:{isOwner:r[0], isEditor:r[0]||r[1]}}); });
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
      var ini = (u.displayName||u.email||"?").trim().charAt(0).toUpperCase();
      box.innerHTML = '<button type="button" class="acct-btn signed" id="acctOut" title="Signed in as '+esc(u.email)+' · click to sign out"><b>'+esc(ini)+'</b><span>'+(role.isEditor? "Editor":"Viewer")+'</span></button>';
      box.querySelector("#acctOut").onclick = function(){ R.auth.signOut(); };
      try{ await R.fs.collection("people").doc(u.uid).set({name: u.displayName || "Team member"}, {merge:true}); }catch(e){}
      if(role.isEditor){
        try{
          var probe = await R.fs.collection("tasks").limit(1).get();
          var el = document.getElementById("snapData");
          if(probe.empty && el){ offerImport(R.fs, JSON.parse(el.textContent)); }
        }catch(e){}
      }
    }
  });
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
