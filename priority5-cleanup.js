/* Cleanup helper for legacy inline Priority 5 markup.
   Safe to load after the page and before priority5.js.
*/
(function(){
  function cleanup(){
    var legacy=document.getElementById('priority5-brand-script');
    if(legacy) legacy.remove();
    var ids=['qghn-mascot','qghn-toast'];
    ids.forEach(function(id){var el=document.getElementById(id);if(el)el.remove();});
    document.querySelectorAll('.qghn-spark').forEach(function(el){el.remove();});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',cleanup,{once:true});
  else cleanup();
})();
