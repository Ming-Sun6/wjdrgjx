(function(){
  'use strict';

  var IDS=['all','tools','forum','calendar','my'];
  var LABELS={all:'全部',tools:'工具',forum:'交流论坛',calendar:'活动日历',my:'我的信息'};
  var items=[];
  var loaded=false;
  var bound=false;

  function byId(id){return document.getElementById(id);}
  function request(url,options){
    if(typeof apiFetch==='function') return apiFetch(url,options||{});
    return fetch(url,{credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},...(options||{})});
  }
  function setStatus(message,isError){
    var el=byId('homeNavigationStatus');
    if(el){el.textContent=message||'';el.style.color=isError?'var(--danger-text)':'var(--muted)';}
  }
  function setBusy(busy){
    var save=byId('homeNavigationSaveBtn');
    var reload=byId('homeNavigationReloadBtn');
    if(save) save.disabled=!!busy||!loaded;
    if(reload) reload.disabled=!!busy;
  }
  function normalize(value){
    var list=value&&Array.isArray(value.items)?value.items:[];
    var map=new Map(list.map(function(item){return [item.id,{visible:item.visible===true,adminOnly:item.adminOnly===true}];}));
    return IDS.map(function(id){
      var stored=map.get(id);
      return {id:id,visible:stored?stored.visible:true,adminOnly:stored?stored.adminOnly:false};
    });
  }
  function render(){
    var host=byId('homeNavigationItems');
    if(!host)return;
    host.innerHTML=items.map(function(item,index){
      return '<div class="tool-management-row" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">'+
        '<strong>'+LABELS[item.id]+'</strong>'+
        '<label class="tool-management-visible-label"><input class="home-navigation-visible" type="checkbox" data-home-navigation-id="'+item.id+'"'+(item.visible?' checked':'')+' />显示</label>'+
        '<label class="tool-management-visible-label"><input class="home-navigation-admin-only" type="checkbox" data-home-navigation-admin-id="'+item.id+'"'+(item.adminOnly?' checked':'')+' />仅管理员可见</label>'+
        '<span class="admin-status">位置 '+(index+1)+' · 桌面端与手机版同步</span></div>';
    }).join('');
  }
  async function load(){
    loaded=false;setBusy(true);setStatus('正在加载首页菜单配置…');
    try{
      var response=await request('/api/admin/home-navigation',{method:'GET'});
      var data=await response.json().catch(function(){return {};});
      if(!response.ok) throw new Error(response.status===401?'请先登录管理员账号':response.status===403?'仅管理员可修改首页菜单':'加载失败');
      items=normalize(data);loaded=true;render();
      setStatus(data.updatedAt?'配置已加载，上次更新：'+data.updatedAt:'已加载默认配置。');
    }catch(error){items=[];render();setStatus(error.message,true);}
    setBusy(false);
  }
  function collect(){
    return IDS.map(function(id){
      var checkbox=document.querySelector('[data-home-navigation-id="'+id+'"]');
      var adminOnly=document.querySelector('[data-home-navigation-admin-id="'+id+'"]');
      return {id:id,visible:!!(checkbox&&checkbox.checked),adminOnly:!!(adminOnly&&adminOnly.checked)};
    });
  }
  async function save(){
    if(!loaded){setStatus('请先成功加载菜单配置。',true);return;}
    var next=collect();
    if(!next.some(function(item){return item.visible && !item.adminOnly;})){setStatus('HOME_NAVIGATION_EMPTY：至少保留一个对所有人可见的首页菜单。',true);return;}
    setBusy(true);setStatus('正在保存…');
    try{
      var options={method:'PUT',body:JSON.stringify({items:next})};
      var response=await request('/api/admin/home-navigation',options);
      if(response.status===404||response.status===405) response=await request('/api/admin/home-navigation',{method:'POST',body:options.body});
      var data=await response.json().catch(function(){return {};});
      if(!response.ok) throw new Error(data.error==='HOME_NAVIGATION_EMPTY'?'至少保留一个对所有人可见的首页菜单。':data.error||'保存失败');
      items=normalize(data);loaded=true;render();setStatus('首页菜单配置已保存。');
    }catch(error){setStatus(error.message,true);}
    setBusy(false);
  }
  function bind(){
    if(bound||!byId('homeNavigationItems'))return;
    bound=true;
    byId('homeNavigationReloadBtn').addEventListener('click',load);
    byId('homeNavigationSaveBtn').addEventListener('click',save);
  }

  window.loadAdminHomeNavigation=function(){bind();return load();};
})();
