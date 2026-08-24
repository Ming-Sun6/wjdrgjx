// 登录/注册（JWT HttpOnly Cookie）
let authUser=null,authChecked=false;

async function apiFetch(url,opts){ return await fetch(url,{credentials:'include',cache:'no-store',...opts,headers:{'Content-Type':'application/json',...(opts?.headers||{})}}); }
async function apiFetchWithTimeout(url, opts, timeoutMs){
  var controller=new AbortController();
  var timer=setTimeout(function(){ controller.abort(); }, timeoutMs || 15000);
  try{
    return await apiFetch(url,{...opts,signal:controller.signal});
  }finally{
    clearTimeout(timer);
  }
}
function updateAuthUI(){
  var p=document.getElementById('authPill'),L=document.getElementById('btnLogin'),O=document.getElementById('btnLogout');
  if(!p||!L||!O)return;
  var showName = authUser ? (authUser.username || authUser.loginId || '') : '';
  if(authUser){ p.textContent=showName; L.style.display='none'; O.textContent='退出'; O.style.display=''; }
  else{ p.textContent='未登录'; L.style.display=''; O.style.display='none'; }
}
var DEFAULT_PROFILE_BIO='这个人很高冷，连个人介绍都不改！';
var PROFILE_BIO_MAX_CHARS=120;
function countChars(str){ return Array.from(String(str||'')).length; }
function normalizeProfileBioText(value){
  var text=String(value==null?'':value).trim();
  return text || DEFAULT_PROFILE_BIO;
}
var weakPasswordList = ['12345678','123456789','1234567890','123456789qaz','qaz123456','qwerty','qwerty123','password','abc123456','abc12345','11111111','00000000','87654321','1q2w3e4r','1q2w3e4r5t','1qaz2wsx','1qaz2wsx3edc'];
function isWeakPassword(p){
  var lower=String(p||'').toLowerCase();
  return weakPasswordList.indexOf(lower)>=0;
}
function isValidId(id){
  return /^[A-Za-z0-9_]{8,18}$/.test(id||'');
}
function isValidPassword(p){
  if(!p || p.length<8 || p.length>18) return false;
  if(!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return false;
  if(isWeakPassword(p)) return false;
  return true;
}
var displayNameRe = null;
try{
  displayNameRe = new RegExp('^[\\p{L}\\p{N}_]+$','u');
}catch(e){
  displayNameRe = null;
}
function isValidDisplayName(name){
  var n=String(name||'');
  if(n.trim()!==n) return false;
  var len=countChars(n);
  if(len<2 || len>15) return false;
  if(displayNameRe) return displayNameRe.test(n);
  return /^[A-Za-z0-9_\\u4e00-\\u9fa5]+$/.test(n);
}
function formatShortDate(value){
  if(!value) return '—';
  var d=new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  var pad=function(n){return String(n).padStart(2,'0');};
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function normalizeGenderCode(value){
  var g=String(value||'').trim().toLowerCase();
  if(g==='male' || g==='female') return g;
  return 'unknown';
}
function getGenderText(value){
  var g=normalizeGenderCode(value);
  if(g==='male') return '男';
  if(g==='female') return '女';
  return '保密';
}
function normalizeBirthdayText(value){
  var text=String(value||'').trim();
  if(!text) return '';
  var m=text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return m[1]+'-'+m[2]+'-'+m[3];
  var d=new Date(text);
  if(Number.isNaN(d.getTime())) return '';
  var pad=function(n){ return String(n).padStart(2,'0'); };
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function getZodiacByBirthday(value){
  var dateText=normalizeBirthdayText(value);
  var m=dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return '';
  var month=Number(m[2]);
  var day=Number(m[3]);
  if((month===1&&day>=20)||(month===2&&day<=18)) return '水瓶座';
  if((month===2&&day>=19)||(month===3&&day<=20)) return '双鱼座';
  if((month===3&&day>=21)||(month===4&&day<=19)) return '白羊座';
  if((month===4&&day>=20)||(month===5&&day<=20)) return '金牛座';
  if((month===5&&day>=21)||(month===6&&day<=21)) return '双子座';
  if((month===6&&day>=22)||(month===7&&day<=22)) return '巨蟹座';
  if((month===7&&day>=23)||(month===8&&day<=22)) return '狮子座';
  if((month===8&&day>=23)||(month===9&&day<=22)) return '处女座';
  if((month===9&&day>=23)||(month===10&&day<=23)) return '天秤座';
  if((month===10&&day>=24)||(month===11&&day<=22)) return '天蝎座';
  if((month===11&&day>=23)||(month===12&&day<=21)) return '射手座';
  return '摩羯座';
}
function getUsernameChangeRemaining(){
  if(!authUser) return 2;
  var v=Number(authUser.usernameChangeRemaining);
  if(Number.isFinite(v)) return Math.max(0, v);
  return 2;
}
function getNextUsernameChangeAt(){
  if(authUser && authUser.usernameChangeNextAt){
    var nextFromApi=new Date(authUser.usernameChangeNextAt);
    if(!Number.isNaN(nextFromApi.getTime())) return nextFromApi;
  }
  return null;
}
function renderMe(){
  var box=document.getElementById('meSummary');
  if(!box)return;
  if(!authUser){
    box.innerHTML='当前未登录，请点击右上角“登录/注册”后再查看账号与会员信息。';
  }else{
    var status=authUser.membershipStatus||'none';
    var statusMap={none:'未开通',active:'已开通',expired:'已过期',lifetime:'永久'};
    var statusText=statusMap[status]||status;
    var exp=authUser.membershipExpiresAt;
    var expText='—';
    if(exp){
      var d=new Date(exp);
      if(!Number.isNaN(d.getTime())){
        var pad=function(n){return String(n).padStart(2,'0');};
        expText=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());
      }
    }
    var nextChange=getNextUsernameChangeAt();
    var remain=getUsernameChangeRemaining();
    var canChangeText=remain>0 ? ('本月剩余修改次数：'+remain) : ('本月已达上限，下月可修改：'+formatShortDate(nextChange));
    var showId = authUser.loginId || authUser.username;
    var safeShowId = escapeHtml(showId);
    var displayNameHtml = renderDisplayNameWithBadges(authUser, authUser.username || showId, 'me-profile-name');
    var safeStatus = escapeHtml(statusText);
    var safeExp = escapeHtml(expText);
    var safeChange = escapeHtml(canChangeText);
    var safeBio = escapeHtmlWithBreaks(normalizeProfileBioText(authUser && authUser.bio));
    var safeAvatar = renderAvatarHtml(authUser, authUser.username || showId, 'me-avatar');
    var followingCount = Math.max(0, Number(authUser.followingCount || 0));
    var followerCount = Math.max(0, Number(authUser.followerCount || 0));
    box.innerHTML =
      '<div class="me-profile-head">'+
        safeAvatar+
        '<div class="me-profile-main">'+
          '<div>'+displayNameHtml+'</div>'+
          '<div class="me-profile-id">ID：'+safeShowId+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="info-row"><span class="info-label">会员状态</span><span class="info-value">'+safeStatus+'</span></div>'+
      '<div class="info-row"><span class="info-label">到期时间</span><span class="info-value">'+safeExp+'</span></div>'+
      '<div class="info-row"><span class="info-label">用户名修改</span><span class="info-value">'+safeChange+'</span></div>'+
      '<div class="me-profile-bio"><span class="info-label">个人介绍</span><div class="info-value">'+safeBio+'</div></div>'+
      '<div class="me-social-actions">'+
        '<button class="btn secondary me-social-btn" type="button" data-me-open="following">我的关注：'+followingCount+'</button>'+
        '<button class="btn secondary me-social-btn" type="button" data-me-open="followers">我的粉丝：'+followerCount+'</button>'+
      '</div>';
  }
  renderMeRewards();
}
var meRewardsState={loading:false,rewards:null};
function setMeRewardsStatus(message,isError){
  var el=document.getElementById('meRewardsStatus');
  if(!el) return;
  if(message){
    el.textContent=message;
    el.style.display='';
    el.style.color=isError?'#fca5a5':'#86efac';
  }else{
    el.textContent='';
    el.style.display='none';
  }
}
function setMeRedeemStatus(message,isError){
  var el=document.getElementById('meRedeemStatus');
  if(!el) return;
  if(message){
    el.textContent=message;
    el.style.display='';
    el.style.color=isError?'#fca5a5':'#86efac';
  }else{
    el.textContent='';
    el.style.display='none';
  }
}
function renderMeRewards(){
  var pointsEl=document.getElementById('mePointsValue');
  var streakEl=document.getElementById('meStreakValue');
  var nextEl=document.getElementById('meNextRewardValue');
  var hintEl=document.getElementById('meRewardsHint');
  var checkBtn=document.getElementById('meCheckInBtn');
  var redeemBtn=document.getElementById('meRedeemCodeBtn');
  var redeemInput=document.getElementById('meRedeemCodeInput');
  var shopBtn=document.getElementById('openMeShopModalBtn');
  var rankingBtn=document.getElementById('openMePointsRankingBtn');
  var redeemModalBtn=document.getElementById('openMeRedeemModalBtn');
  if(!authUser){
    if(pointsEl) pointsEl.textContent='—';
    if(streakEl) streakEl.textContent='—';
    if(nextEl) nextEl.textContent='—';
    if(hintEl) hintEl.textContent='请先登录后参与签到与兑换。';
    if(checkBtn){ checkBtn.disabled=true; checkBtn.textContent='签到领取积分'; }
    if(redeemBtn) redeemBtn.disabled=true;
    if(redeemInput) redeemInput.disabled=true;
    if(shopBtn) shopBtn.disabled=true;
    if(rankingBtn) rankingBtn.disabled=true;
    if(redeemModalBtn) redeemModalBtn.disabled=true;
    return;
  }
  if(shopBtn) shopBtn.disabled=false;
  if(rankingBtn) rankingBtn.disabled=false;
  if(redeemModalBtn) redeemModalBtn.disabled=false;
  if(redeemInput) redeemInput.disabled=false;
  if(redeemBtn) redeemBtn.disabled=false;
  var r=meRewardsState.rewards;
  if(meRewardsState.loading || !r){
    if(pointsEl) pointsEl.textContent='...';
    if(streakEl) streakEl.textContent='...';
    if(nextEl) nextEl.textContent='...';
    if(checkBtn){ checkBtn.disabled=true; checkBtn.textContent='加载中...'; }
    return;
  }
  var points=Math.max(0, Number(r.points||authUser.points||0));
  if(pointsEl) pointsEl.textContent=String(points);
  authUser.points=points;
  var streak=r.checkedToday ? Number(r.currentStreak||0) : Number(r.currentStreak||0);
  if(streakEl) streakEl.textContent=(r.checkedToday?String(streak):String(streak))+' 天';
  if(nextEl) nextEl.textContent='+'+String(r.nextRewardPoints||2)+' 积分';
  if(hintEl){
    if(r.checkedToday){
      var earned=Number(r.todayPointsEarned||0);
      hintEl.textContent='今日已签到，获得 '+earned+' 积分。连续签到满 7 天当日额外 +5 积分。';
    }else{
      hintEl.textContent='每日签到 +2 积分；连续签到 7 天当日额外 +5 积分（今日可得 '+String(r.nextRewardPoints||2)+' 积分）。';
    }
  }
  if(checkBtn){
    checkBtn.disabled=!!r.checkedToday;
    checkBtn.textContent=r.checkedToday?'今日已签到':'签到领取积分';
  }
}
async function loadMeRewards(){
  if(!authUser){
    meRewardsState.rewards=null;
    renderMeRewards();
    return;
  }
  meRewardsState.loading=true;
  renderMeRewards();
  try{
    var r=await apiFetch('/api/me/rewards',{method:'GET'});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      meRewardsState.rewards=null;
      if(d&&d.error==='SCHEMA_NOT_READY'){
        setMeRewardsStatus('签到功能正在升级，请稍后刷新或联系管理员重启服务','error');
      }else{
        setMeRewardsStatus('签到信息加载失败','error');
      }
      return;
    }
    meRewardsState.rewards=d.rewards||null;
    setMeRewardsStatus('','');
  }catch(e){
    meRewardsState.rewards=null;
    setMeRewardsStatus('签到信息加载失败：'+(e.message||'网络错误'),'error');
  }finally{
    meRewardsState.loading=false;
    renderMeRewards();
  }
}
async function doMeCheckIn(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var btn=document.getElementById('meCheckInBtn');
  if(btn) btn.disabled=true;
  setMeRewardsStatus('签到中...','');
  try{
    var r=await apiFetch('/api/me/check-in',{method:'POST',body:'{}'});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      var msg='签到失败';
      if(d&&d.error==='ALREADY_CHECKED_IN') msg='今日已签到';
      setMeRewardsStatus(msg,'error');
      return;
    }
    if(d&&d.rewards) meRewardsState.rewards=d.rewards;
    if(d&&d.checkIn){
      var earned=Number(d.checkIn.pointsEarned||0);
      var bonus=d.checkIn.bonusAwarded?'（含连续7天奖励）':'';
      setMeRewardsStatus('签到成功，获得 '+earned+' 积分'+bonus,'');
      showDevToast('签到成功 +' + earned + ' 积分');
    }
    if(d&&d.rewards&&d.rewards.points!=null) authUser.points=d.rewards.points;
    renderMe();
  }catch(e){
    setMeRewardsStatus('签到失败：'+(e.message||'网络错误'),'error');
  }finally{
    renderMeRewards();
  }
}
async function doMeRedeemCode(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var input=document.getElementById('meRedeemCodeInput');
  var code=String(input&&input.value||'').trim();
  if(!code){ setMeRedeemStatus('请输入激活码','error'); return; }
  var btn=document.getElementById('meRedeemCodeBtn');
  if(btn) btn.disabled=true;
  setMeRedeemStatus('兑换中...','');
  var successMsg='';
  try{
    var r=await apiFetch('/api/me/redeem-code',{method:'POST',body:JSON.stringify({code:code})});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      var map={
        BAD_CODE:'激活码格式无效',
        CODE_NOT_FOUND:'激活码不存在',
        CODE_EXPIRED:'激活码已过期',
        CODE_NOT_STARTED:'激活码尚未生效',
        CODE_DISABLED:'激活码已停用',
        CODE_EXHAUSTED:'激活码已被用完',
        CODE_ALREADY_USED:'您已达到该激活码的使用上限',
        SHOP_ITEM_NOT_FOUND:'关联商城道具不存在'
      };
      setMeRedeemStatus(map[d.error]||'兑换失败','error');
      return;
    }
    if(d&&d.user) authUser=d.user;
    if(d&&d.rewards) meRewardsState.rewards=d.rewards;
    successMsg='兑换成功';
    if(d&&d.redemption){
      if(d.redemption.type==='points') successMsg='兑换成功，获得 '+Number(d.redemption.pointsAdded||0)+' 积分';
      else if(d.redemption.type==='membership'){
        successMsg=d.redemption.membershipStatus==='lifetime'?'兑换成功，已开通永久会员':'兑换成功，会员已延长';
      } else if(d.redemption.type==='combo'){
        successMsg='兑换成功，获得 '+Number(d.redemption.pointsAdded||0)+' 积分并延长会员';
      } else if(d.redemption.type==='shop_item'){
        successMsg='兑换成功：'+(d.redemption.shopItemName||'商城道具');
      }
    }
  }catch(e){
    setMeRedeemStatus('兑换失败：'+(e.message||'网络错误'),'error');
    return;
  }finally{
    if(btn) btn.disabled=false;
  }
  setMeRedeemStatus(successMsg,'');
  showDevToast(successMsg);
  if(input) input.value='';
  try{
    renderMe();
    renderMeRewards();
  }catch(e){}
}
var mePointsRankingState={loading:false,leaders:[],me:null};
function pointsRankingRowHtml(item,isMe){
  if(!item) return '';
  return '<div class="points-ranking-row'+(isMe?' is-me':'')+'">'
    +'<div class="points-ranking-rank">#'+Math.max(1,Number(item.rank||1))+'</div>'
    +'<button class="points-ranking-user" type="button" data-user-id="'+Number(item.id)+'">'+escapeHtml(item.username||('用户'+item.id))+'</button>'
    +'<div class="points-ranking-points">'+Math.max(0,Number(item.points||0))+' 积分</div>'
    +'</div>';
}
function renderMePointsRanking(){
  var list=document.getElementById('mePointsRankingList');
  var self=document.getElementById('mePointsRankingSelf');
  var status=document.getElementById('mePointsRankingStatus');
  if(!list||!self) return;
  if(mePointsRankingState.loading){
    list.innerHTML='<div class="forum-status">正在加载积分排名...</div>';
    self.innerHTML='';
    if(status) status.style.display='none';
    return;
  }
  var leaders=Array.isArray(mePointsRankingState.leaders)?mePointsRankingState.leaders:[];
  list.innerHTML=leaders.length?leaders.map(function(item){
    return pointsRankingRowHtml(item,authUser&&Number(item.id)===Number(authUser.id));
  }).join(''):'<div class="forum-empty"><div class="forum-empty-title">暂无排名数据</div></div>';
  self.innerHTML=mePointsRankingState.me
    ? '<div class="me-rewards-hint">我的积分及排名</div>'+pointsRankingRowHtml(mePointsRankingState.me,true)
    : '';
}
async function loadMePointsRanking(){
  if(!authUser) return;
  mePointsRankingState.loading=true;
  renderMePointsRanking();
  try{
    var r=await apiFetch('/api/me/points-ranking',{method:'GET'});
    var d=await r.json().catch(function(){return {};});
    if(!r.ok) throw new Error('积分排名加载失败');
    mePointsRankingState.leaders=Array.isArray(d.leaders)?d.leaders:[];
    mePointsRankingState.me=d.me||null;
  }catch(e){
    mePointsRankingState.leaders=[];
    mePointsRankingState.me=null;
    var status=document.getElementById('mePointsRankingStatus');
    if(status){status.textContent=e.message||'积分排名加载失败';status.style.display='';}
  }finally{
    mePointsRankingState.loading=false;
    renderMePointsRanking();
  }
}
function openMePointsRanking(){
  if(!authUser){showDevToast('请先登录');return;}
  var modal=document.getElementById('mePointsRankingModal');
  if(!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  syncBodyNoScroll();
  loadMePointsRanking();
}
function closeMePointsRanking(){
  var modal=document.getElementById('mePointsRankingModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  syncBodyNoScroll();
}
var meShopState={loading:false,items:[]};
function shopRewardText(item){
  if(!item) return '';
  if(item.itemType==='points') return '获得 '+item.pointsReward+' 积分';
  if(item.itemType==='membership') return item.membershipDays===0?'永久会员':item.membershipDays+' 天会员';
  if(item.itemType==='combo'){
    var mem=item.membershipDays===0?'永久会员':item.membershipDays+' 天会员';
    return '+'+item.pointsReward+' 积分 + '+mem;
  }
  return '';
}
function setMeShopStatus(message,isError){
  var el=document.getElementById('meShopStatus');
  if(!el) return;
  if(message){ el.textContent=message; el.style.display=''; el.style.color=isError?'#fca5a5':'#86efac'; }
  else { el.textContent=''; el.style.display='none'; }
}
function renderMeShop(){
  var grid=document.getElementById('meShopGrid');
  var hint=document.getElementById('meShopHint');
  if(!grid) return;
  if(!authUser){
    if(hint) hint.textContent='请先登录后使用积分商城。';
    grid.innerHTML='<div class="me-shop-card" style="justify-content:center;align-items:center;color:var(--muted);">登录后可兑换道具</div>';
    return;
  }
  if(meShopState.loading){
    if(hint) hint.textContent='正在加载商城道具...';
    grid.innerHTML='<div class="me-shop-card" style="justify-content:center;align-items:center;color:var(--muted);">加载中...</div>';
    return;
  }
  var items=meShopState.items||[];
  if(hint) hint.textContent=items.length?'使用积分兑换以下道具。':'商城暂无在售道具，请稍后再来。';
  if(!items.length){
    grid.innerHTML='<div class="me-shop-card" style="justify-content:center;align-items:center;color:var(--muted);">暂无商品</div>';
    return;
  }
  grid.innerHTML=items.map(function(item){
    var stock=item.remainingStock==null?'库存充足':'剩余 '+item.remainingStock;
    return '<div class="me-shop-card" data-shop-item-id="'+item.id+'">'+
      '<div class="me-shop-card-head">'+
        '<div class="me-shop-card-title">'+escapeHtml(item.name)+'</div>'+
        (item.badgeText?'<span class="me-shop-card-badge">'+escapeHtml(item.badgeText)+'</span>':'')+
      '</div>'+
      '<div class="me-shop-card-desc">'+escapeHtml(item.description||shopRewardText(item))+'</div>'+
      '<div class="me-shop-card-meta">'+escapeHtml(shopRewardText(item))+' · '+escapeHtml(stock)+'</div>'+
      '<div class="me-shop-card-price">'+escapeHtml(String(item.pricePoints))+' 积分</div>'+
      '<button class="btn secondary me-shop-buy-btn" type="button" data-item-id="'+item.id+'">立即兑换</button>'+
    '</div>';
  }).join('');
  grid.querySelectorAll('.me-shop-buy-btn').forEach(function(btn){
    btn.addEventListener('click',function(){ doMeShopPurchase(Number(btn.getAttribute('data-item-id'))); });
  });
}
async function loadMeShop(opts){
  opts=opts||{};
  if(!authUser){ meShopState.items=[]; renderMeShop(); return; }
  meShopState.loading=true; renderMeShop();
  try{
    var r=await apiFetch('/api/shop/items',{method:'GET'});
    var d=await r.json().catch(function(){ return {}; });
    meShopState.items=r.ok && Array.isArray(d.items)?d.items:[];
    if(!opts.silent) setMeShopStatus('','');
  }catch(e){
    meShopState.items=[];
    if(!opts.silent) setMeShopStatus('商城加载失败：'+(e.message||'网络错误'),'error');
  }finally{
    meShopState.loading=false;
    renderMeShop();
  }
}
async function doMeShopPurchase(itemId){
  if(!authUser){ showDevToast('请先登录'); return; }
  if(!Number.isFinite(itemId)||itemId<=0) return;
  setMeShopStatus('兑换中...','');
  var successMsg='';
  try{
    var r=await apiFetch('/api/shop/purchase',{method:'POST',body:JSON.stringify({itemId:itemId})});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      var map={INSUFFICIENT_POINTS:'积分不足',ITEM_NOT_AVAILABLE:'商品已下架',ITEM_SOLD_OUT:'商品已售罄',BAD_ITEM_ID:'商品无效'};
      setMeShopStatus(map[d.error]||'兑换失败','error');
      showDevToast(map[d.error]||'兑换失败');
      return;
    }
    if(d&&d.user) authUser=d.user;
    successMsg='兑换成功：'+((d.purchase&&d.purchase.item&&d.purchase.item.name)||'道具');
  }catch(e){
    setMeShopStatus('兑换失败：'+(e.message||'网络错误'),'error');
    showDevToast('兑换失败');
    return;
  }
  setMeShopStatus(successMsg,'');
  showDevToast('兑换成功');
  try{
    renderMe();
    renderMeRewards();
    await loadMeShop({ silent:true });
  }catch(e){}
}
function openMeShopModal(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var modal=document.getElementById('meShopModal');
  if(!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  syncBodyNoScroll();
  loadMeShop();
}
function closeMeShopModal(){
  var modal=document.getElementById('meShopModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  syncBodyNoScroll();
}
function openMeRedeemModal(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var modal=document.getElementById('meRedeemModal');
  if(!modal) return;
  setMeRedeemStatus('','');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  syncBodyNoScroll();
  var input=document.getElementById('meRedeemCodeInput');
  if(input) setTimeout(function(){ input.focus(); },0);
}
function closeMeRedeemModal(){
  var modal=document.getElementById('meRedeemModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  syncBodyNoScroll();
}
function setMyCollectionCard(kind, count, hint, disabled){
  var countEl=document.getElementById(kind==='favorites'?'meFavoritesCount':'meLikesCount');
  var hintEl=document.getElementById(kind==='favorites'?'meFavoritesHint':'meLikesHint');
  var card=document.getElementById(kind==='favorites'?'meFavoritesCard':'meLikesCard');
  if(countEl) countEl.textContent = count;
  if(hintEl) hintEl.textContent = hint || '';
  if(card) card.disabled = !!disabled;
}
function renderMyCollectionCards(){
  if(!authUser){
    setMyCollectionCard('favorites','—','请先登录后查看',true);
    setMyCollectionCard('likes','—','请先登录后查看',true);
    return;
  }
  if(myCollectionsState.loading){
    setMyCollectionCard('favorites','...','正在加载',true);
    setMyCollectionCard('likes','...','正在加载',true);
    return;
  }
  var favCount=Math.max(0,(myCollectionsState.favorites||[]).length);
  var likeCount=Math.max(0,(myCollectionsState.likes||[]).length);
  setMyCollectionCard('favorites', String(favCount), favCount>0?('点击查看 '+favCount+' 条收藏'):'暂无收藏，点击查看', false);
  setMyCollectionCard('likes', String(likeCount), likeCount>0?('点击查看 '+likeCount+' 条点赞'):'暂无点赞，点击查看', false);
}
function setMyCollectionStatus(message, type){
  var el=document.getElementById('meCollectionStatus');
  if(!el) return;
  if(message){
    el.textContent=message;
    el.style.display='';
  }else{
    el.textContent='';
    el.style.display='none';
  }
  el.dataset.status=type||'';
}
function getMyCollectionModalLabel(kind){
  return kind==='likes' ? '我的点赞' : '我的收藏';
}
function getMyCollectionSearchText(post){
  if(!post || typeof post!=='object') return '';
  if(post._mySearchText) return post._mySearchText;
  var chunks=[
    String(post.title||''),
    String(formatForumSectionLabel(post.section)||''),
    post.type==='image' ? '图文' : '文章',
    String(post.contentText||''),
    String(getPlainTextFromHtml(post.contentHtml||'')||'')
  ];
  post._mySearchText=chunks.join(' ').toLowerCase();
  return post._mySearchText;
}
function renderMyCollectionModalList(){
  var box=document.getElementById('meCollectionList');
  if(!box) return;
  var kind=myCollectionsState.modalType==='likes' ? 'likes' : 'favorites';
  var source=Array.isArray(myCollectionsState[kind]) ? myCollectionsState[kind] : [];
  var keyword=(document.getElementById('meCollectionSearch')?.value||'').trim().toLowerCase();
  var list=keyword ? source.filter(function(post){ return getMyCollectionSearchText(post).indexOf(keyword)>-1; }) : source.slice();
  if(!source.length){
    box.innerHTML='<div class="forum-empty"><div class="forum-empty-title">'+escapeHtml(getMyCollectionModalLabel(kind))+'为空</div><div class="forum-empty-sub">还没有任何内容</div></div>';
    return;
  }
  if(!list.length){
    box.innerHTML='<div class="forum-empty"><div class="forum-empty-title">没有匹配结果</div><div class="forum-empty-sub">尝试更换关键词</div></div>';
    return;
  }
  var html='';
  list.forEach(function(post){
    var title=escapeHtml(post.title || '未命名');
    var section=escapeHtml(formatForumSectionLabel(post.section));
    var typeText=(post.type==='image'?'图文':'文章');
    html += '<div class="user-home-post">'
      + '<button class="user-home-post-link" type="button" data-open-post-id="'+Number(post.id)+'">'+title+'</button>'
      + '<div class="user-home-post-meta">'+formatForumDate(post.createdAt)+' · '+section+' · '+typeText+'</div>'
      + '</div>';
  });
  box.innerHTML=html;
}
function openMyCollectionModal(kind){
  if(!authUser) return;
  var type=(kind==='likes') ? 'likes' : 'favorites';
  myCollectionsState.modalType=type;
  var modal=document.getElementById('meCollectionModal');
  var title=document.getElementById('meCollectionTitle');
  var search=document.getElementById('meCollectionSearch');
  if(title) title.textContent=getMyCollectionModalLabel(type);
  if(search) search.value='';
  setMyCollectionStatus('', '');
  renderMyCollectionModalList();
  if(modal){
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
  }
  syncBodyNoScroll();
  if(search) setTimeout(function(){ search.focus(); },0);
}
function closeMyCollectionModal(){
  var modal=document.getElementById('meCollectionModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  syncBodyNoScroll();
}
function clearMyCollections(){
  myCollectionsState.favorites=[];
  myCollectionsState.likes=[];
  myCollectionsState.loading=false;
  renderMyCollectionCards();
  if(document.getElementById('meCollectionModal')?.classList.contains('open')){
    setMyCollectionStatus('请先登录后查看', 'empty');
    renderMyCollectionModalList();
  }
}
async function loadMyCollections(){
  if(!authUser){
    clearMyCollections();
    return;
  }
  myCollectionsState.loading=true;
  renderMyCollectionCards();
  try{
    var favReq=apiFetch('/api/me/favorites',{method:'GET'});
    var likeReq=apiFetch('/api/me/likes',{method:'GET'});
    var results=await Promise.allSettled([favReq, likeReq]);
    var loadError=false;
    if(results[0].status==='fulfilled'){
      var favRes=results[0].value;
      var favData=await favRes.json().catch(function(){ return {}; });
      if(favRes.ok) myCollectionsState.favorites = Array.isArray(favData.posts)?favData.posts:[];
      else{ myCollectionsState.favorites = []; loadError=true; }
    }else{
      myCollectionsState.favorites = [];
      loadError=true;
    }
    if(results[1].status==='fulfilled'){
      var likeRes=results[1].value;
      var likeData=await likeRes.json().catch(function(){ return {}; });
      if(likeRes.ok) myCollectionsState.likes = Array.isArray(likeData.posts)?likeData.posts:[];
      else{ myCollectionsState.likes = []; loadError=true; }
    }else{
      myCollectionsState.likes = [];
      loadError=true;
    }
    myCollectionsState.loading=false;
    renderMyCollectionCards();
    if(document.getElementById('meCollectionModal')?.classList.contains('open')){
      setMyCollectionStatus(loadError?'部分数据加载失败，请稍后重试':'', loadError?'error':'');
      renderMyCollectionModalList();
    }
  }catch(e){
    myCollectionsState.loading=false;
    myCollectionsState.favorites=[];
    myCollectionsState.likes=[];
    renderMyCollectionCards();
    if(document.getElementById('meCollectionModal')?.classList.contains('open')){
      setMyCollectionStatus('加载失败：'+(e.message||'网络错误'),'error');
      renderMyCollectionModalList();
    }
  }
}
function getChatSeenStorageKey(){
  if(!authUser || !Number.isFinite(Number(authUser.id)) || Number(authUser.id)<=0) return '';
  return CHAT_SEEN_STORAGE_KEY_PREFIX + String(Number(authUser.id));
}
function syncChatSeenAtFromStorage(){
  var key=getChatSeenStorageKey();
  if(!key){
    chatState.seenAt=0;
    return;
  }
  var raw='0';
  try{ raw=localStorage.getItem(key)||'0'; }catch(e){ raw='0'; }
  var value=Number(raw);
  chatState.seenAt=Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
function saveChatSeenAt(value){
  var ts=Number(value);
  if(!Number.isFinite(ts) || ts<0) ts=Date.now();
  chatState.seenAt=Math.floor(ts);
  var key=getChatSeenStorageKey();
  if(!key) return;
  try{ localStorage.setItem(key, String(chatState.seenAt)); }catch(e){}
}
function getLatestConversationTime(){
  var latest=0;
  (chatState.conversations||[]).forEach(function(item){
    var ts=new Date(item && item.lastAt).getTime();
    if(Number.isFinite(ts) && ts>latest) latest=ts;
  });
  return latest;
}
function getChatUnreadCount(){
  if(!authUser) return 0;
  var hasUnreadField=false;
  var count=0;
  (chatState.conversations||[]).forEach(function(item){
    var unread=Number(item && item.unreadCount || 0);
    if(Number.isFinite(unread)){
      hasUnreadField=true;
      if(unread>0) count += 1;
    }
  });
  if(hasUnreadField) return count;
  var seenAt=Number(chatState.seenAt||0);
  (chatState.conversations||[]).forEach(function(item){
    var ts=new Date(item && item.lastAt).getTime();
    if(Number.isFinite(ts) && ts>seenAt) count += 1;
  });
  return count;
}
function updateChatEntryCard(){
  var btn=document.getElementById('chatEntryBtn');
  var countEl=document.getElementById('chatUnreadCount');
  var hintEl=document.getElementById('chatEntryHint');
  if(!btn || !countEl || !hintEl) return;
  if(!authUser){
    btn.disabled=true;
    countEl.textContent='—';
    hintEl.textContent='请先登录后查看';
    return;
  }
  btn.disabled=false;
  var unread=getChatUnreadCount();
  countEl.textContent=String(unread);
  hintEl.textContent=unread>0 ? ('有 '+unread+' 个未读会话，点击查看好友列表') : '点击查看好友列表';
}
function isCompactChatViewport(){
  try{
    return !!(window.matchMedia && window.matchMedia('(max-width: 980px)').matches);
  }catch(e){
    return window.innerWidth<=980;
  }
}
function setChatStage(stage){
  var next=String(stage||'entry');
  if(next!=='entry' && next!=='list' && next!=='thread') next='entry';
  chatState.stage=next;
  var modal=document.getElementById('chatModal');
  var workspace=document.getElementById('chatWorkspace');
  var side=document.querySelector('#chatWorkspace .chat-side');
  var main=document.querySelector('#chatWorkspace .chat-main');
  var backToListBtn=document.getElementById('chatBackToListBtn');
  if(modal){
    modal.classList.toggle('open', next!=='entry');
    modal.setAttribute('aria-hidden', next==='entry' ? 'true' : 'false');
  }
  if(workspace){
    workspace.style.display = (next==='entry') ? 'none' : '';
    workspace.style.gridTemplateColumns='';
  }
  var compact=isCompactChatViewport();
  if(compact){
    if(side) side.style.display = (next==='thread') ? 'none' : '';
    if(main) main.style.display = (next==='list') ? 'none' : '';
    if(backToListBtn) backToListBtn.style.display = (next==='thread') ? '' : 'none';
  }else{
    if(side) side.style.display = '';
    if(main) main.style.display = '';
    if(backToListBtn) backToListBtn.style.display = 'none';
  }
  syncBodyNoScroll();
}
function markChatSeen(){
  if(!authUser) return;
  var latest=getLatestConversationTime();
  if(!latest){
    updateChatEntryCard();
    return;
  }
  if(latest>Number(chatState.seenAt||0)) saveChatSeenAt(latest);
  updateChatEntryCard();
}
async function openChatFriendList(){
  if(!authUser){ showDevToast('请先登录'); return; }
  if(typeof window.setHomeTab==='function') window.setHomeTab('my');
  setChatStage('list');
  await loadChatConversations({ forceFriends:true });
  markChatSeen();
}
function closeChatModal(){
  setChatStage('entry');
}
async function loadChatFollowingUsers(force){
  if(!authUser || !Number.isFinite(Number(authUser.id)) || Number(authUser.id)<=0){
    chatState.followingUsers=[];
    chatState.followingLoadedAt=0;
    return [];
  }
  var now=Date.now();
  var cacheValid=!force && chatState.followingLoadedAt>0 && (now-chatState.followingLoadedAt)<60000;
  if(cacheValid) return Array.isArray(chatState.followingUsers) ? chatState.followingUsers : [];
  try{
    var r=await apiFetch('/api/users/'+encodeURIComponent(Number(authUser.id))+'/following',{method:'GET'});
    var d=await r.json().catch(function(){ return {}; });
    if(r.ok){
      chatState.followingUsers=Array.isArray(d.users) ? d.users : [];
      chatState.followingLoadedAt=now;
    }
  }catch(e){}
  return Array.isArray(chatState.followingUsers) ? chatState.followingUsers : [];
}
function mergeChatConversationsWithFollowing(conversations, followingUsers){
  var list=Array.isArray(conversations) ? conversations.slice() : [];
  var map=new Map();
  list.forEach(function(item){
    var pid=Number(item && item.peerId);
    if(Number.isFinite(pid) && pid>0){
      map.set(pid, item);
    }
  });
  (Array.isArray(followingUsers) ? followingUsers : []).forEach(function(user){
    var uid=Number(user && user.id);
    if(!(Number.isFinite(uid) && uid>0)) return;
    if(map.has(uid)){
      var hit=map.get(uid);
      hit.iFollow=true;
      hit.followsMe=!!user.followsMe;
      hit.mutualFollow=!!(hit.iFollow && hit.followsMe);
      hit.unreadCount=Math.max(0, Number(hit.unreadCount || 0));
      return;
    }
    map.set(uid, {
      peerId: uid,
      peer: {
        id: uid,
        loginId: user.loginId || '',
        username: user.username || user.loginId || ('用户'+uid),
        avatarUrl: user.avatarUrl || null,
        membershipStatus: user.membershipStatus || '',
        membershipExpiresAt: user.membershipExpiresAt || null,
        titleText: user.titleText || '',
        titleBgColor: user.titleBgColor || '',
        titleColor: user.titleColor || '',
        isVip: !!user.isVip
      },
      lastAt: null,
      lastContent: '',
      unreadCount: 0,
      iFollow: true,
      followsMe: !!user.followsMe,
      mutualFollow: !!user.mutualFollow
    });
  });
  var merged=Array.from(map.values());
  merged.sort(function(a,b){
    var ta=new Date(a && a.lastAt).getTime();
    var tb=new Date(b && b.lastAt).getTime();
    var hasTa=Number.isFinite(ta);
    var hasTb=Number.isFinite(tb);
    if(hasTa && hasTb && tb!==ta) return tb-ta;
    if(hasTa!==hasTb) return hasTb ? 1 : -1;
    var aName=String((a && a.peer && (a.peer.username || a.peer.loginId)) || '').toLowerCase();
    var bName=String((b && b.peer && (b.peer.username || b.peer.loginId)) || '').toLowerCase();
    if(aName<bName) return -1;
    if(aName>bName) return 1;
    return Number(a && a.peerId || 0)-Number(b && b.peerId || 0);
  });
  return merged;
}
function setChatStatus(message, type){
  var el=document.getElementById('chatStatus');
  if(!el) return;
  if(message){
    el.textContent=message;
    el.style.display='';
  }else{
    el.textContent='';
    el.style.display='none';
  }
  el.dataset.status=type||'';
}
function autoResizeChatInput(){
  var input=document.getElementById('chatInput');
  if(!input) return;
  var minHeight=44;
  var maxHeight=132;
  input.style.height='auto';
  var next=Math.max(minHeight, Math.min(maxHeight, Number(input.scrollHeight)||minHeight));
  input.style.height=String(next)+'px';
}
function formatChatTime(value){
  if(!value) return '—';
  var d=new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  var pad=function(n){return String(n).padStart(2,'0');};
  return pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());
}
function getChatRelationText(relation){
  if(relation && relation.mutualFollow) return '互相关注';
  if(relation && relation.iFollow) return '单向关注';
  return '未关注';
}
function renderChatConversations(){
  var box=document.getElementById('chatPeerList');
  if(!box) return;
  if(!authUser){
    box.innerHTML='<div class="forum-status">请先登录后查看</div>';
    updateChatEntryCard();
    return;
  }
  var list=Array.isArray(chatState.conversations) ? chatState.conversations : [];
  if(!list.length){
    box.innerHTML='<div class="forum-empty"><div class="forum-empty-title">暂无会话</div><div class="forum-empty-sub">在他人主页关注后即可发起聊天</div></div>';
    updateChatEntryCard();
    return;
  }
  var html='';
  list.forEach(function(item){
    var active=Number(item.peerId)===Number(chatState.activeUserId);
    var relationText=item.mutualFollow ? '互相关注' : (item.iFollow ? '单向关注' : '');
    var relationClass=item.mutualFollow ? ' mutual' : (item.iFollow ? ' single' : '');
    var relationBadge=relationText ? ('<span class="chat-peer-relation'+relationClass+'">'+relationText+'</span>') : '';
    var unreadCount=Math.max(0, Number(item.unreadCount || 0));
    var unreadBadge=unreadCount>0 ? ('<span class="chat-peer-unread" aria-label="未读 '+unreadCount+' 条">'+(unreadCount>99?'99+':String(unreadCount))+'</span>') : '';
    html += '<button class="chat-peer-item'+(active?' active':'')+'" type="button" data-chat-peer="'+Number(item.peerId)+'">'
      + '<div class="chat-peer-name"><span class="chat-peer-name-text">'+escapeHtml(item.peer?.username || item.peer?.loginId || ('用户'+item.peerId))+'</span>'+relationBadge+unreadBadge+'</div>'
      + '<div class="chat-peer-preview">'+escapeHtml(item.lastContent || '点击进入聊天')+'</div>'
      + '<div class="chat-peer-meta">'+(item.lastAt ? formatChatTime(item.lastAt) : '尚未开始对话')+'</div>'
      + '</button>';
  });
  box.innerHTML=html;
  updateChatEntryCard();
}
function updateChatInputState(){
  var input=document.getElementById('chatInput');
  var sendBtn=document.getElementById('chatSendBtn');
  var hint=document.getElementById('chatHint');
  if(!input || !sendBtn || !hint) return;
  if(!authUser){
    input.disabled=true;
    sendBtn.disabled=true;
    hint.textContent='请先登录后聊天';
    autoResizeChatInput();
    return;
  }
  if(!chatState.activeUserId){
    input.disabled=true;
    sendBtn.disabled=true;
    hint.textContent='请选择一个会话';
    autoResizeChatInput();
    return;
  }
  var rel=chatState.relation||{};
  var hasIncoming=(chatState.messages||[]).some(function(message){return !message.isMine;});
  var hasOutgoing=(chatState.messages||[]).some(function(message){return !!message.isMine;});
  var established=!!rel.chatEstablished||(hasIncoming&&hasOutgoing);
  var canSend=!!rel.canSend||!!rel.iFollow||hasIncoming;
  input.disabled=!canSend;
  sendBtn.disabled=!canSend;
  if(rel.mutualFollow||established) hint.textContent='双向会话：每分钟最多发送 10 条';
  else if(hasIncoming) hint.textContent='收到过对方消息，无需回关即可回复';
  else if(rel.iFollow) hint.textContent='单向关注：每天仅可发送 1 条';
  else if(rel.followsMe) hint.textContent='对方已关注你，收到消息后可直接回复';
  else hint.textContent='先关注对方后可发起聊天';
  autoResizeChatInput();
}
function renderChatThread(opts){
  var options=opts||{};
  var titleEl=document.getElementById('chatPeerTitle');
  var box=document.getElementById('chatThread');
  if(!titleEl || !box) return;
  var prevTop=box.scrollTop||0;
  var prevHeight=box.scrollHeight||0;
  var nearBottom=(prevTop + (box.clientHeight||0)) >= (prevHeight - 20);
  var peer=chatState.activePeer;
  if(!authUser){
    titleEl.textContent='请选择会话';
    titleEl.disabled=true;
    box.innerHTML='<div class="forum-status">请先登录后查看</div>';
    updateChatInputState();
    return;
  }
  if(!peer || !chatState.activeUserId){
    titleEl.textContent='请选择会话';
    titleEl.disabled=true;
    box.innerHTML='<div class="forum-status">请选择好友后开始聊天</div>';
    updateChatInputState();
    return;
  }
  titleEl.textContent=(peer.username || peer.loginId || ('用户'+chatState.activeUserId))+' · '+getChatRelationText(chatState.relation);
  titleEl.disabled=false;
  var list=Array.isArray(chatState.messages) ? chatState.messages : [];
  if(!list.length){
    box.innerHTML='<div class="forum-status">暂无消息，开始聊天吧</div>';
  }else{
    var html='';
    list.forEach(function(msg){
      html += '<div class="chat-msg'+(msg.isMine?' mine':'')+'">'
        + '<div class="chat-msg-bubble"><div class="chat-msg-content">'+escapeHtmlWithBreaks(msg.content || '')+'</div></div>'
        + '<div class="chat-msg-time">'+formatChatTime(msg.createdAt)+'</div>'
        + '</div>';
    });
    box.innerHTML=html;
  }
  if(options.forceBottom || nearBottom){
    box.scrollTop=box.scrollHeight;
  }else{
    box.scrollTop=prevTop;
  }
  updateChatInputState();
}
function resetChatState(){
  chatState.conversations=[];
  chatState.activeUserId=0;
  chatState.activePeer=null;
  chatState.messages=[];
  chatState.relation={ iFollow:false, followsMe:false, mutualFollow:false };
  if(!authUser){
    chatState.followingUsers=[];
    chatState.followingLoadedAt=0;
  }
  if(!authUser) chatState.seenAt=0;
  renderChatConversations();
  renderChatThread();
  setChatStatus('');
  setChatStage('entry');
  updateChatEntryCard();
}
async function loadChatConversations(opts){
  var options=opts||{};
  if(!authUser){
    resetChatState();
    return;
  }
  try{
    var r=await apiFetch('/api/chat/conversations',{method:'GET'});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok) return;
    var conversations=Array.isArray(d.conversations)?d.conversations:[];
    var followingUsers=await loadChatFollowingUsers(!!options.forceFriends);
    chatState.conversations=mergeChatConversationsWithFollowing(conversations, followingUsers);
    if(chatState.activeUserId){
      var hit=chatState.conversations.find(function(item){ return Number(item.peerId)===Number(chatState.activeUserId); });
      if(hit){
        chatState.activePeer=hit.peer || chatState.activePeer;
        chatState.relation={ iFollow:!!hit.iFollow, followsMe:!!hit.followsMe, mutualFollow:!!hit.mutualFollow };
      }
    }
    renderChatConversations();
    if(chatState.stage==='list' || chatState.stage==='thread') markChatSeen();
    if(!options.silent) setChatStatus('');
  }catch(e){
    if(!options.silent) setChatStatus('加载会话失败', 'error');
  }
}
async function loadChatMessages(userId, opts){
  var options=opts||{};
  if(!authUser) return;
  var peerId=Number(userId || chatState.activeUserId);
  if(!(Number.isFinite(peerId) && peerId>0)) return;
  try{
    var r=await apiFetch('/api/chat/users/'+encodeURIComponent(peerId)+'/messages',{method:'GET'});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      if(!options.silent){
        var msg='加载聊天失败';
        if(d && d.error==='CHAT_FOLLOW_REQUIRED') msg='先关注后才能聊天';
        setChatStatus(msg, 'error');
      }
      return;
    }
    chatState.activeUserId=peerId;
    if(d.relation) chatState.relation={
      iFollow:!!d.relation.iFollow,
      followsMe:!!d.relation.followsMe,
      mutualFollow:!!d.relation.mutualFollow,
      canSend:!!d.relation.canSend,
      chatEstablished:!!d.relation.chatEstablished
    };
    var hit=chatState.conversations.find(function(item){ return Number(item.peerId)===peerId; });
    if(hit){
      if(hit.peer) chatState.activePeer=hit.peer;
      hit.unreadCount=0;
    }
    chatState.messages=Array.isArray(d.messages)?d.messages:[];
    renderChatConversations();
    renderChatThread({ forceBottom: !options.keepScroll });
    if(chatState.stage==='list' || chatState.stage==='thread') markChatSeen();
    if(!options.silent) setChatStatus('');
  }catch(e){
    if(!options.silent) setChatStatus('加载聊天失败', 'error');
  }
}
function startChatPolling(){
  if(chatPollingTimer){ clearInterval(chatPollingTimer); chatPollingTimer=null; }
  if(!authUser) return;
  chatPollingTimer=setInterval(function(){
    if(!authUser) return;
    loadChatConversations({ silent:true });
    if(chatState.activeUserId && chatState.stage==='thread') loadChatMessages(chatState.activeUserId,{ silent:true, keepScroll:true });
  }, 10000);
}
async function openChatWithUser(peerId, peerProfile){
  if(!authUser){ showDevToast('请先登录'); return; }
  var uid=Number(peerId);
  if(!(Number.isFinite(uid) && uid>0 && uid!==Number(authUser.id))) return;
  if(typeof window.setHomeTab==='function') window.setHomeTab('my');
  setChatStage('thread');
  if(peerProfile){
    chatState.activePeer={
      id: uid,
      loginId: peerProfile.loginId || '',
      username: peerProfile.username || peerProfile.loginId || ('用户'+uid),
      avatarUrl: peerProfile.avatarUrl || null
    };
    chatState.relation={
      iFollow: !!peerProfile.iFollow,
      followsMe: !!peerProfile.followsMe,
      mutualFollow: !!peerProfile.mutualFollow
    };
  }
  chatState.activeUserId=uid;
  chatState.messages=[];
  renderChatConversations();
  renderChatThread();
  await loadChatConversations({ silent:true, forceFriends:true });
  await loadChatMessages(uid);
  markChatSeen();
  setTimeout(function(){
    var input=document.getElementById('chatInput');
    if(input && !input.disabled) input.focus();
  },0);
}
async function sendChatMessage(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var uid=Number(chatState.activeUserId);
  if(!(Number.isFinite(uid) && uid>0)){
    setChatStatus('请先在会话列表中选择一个好友', 'error');
    return;
  }
  var input=document.getElementById('chatInput');
  var sendBtn=document.getElementById('chatSendBtn');
  var content=(input && input.value || '').trim();
  if(!content){
    setChatStatus('消息不能为空', 'error');
    return;
  }
  if(sendBtn) sendBtn.disabled=true;
  setChatStatus('');
  try{
    var r=await apiFetch('/api/chat/users/'+encodeURIComponent(uid)+'/messages',{method:'POST',body:JSON.stringify({content:content})});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      var msg='发送失败';
      if(d && d.error==='CHAT_FOLLOW_REQUIRED') msg='先关注对方后才能发送';
      if(d && d.error==='CHAT_DAILY_LIMIT') msg='单向关注每天仅可发送 1 条';
      if(d && d.error==='CHAT_RATE_LIMIT') msg='互相关注每分钟最多发送 10 条';
      if(d && d.error==='EMPTY_CONTENT') msg='消息不能为空';
      if(d && d.error==='CONTENT_TOO_LONG') msg='消息不能超过 1000 字';
      if(d && d.error==='NOT_FOUND') msg='该账号不存在或已被删除';
      if(d && d.error==='BAD_ID') msg='会话对象无效，请重新选择';
      if(d && d.error==='FORBIDDEN') msg='当前无权限发送此消息';
      setChatStatus(msg, 'error');
      updateChatInputState();
      return;
    }
    if(input) input.value='';
    autoResizeChatInput();
    if(d && d.relation) chatState.relation={
      iFollow:!!d.relation.iFollow,
      followsMe:!!d.relation.followsMe,
      mutualFollow:!!d.relation.mutualFollow,
      canSend:!!d.relation.canSend,
      chatEstablished:!!d.relation.chatEstablished
    };
    if(d && d.message){
      chatState.messages.push(d.message);
    }
    renderChatThread({ forceBottom:true });
    await loadChatConversations({ silent:true });
  }catch(e){
    setChatStatus('发送失败，请稍后重试', 'error');
  }finally{
    updateChatInputState();
  }
}
function showDevToast(msg){
  var t=document.getElementById('devToast');
  if(!t)return;
  t.textContent = msg || '开发中...';
  if(t._hideTimer) clearTimeout(t._hideTimer);
  t.classList.add('show');
  t._hideTimer = setTimeout(function(){ t.classList.remove('show'); }, 2000);
}
document.addEventListener('click', function(e){
  var target = e.target && e.target.closest ? e.target.closest('[data-maintenance-game]') : null;
  if(!target) return;
  e.preventDefault();
  showDevToast(target.getAttribute('data-maintenance-message') || '该小游戏正在维护中');
});
var homepageAnnouncement=null;
var ANNOUNCEMENT_SEEN_STORAGE_KEY='wjdr_announcement_seen_v1';
function formatAnnouncementDate(value){
  if(!value) return '—';
  var d=new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  var pad=function(n){return String(n).padStart(2,'0');};
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());
}
function normalizeHomepageAnnouncement(raw){
  if(!raw || typeof raw!=='object') return null;
  if(raw.enabled===false) return null;
  var id=String(raw.id||'').trim();
  var title=String(raw.title||'').trim() || '系统公告';
   var content=String(raw.content||'').trim();
   var contentHtml=String(raw.contentHtml||'').trim();
   var publisherUsername=String(raw.publisherUsername||'').trim();
   var publisherLoginId=String(raw.publisherLoginId||'').trim();
   var publisherName=publisherUsername || publisherLoginId;
  if(!id || (!content && !contentHtml)) return null;
  return {
    id:id,
    title:title,
    content:content,
    contentHtml:contentHtml,
     publishedAt:raw.publishedAt || null,
     publisherName:publisherName || null,
     publisherUsername:publisherUsername || null,
     publisherLoginId:publisherLoginId || null
   };
 }
function getAnnouncementUserKey(){
  if(authUser && Number.isFinite(Number(authUser.id))) return 'u_'+String(authUser.id);
  return 'anon';
}
function getAnnouncementSeenMap(){
  try{
    var raw=localStorage.getItem(ANNOUNCEMENT_SEEN_STORAGE_KEY);
    if(!raw) return {};
    var parsed=JSON.parse(raw);
    if(parsed && typeof parsed==='object') return parsed;
  }catch(e){}
  return {};
}
function setAnnouncementSeenMap(map){
  try{ localStorage.setItem(ANNOUNCEMENT_SEEN_STORAGE_KEY, JSON.stringify(map||{})); }catch(e){}
}
function isAnnouncementSeen(announcementId){
  var key=getAnnouncementUserKey();
  var map=getAnnouncementSeenMap();
  return String(map[key]||'')===String(announcementId||'');
}
function markAnnouncementSeen(announcementId){
  if(!announcementId) return;
  var key=getAnnouncementUserKey();
  var map=getAnnouncementSeenMap();
  map[key]=String(announcementId);
  setAnnouncementSeenMap(map);
}
function escapeHtml(value){
  return String(value||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function linkifyTextHtml(escapedHtml){
  return String(escapedHtml||'').replace(/(https?:\/\/[^\s<]+)/g, function(url){
    return '<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+url+'</a>';
  });
}
function sanitizeAnnouncementContent(raw){
  var input=String(raw||'');
  if(!input) return '';
  // 如果内容不包含 HTML 标签，按纯文本渲染（支持换行与链接）
  if(input.indexOf('<')===-1 && input.indexOf('>')===-1){
    return linkifyTextHtml(escapeHtml(input)).replace(/\r\n|\n|\r/g,'<br>');
  }
  // 否则做一个很轻量的白名单净化，避免脚本注入
  var template=document.createElement('template');
  template.innerHTML=input;
  var allowedTags=new Set(['A','BR','P','DIV','SPAN','STRONG','B','EM','I','U','UL','OL','LI','CODE','PRE','IMG']);
  var allowedAttrs={
    'A': new Set(['href','target','rel']),
    'IMG': new Set(['src','alt','title'])
  };
  function sanitizeNode(node){
    if(node.nodeType===Node.TEXT_NODE) return;
    if(node.nodeType!==Node.ELEMENT_NODE){
      node.remove();
      return;
    }
    var tag=node.tagName;
    if(!allowedTags.has(tag)){
      // 不在白名单：保留其子节点（文本/允许的元素），移除自身
      var parent=node.parentNode;
      while(node.firstChild) parent.insertBefore(node.firstChild, node);
      node.remove();
      return;
    }
    // 清理属性
    var keepSet=allowedAttrs[tag] || new Set();
    Array.from(node.attributes||[]).forEach(function(attr){
      var name=attr.name.toLowerCase();
      if(!keepSet.has(name)){
        node.removeAttribute(attr.name);
        return;
      }
      if(tag==='A' && name==='href'){
        var href=String(node.getAttribute('href')||'').trim();
        var ok=/^(https?:\/\/|mailto:)/i.test(href);
        if(!ok) node.removeAttribute('href');
      }
      if(tag==='IMG' && name==='src'){
        var src=String(node.getAttribute('src')||'').trim();
        // 允许：绝对 http(s)、站内绝对路径、相对路径（./ ../）、协议相对（//）、以及 data:image;base64
        var ok2=/^(https?:\/\/|\/|\.{1,2}\/|\/\/|data:image\/(png|jpeg|jpg|gif|webp);base64,)/i.test(src);
        if(!ok2) node.removeAttribute('src');
      }
    });
    if(tag==='A'){
      if(!node.getAttribute('target')) node.setAttribute('target','_blank');
      node.setAttribute('rel','noopener noreferrer');
    }
    Array.from(node.childNodes).forEach(sanitizeNode);
  }
  Array.from(template.content.childNodes).forEach(sanitizeNode);
  return template.innerHTML;
}
function renderAnnouncementModal(){
  var titleEl=document.getElementById('announcementModalTitle');
  var metaEl=document.getElementById('announcementModalMeta');
  var contentEl=document.getElementById('announcementModalContent');
  if(!titleEl || !metaEl || !contentEl) return;
  if(!homepageAnnouncement){
    titleEl.textContent='系统公告';
    metaEl.textContent='';
    contentEl.textContent='暂无公告内容';
    return;
  }
  titleEl.textContent=homepageAnnouncement.title;
  var metaText='发布时间：'+formatAnnouncementDate(homepageAnnouncement.publishedAt);
   if(homepageAnnouncement.publisherName){
    metaText += ' · 发布人：'+homepageAnnouncement.publisherName;
  }
  metaEl.textContent=metaText;
  if(homepageAnnouncement.contentHtml){
    // 后端已做过 sanitize（允许颜色/字号/加粗/插图等），首页直接渲染以保持与后台一致
    contentEl.innerHTML=homepageAnnouncement.contentHtml;
  }else{
    var safeHtml=sanitizeAnnouncementContent(homepageAnnouncement.content);
    if(safeHtml){
      contentEl.innerHTML=safeHtml;
    }else{
      contentEl.textContent='';
    }
  }
}
function updateAnnouncementIndicator(){
  var announcementButton=document.getElementById('openAnnouncement');
  var dot=document.getElementById('announcementDot');
  if(announcementButton) announcementButton.style.display=homepageAnnouncement?'':'none';
  if(!dot) return;
  if(!homepageAnnouncement){
    dot.style.display='none';
    return;
  }
  dot.style.display=isAnnouncementSeen(homepageAnnouncement.id)?'none':'block';
}
function openAnnouncementModal(opts){
  var options=opts||{};
  var modal=document.getElementById('announcementModal');
  if(!modal || !homepageAnnouncement) return;
  renderAnnouncementModal();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  if(options.markSeen !== false && homepageAnnouncement){
    markAnnouncementSeen(homepageAnnouncement.id);
  }
  updateAnnouncementIndicator();
}
function closeAnnouncementModal(){
  var modal=document.getElementById('announcementModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
}
var contactEmail='3450243972@qq.com';
var USER_VOICE_MAX_LEN=1000;
function openContactModal(){
  var modal=document.getElementById('contactModal');
  if(!modal) return;
  var titleEl=document.getElementById('contactModalTitle');
  var descEl=document.getElementById('contactModalDesc');
  if(titleEl) titleEl.textContent='联系我们';
  if(descEl) descEl.textContent='如需联系站点管理员，请通过以下邮箱发送：';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
}
function closeContactModal(){
  var modal=document.getElementById('contactModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
}
async function copyContactEmail(){
  var btn=document.getElementById('copyContactEmailBtn');
  if(btn) btn.disabled=true;
  try{
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(contactEmail);
    }else{
      var temp=document.createElement('textarea');
      temp.value=contactEmail;
      temp.setAttribute('readonly','readonly');
      temp.style.position='fixed';
      temp.style.left='-9999px';
      document.body.appendChild(temp);
      temp.select();
      var copied=document.execCommand('copy');
      document.body.removeChild(temp);
      if(!copied) throw new Error('copy_failed');
    }
    showDevToast('邮箱已复制');
  }catch(e){
    showDevToast('复制失败，请手动复制邮箱');
  }finally{
    if(btn) btn.disabled=false;
  }
}
function setContributionStatus(msg){
  var el=document.getElementById('contributionStatus');
  if(el) el.textContent=msg||'';
}
function updateContributionCount(){
  var input=document.getElementById('contributionContent');
  var counter=document.getElementById('contributionCount');
  if(!input || !counter) return;
  var len=countChars(input.value||'');
  counter.textContent=String(len)+'/'+String(USER_VOICE_MAX_LEN);
}
function openContributionModal(){
  var modal=document.getElementById('contributionModal');
  if(!modal) return;
  setContributionStatus('');
  updateContributionCount();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  var contactInput=document.getElementById('contributionContact');
  if(contactInput){
    setTimeout(function(){ contactInput.focus(); },0);
  }
}
function closeContributionModal(){
  var modal=document.getElementById('contributionModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  setContributionStatus('');
}
async function submitContribution(){
  var contactInput=document.getElementById('contributionContact');
  var contentInput=document.getElementById('contributionContent');
  var submitBtn=document.getElementById('submitContributionBtn');
  if(!contactInput || !contentInput) return;
  var contact=(contactInput.value||'').trim();
  var content=(contentInput.value||'').trim();
  var contentLen=countChars(content);
  if(!contact){
    setContributionStatus('请填写联系方式（微信/QQ/手机号）。');
    return;
  }
  if(contact.length>64){
    setContributionStatus('联系方式最多 64 字。');
    return;
  }
  if(!content){
    setContributionStatus('请填写投稿说明、纠错说明或工具建议。');
    return;
  }
  if(contentLen>USER_VOICE_MAX_LEN){
    setContributionStatus('内容不能超过 '+USER_VOICE_MAX_LEN+' 字。');
    return;
  }
  setContributionStatus('提交中...');
  if(submitBtn) submitBtn.disabled=true;
  try{
    var r=await apiFetch('/api/user-voices',{method:'POST',body:JSON.stringify({contact:contact,content:content})});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      setContributionStatus('提交失败：'+((d&&d.error)||r.status));
      return;
    }
    setContributionStatus('提交成功，感谢你的反馈。');
    showDevToast('提交成功');
    contentInput.value='';
    updateContributionCount();
    setTimeout(function(){ closeContributionModal(); },300);
  }catch(e){
    setContributionStatus('提交失败：'+(e&&e.message?e.message:'网络错误'));
  }finally{
    if(submitBtn) submitBtn.disabled=false;
  }
}
async function loadHomepageAnnouncement(opts){
  var options=opts||{};
  try{
    var r=await apiFetch('/api/announcement',{method:'GET'});
    if(!r.ok){
      homepageAnnouncement=null;
      renderAnnouncementModal();
      updateAnnouncementIndicator();
      return;
    }
    var d=await r.json().catch(function(){ return {}; });
    homepageAnnouncement=normalizeHomepageAnnouncement(d.announcement);
  }catch(e){
    homepageAnnouncement=null;
  }
  renderAnnouncementModal();
  updateAnnouncementIndicator();
  if(options.autoPopup && homepageAnnouncement && !isAnnouncementSeen(homepageAnnouncement.id)){
    openAnnouncementModal({ markSeen:true });
  }
}
// 论坛
var forumMigrationGroupLabels = {
  all:'全部',
  '1':'一组',
  '2':'二组',
  '3':'三组',
  '4':'四组',
  '5':'五组',
  '6':'六组',
  '7':'七组',
  '8':'八组',
  '9':'九组',
  '10':'十组'
};
var forumSectionMap = {
  all:{label:'全部',adminOnly:false,desc:'汇总展示全部分区内容。'},
  guide:{label:'活动攻略',adminOnly:true,desc:'发布攻略、阵容分享与资源规划。'},
  forecast:{label:'活动预测',adminOnly:true,desc:'发布活动节奏预测与资源准备建议。'},
  talk:{label:'玩家讨论',adminOnly:false,desc:'自由交流玩法心得、阵容与日常问题。'},
  migration:{label:'移民',adminOnly:false,desc:'移民相关信息与分组讨论。'},
  melon:{label:'吃瓜',adminOnly:false,desc:'围观热点、讨论动态与趣闻。'}
};
var forumHeartSvg = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 3.9 4 6.5 4c1.74 0 3.41.81 4.5 2.09C12.09 4.81 13.76 4 15.5 4 18.1 4 20 6 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
var forumEyeSvg = '<svg viewBox="0 0 24 24"><path d="M12 5c5.5 0 9.7 4.3 10.9 6.1.2.3.2.6 0 .9C21.7 13.7 17.5 18 12 18S2.3 13.7 1.1 12c-.2-.3-.2-.6 0-.9C2.3 9.3 6.5 5 12 5zm0 2C8.1 7 4.8 10 3.3 11.6 4.8 13.2 8.1 16 12 16s7.2-2.8 8.7-4.4C19.2 10 15.9 7 12 7zm0 2.2A2.8 2.8 0 1 1 12 15a2.8 2.8 0 0 1 0-5.8z"/></svg>';
var forumStarSvg = '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
var forumCommentSvg = '<svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z"/></svg>';

var forumSection = 'all';
var forumMigrationGroup = 'all';
var forumPage = 1;
var forumPageSize = 10;
var FORUM_RETURN_STATE_KEY = 'wjdr_forum_return_state_v1';
var forumReturnScrollY = null;
var forumViewReturnScrollY = 0;
var forumPagination = null;
var forumPostType = 'image';
var forumImageListData = [];
var forumCurrentPostId = null;
var forumCurrentPost = null;
var forumCurrentComments = [];
var forumEditingPostId = null;
var forumEditingSection = null;
var forumReplyToComment = null;
var forumExpandedReplyThreads = {};
var forumOpenCommentMenuId = null;
var forumActiveImage = null;
var forumLatestPosts = [];
var forumHomeSearchQuery = '';
var forumHomeSearchPosts = [];
var forumHomeSearchTimer = null;
var forumHomeSearchSeq = 0;
/** 首页 Tab 切换会 rerender论坛列表（renderForumPosts 读 forumLatestPosts），只改 DOM 不同步此项会又把浏览量打回旧值 */
function mergeForumLatestPostSnapshot(patch){
  if(!patch||!Array.isArray(forumLatestPosts)||!forumLatestPosts.length||!Number.isFinite(Number(patch.id))) return;
  var id=Number(patch.id);
  for(var i=0;i<forumLatestPosts.length;i++){
    if(Number(forumLatestPosts[i].id)!==id) continue;
    if(patch.viewCount!==undefined) forumLatestPosts[i].viewCount=patch.viewCount;
    if(patch.likeCount!==undefined) forumLatestPosts[i].likeCount=patch.likeCount;
    if(patch.favoriteCount!==undefined) forumLatestPosts[i].favoriteCount=patch.favoriteCount;
    if(patch.commentCount!==undefined) forumLatestPosts[i].commentCount=patch.commentCount;
    if(patch.likedByMe!==undefined) forumLatestPosts[i].likedByMe=patch.likedByMe;
    if(patch.favoritedByMe!==undefined) forumLatestPosts[i].favoritedByMe=patch.favoritedByMe;
    if(patch.isPinned!==undefined) forumLatestPosts[i].isPinned=patch.isPinned;
    break;
  }
}
var userHomeState = {
  userId: 0,
  profile: null,
  view: 'posts',
  posts: [],
  following: [],
  followers: [],
  loaded: { posts: false, following: false, followers: false }
};
var userHomeReturnContext = null;
var CHAT_SEEN_STORAGE_KEY_PREFIX = 'wjdr_chat_seen_v1_';
var chatState = {
  conversations: [],
  activeUserId: 0,
  activePeer: null,
  messages: [],
  relation: { iFollow: false, followsMe: false, mutualFollow: false },
  stage: 'entry',
  seenAt: 0,
  followingUsers: [],
  followingLoadedAt: 0
};
var myCollectionsState = {
  favorites: [],
  likes: [],
  loading: false,
  modalType: 'favorites'
};
var chatPollingTimer = null;
var userHomeRequestSeq = 0;
var MAX_FORUM_IMAGES = 8;
var MAX_FORUM_IMAGE_FILE_SIZE = 3 * 1024 * 1024;
var MAX_FORUM_EMBED_IMAGE_FILE_SIZE = 2 * 1024 * 1024;
var MAX_FORUM_TOTAL_IMAGE_FILE_SIZE = 12 * 1024 * 1024;
var MAX_FORUM_TOTAL_EMBED_IMAGE_FILE_SIZE = 12 * 1024 * 1024;
var MAX_FORUM_CONTENT_HTML = 4000000;
function getWindowScrollY(){
  return Math.max(0, Number(window.scrollY || window.pageYOffset || 0));
}
function saveForumReturnState(){
  try{
    sessionStorage.setItem(FORUM_RETURN_STATE_KEY, JSON.stringify({
      forumSection: forumSection,
      forumMigrationGroup: forumMigrationGroup,
      forumPage: forumPage,
      scrollY: getWindowScrollY()
    }));
  }catch(_e){}
}
function restoreForumReturnState(){
  var state=null;
  try{ state=JSON.parse(sessionStorage.getItem(FORUM_RETURN_STATE_KEY) || 'null'); }catch(_e){}
  if(!state || typeof state!=='object') return;
  if(forumSectionMap[state.forumSection]) forumSection=state.forumSection;
  var group=String(state.forumMigrationGroup || 'all');
  forumMigrationGroup=forumMigrationGroupLabels[group] ? group : 'all';
  var page=Number(state.forumPage);
  forumPage=Number.isFinite(page) && page>0 ? Math.floor(page) : 1;
  var scrollY=Number(state.scrollY);
  forumReturnScrollY=Number.isFinite(scrollY) && scrollY>=0 ? scrollY : null;
}
function restoreForumScrollPosition(scrollY){
  var top=Number(scrollY);
  if(!Number.isFinite(top) || top<0) return;
  var apply=function(){ window.scrollTo(0, top); };
  if(typeof window.requestAnimationFrame==='function'){
    window.requestAnimationFrame(function(){ window.requestAnimationFrame(apply); });
  }else{
    setTimeout(apply, 0);
  }
}
restoreForumReturnState();
function escapeHtml(str){
  return String(str||'').replace(/[&<>"']/g,function(s){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'})[s];
  });
}
function escapeHtmlWithBreaks(str){
  return escapeHtml(str).replace(/\n/g,'<br>');
}
function escapeAttr(str){
  return escapeHtml(str).replace(/`/g,'&#96;');
}
function sanitizeUrl(url){
  if(!url) return '';
  var val=String(url).trim();
  if(!val) return '';
  var lower=val.toLowerCase();
  if(lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html')) return '';
  if(lower.startsWith('data:')){
    return lower.startsWith('data:image/') ? val : '';
  }
  try{
    var u=new URL(val, window.location.href);
    if(u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    if(u.protocol === 'file:' && window.location.protocol === 'file:') return u.href;
  }catch(e){}
  return '';
}
function sanitizeStyle(styleText){
  if(!styleText) return '';
  var rules=[];
  styleText.split(';').forEach(function(part){
    var seg=part.split(':');
    if(seg.length<2) return;
    var prop=seg[0].trim().toLowerCase();
    var val=seg.slice(1).join(':').trim();
    if(!prop || !val) return;
    if(prop==='font-size' && /^[0-9.]+(px|em|rem|%)$/.test(val)) rules.push(prop+':'+val);
    else if(prop==='font-weight' && /^(bold|normal|[1-9]00)$/i.test(val)) rules.push(prop+':'+val);
    else if(prop==='font-style' && /^(normal|italic|oblique)$/i.test(val)) rules.push(prop+':'+val);
    else if(prop==='text-align' && /^(left|right|center|justify)$/i.test(val)) rules.push(prop+':'+val);
    else if((prop==='width' || prop==='max-width') && /^[0-9.]+(px|%)$/.test(val)) rules.push(prop+':'+val);
  });
  return rules.join('; ');
}
function sanitizeHtml(html){
  if(!html) return '';
  var tpl=document.createElement('template');
  tpl.innerHTML=String(html);
  var allowedTags={
    a:['href','title','target','rel'],
    b:[], strong:[], i:[], em:[], u:[], s:[],
    br:[], p:[], div:[], span:['style'], font:['style'],
    ul:[], ol:[], li:[],
    blockquote:[], pre:[], code:[],
    h1:[], h2:[], h3:[], h4:[],
    hr:[],
    img:['src','alt','title','width','height','style']
  };
  var walker=document.createTreeWalker(tpl.content, NodeFilter.SHOW_ELEMENT, null);
  var nodes=[];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(function(node){
    var tag=node.tagName.toLowerCase();
    if(!allowedTags[tag]){
      var frag=document.createDocumentFragment();
      while(node.firstChild) frag.appendChild(node.firstChild);
      node.replaceWith(frag);
      return;
    }
    Array.from(node.attributes).forEach(function(attr){
      var name=attr.name.toLowerCase();
      var value=attr.value;
      if(name.startsWith('on')){ node.removeAttribute(attr.name); return; }
      var allowed=allowedTags[tag].indexOf(name) !== -1;
      if(!allowed){ node.removeAttribute(attr.name); return; }
      if(name==='href' || name==='src'){
        var safeUrl=sanitizeUrl(value);
        if(!safeUrl) node.removeAttribute(attr.name);
        else node.setAttribute(attr.name, safeUrl);
      }else if(name==='style'){
        var safeStyle=sanitizeStyle(value);
        if(!safeStyle) node.removeAttribute(attr.name);
        else node.setAttribute('style', safeStyle);
      }else if(name==='target'){
        if(value !== '_blank') node.removeAttribute(attr.name);
        else{
          node.setAttribute('target','_blank');
          node.setAttribute('rel','noopener noreferrer');
        }
      }
    });
    if(tag==='a' && node.getAttribute('target')==='_blank'){
      node.setAttribute('rel','noopener noreferrer');
    }
  });
  return tpl.innerHTML;
}
function getPlainTextFromHtml(html){
  var box=document.createElement('div');
  box.innerHTML = String(html||'');
  return (box.textContent || '').trim();
}
function stripImagesFromHtml(html){
  var box=document.createElement('div');
  box.innerHTML = String(html||'');
  Array.from(box.querySelectorAll('img')).forEach(function(img){
    img.remove();
  });
  return box.innerHTML;
}
function getActiveEditor(){
  return forumPostType === 'image'
    ? document.getElementById('forumImageEditor')
    : document.getElementById('forumEditor');
}
function focusActiveEditor(){
  var editor=getActiveEditor();
  if(editor) editor.focus();
  return editor;
}
function parseCoverImages(value){
  if(!value) return [];
  if(Array.isArray(value)) return value;
  if(typeof value !== 'string') return [];
  var text=value.trim();
  if(!text) return [];
  if(text[0] === '['){
    try{
      var arr=JSON.parse(text);
      if(Array.isArray(arr)) return arr.filter(Boolean);
    }catch(e){}
  }
  return [value];
}
function formatForumFileSize(bytes){
  var value=Number(bytes||0);
  if(!Number.isFinite(value) || value<=0) return '0KB';
  if(value >= 1024 * 1024) return (value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1) + 'MB';
  return Math.ceil(value / 1024) + 'KB';
}
function formatForumOriginalSizeLabel(bytes){
  var value=Number(bytes||0);
  if(!Number.isFinite(value) || value<=0) return '';
  if(value >= 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + 'MB';
  return Math.max(1, Math.ceil(value / 1024)) + 'KB';
}
var forumImageMetaCache = Object.create(null);
function parseForumImageThumbUrl(src){
  var val=String(src||'').trim();
  if(!val || val.indexOf('/api/image/thumb')===-1) return '';
  try{
    var u=new URL(val, window.location.origin);
    return String(u.searchParams.get('url')||'').trim();
  }catch(_e){ return ''; }
}
function getForumImageOriginalUrl(src){
  var fromThumb=parseForumImageThumbUrl(src);
  if(fromThumb){
    var safeThumb=sanitizeUrl(fromThumb);
    if(safeThumb) return safeThumb;
  }
  var safe=sanitizeUrl(src);
  if(!safe) return '';
  if(safe.indexOf('/uploads/')===0) return safe;
  return safe;
}
function isForumUploadImageUrl(src){
  var orig=getForumImageOriginalUrl(src);
  return !!(orig && orig.indexOf('/uploads/')===0);
}
function buildForumImageThumbUrl(originalSrc, width, quality){
  var orig=getForumImageOriginalUrl(originalSrc);
  if(!orig || orig.indexOf('/uploads/')!==0) return orig || '';
  var qs=new URLSearchParams();
  qs.set('url', orig);
  qs.set('w', String(width || 480));
  qs.set('q', String(quality || 55));
  return '/api/image/thumb?'+qs.toString();
}
function buildForumImageTag(originalSrc, opts){
  opts=opts||{};
  var orig=getForumImageOriginalUrl(originalSrc);
  if(!orig) return '';
  var alt=opts.alt || '图片';
  if(orig.indexOf('/uploads/')===0){
    var preview=buildForumImageThumbUrl(orig, opts.previewWidth || 480, opts.previewQuality || 55);
    return '<img src="'+escapeAttr(preview)+'" data-original-src="'+escapeAttr(orig)+'" alt="'+escapeAttr(alt)+'" loading="lazy" />';
  }
  return '<img src="'+escapeAttr(orig)+'" alt="'+escapeAttr(alt)+'" loading="lazy" />';
}
function enhanceForumImages(root, opts){
  if(!root) return;
  opts=opts||{};
  var previewW=opts.previewWidth || 720;
  var previewQ=opts.previewQuality || 58;
  root.querySelectorAll('img').forEach(function(node){
    if(node.getAttribute('data-original-src')) return;
    var raw=node.getAttribute('src') || '';
    var orig=getForumImageOriginalUrl(raw);
    if(!orig || orig.indexOf('/uploads/')!==0) return;
    node.setAttribute('data-original-src', orig);
    node.setAttribute('src', buildForumImageThumbUrl(orig, previewW, previewQ));
  });
}
async function fetchForumImageMeta(originalUrl){
  var orig=getForumImageOriginalUrl(originalUrl);
  if(!orig || orig.indexOf('/uploads/')!==0) return null;
  if(forumImageMetaCache[orig]) return forumImageMetaCache[orig];
  try{
    var r=await fetch('/api/image/meta?url='+encodeURIComponent(orig), { method:'GET' });
    if(!r.ok) return null;
    var d=await r.json();
    var meta={ size: Math.max(0, Number(d && d.size || 0)), url: orig };
    forumImageMetaCache[orig]=meta;
    return meta;
  }catch(_e){
    return null;
  }
}
function getDataUrlByteSize(value){
  var text=String(value||'');
  var comma=text.indexOf(',');
  if(comma<0 || !/^data:/i.test(text)) return 0;
  var meta=text.slice(0, comma).toLowerCase();
  var data=text.slice(comma+1);
  if(meta.indexOf(';base64')>-1){
    var padding=(data.match(/=+$/)||[''])[0].length;
    return Math.max(0, Math.floor(data.length * 3 / 4) - padding);
  }
  try{ return decodeURIComponent(data).length; }catch(e){ return data.length; }
}
function getForumCoverImagesBytes(){
  return (forumImageListData||[]).reduce(function(total, src){
    return total + getDataUrlByteSize(src);
  },0);
}
function getForumEditorImagesBytes(editor){
  if(!editor) return 0;
  return Array.from(editor.querySelectorAll('img')).reduce(function(total, img){
    return total + getDataUrlByteSize(img.getAttribute('src') || '');
  },0);
}
function validateForumImageFile(file, embedded){
  if(!file) return {ok:false,message:'图片文件无效'};
  if(!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type || '')){
    return {ok:false,message:'仅支持 PNG/JPG/WEBP/GIF 图片'};
  }
  var maxSize=embedded ? MAX_FORUM_EMBED_IMAGE_FILE_SIZE : MAX_FORUM_IMAGE_FILE_SIZE;
  if(Number(file.size||0) > maxSize){
    return {ok:false,message:'单张图片不能超过 '+formatForumFileSize(maxSize)};
  }
  return {ok:true,message:''};
}
function getAvatarUrl(value){
  var raw = '';
  if(value && typeof value === 'object') raw = value.avatarUrl || '';
  else raw = String(value||'');
  return sanitizeUrl(raw);
}
function renderAvatarHtml(value, username, className){
  var safeUrl = getAvatarUrl(value);
  var cls = className ? (' '+className) : '';
  if(safeUrl){
    return '<img class="forum-avatar'+cls+'" src="'+escapeAttr(safeUrl)+'" alt="'+escapeAttr(username||'头像')+'" loading="lazy" />';
  }
  var initial = String(username||'?').trim();
  initial = initial ? Array.from(initial)[0] : '?';
  return '<span class="forum-avatar fallback'+cls+'">'+escapeHtml(initial)+'</span>';
}
function normalizeHexColor(value){
  var text=String(value||'').trim();
  if(!text) return '';
  var m=/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(text);
  if(!m) return '';
  var hex=m[1].toLowerCase();
  if(hex.length===3){
    hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  }
  return '#'+hex;
}
function hasVipIdentity(user){
  if(!user || typeof user!=='object') return false;
  if(typeof user.isVip === 'boolean') return user.isVip;
  var status=String(user.membershipStatus||'').trim().toLowerCase();
  if(status==='lifetime') return true;
  if(status!=='active') return false;
  if(!user.membershipExpiresAt) return true;
  var ts=new Date(user.membershipExpiresAt).getTime();
  if(Number.isNaN(ts)) return true;
  return ts > Date.now();
}
function renderTitleBadge(text, kind, bgColor, textColor){
  var cls='user-title-badge';
  if(kind==='vip') cls+=' vip';
  var styleText='';
  if(kind!=='vip'){
    var bg=normalizeHexColor(bgColor);
    var color=normalizeHexColor(textColor);
    if(bg || color){
      var chunks=[];
      if(bg){ chunks.push('background:'+bg); chunks.push('border-color:transparent'); }
      if(color) chunks.push('color:'+color);
      styleText=' style="'+escapeAttr(chunks.join(';'))+'"';
    }
  }
  return '<span class="'+cls+'"'+styleText+'>'+escapeHtml(text)+'</span>';
}
function renderDisplayNameWithBadges(user, fallbackName, nameClass){
  var name=String(fallbackName || '匿名');
  var titleText=String(user && user.titleText || '').trim();
  var isVip=hasVipIdentity(user);
  var cls=(nameClass || 'forum-author-name') + (isVip ? ' is-vip' : '');
  var badges='';
  if(titleText){
    badges += renderTitleBadge(titleText, 'custom', user && user.titleBgColor, user && user.titleColor);
  }
  if(isVip){
    badges += renderTitleBadge('VIP', 'vip');
  }
  return '<span class="user-name-with-badges"><span class="'+cls+'">'+escapeHtml(name)+'</span>'+badges+'</span>';
}
function renderForumAuthorIdentity(user, username){
  var name = String(username || '匿名');
  var inner = renderAvatarHtml(user, name) + renderDisplayNameWithBadges(user, name, 'forum-author-name');
  var userId = Number(user && user.id);
  if(Number.isFinite(userId) && userId > 0){
    return '<button class="forum-author-link" type="button" data-user-id="' + userId + '" aria-label="查看' + escapeAttr(name) + '主页">' + inner + '</button>';
  }
  return '<span class="forum-author-inline">' + inner + '</span>';
}
function formatForumSectionLabel(section){
  var key=String(section||'');
  if(/^migration-(\d+)$/.test(key)){
    var idx=String(key.match(/^migration-(\d+)$/)[1]);
    return '移民' + (forumMigrationGroupLabels[idx] || (idx + '组'));
  }
  var map={
    guide:'活动攻略',
    forecast:'活动预测',
    talk:'玩家讨论',
    migration:'移民',
    melon:'吃瓜'
  };
  return map[key] || key || '未分类';
}
function resetUserHomeState(userId){
  userHomeState.userId = Number(userId) || 0;
  userHomeState.profile = null;
  userHomeState.view = 'posts';
  userHomeState.posts = [];
  userHomeState.following = [];
  userHomeState.followers = [];
  userHomeState.loaded = { posts: false, following: false, followers: false };
}
function updateUserHomeTabs(){
  var tabsWrap=document.getElementById('userHomeTabs');
  var canViewSocialList = canViewUserHomeSocialList();
  if(tabsWrap){
    tabsWrap.style.display = canViewSocialList ? '' : 'none';
  }
  document.querySelectorAll('#userHomeTabs [data-user-home-view]').forEach(function(btn){
    var view = btn.getAttribute('data-user-home-view');
    if(view==='following' || view==='followers'){
      btn.style.display = canViewSocialList ? '' : 'none';
    }
    btn.classList.toggle('active', btn.getAttribute('data-user-home-view')===userHomeState.view);
  });
}
function canViewUserHomeSocialList(){
  var profile=userHomeState.profile;
  if(!authUser || !profile) return false;
  return Number(authUser.id) === Number(profile.id);
}
function syncBodyNoScroll(){
  var forumViewModal=document.getElementById('forumViewModal');
  var userHomeModal=document.getElementById('userHomeModal');
  var meCollectionModal=document.getElementById('meCollectionModal');
  var meShopModal=document.getElementById('meShopModal');
  var mePointsRankingModal=document.getElementById('mePointsRankingModal');
  var meRedeemModal=document.getElementById('meRedeemModal');
  var chatModal=document.getElementById('chatModal');
  var forumImageLightbox=document.getElementById('forumImageLightbox');
  var keepLocked = !!(
    (forumViewModal && forumViewModal.classList.contains('open')) ||
    (userHomeModal && userHomeModal.classList.contains('open')) ||
    (meCollectionModal && meCollectionModal.classList.contains('open')) ||
    (meShopModal && meShopModal.classList.contains('open')) ||
    (mePointsRankingModal && mePointsRankingModal.classList.contains('open')) ||
    (meRedeemModal && meRedeemModal.classList.contains('open')) ||
    (chatModal && chatModal.classList.contains('open')) ||
    (forumImageLightbox && forumImageLightbox.classList.contains('open'))
  );
  document.body.classList.toggle('no-scroll', keepLocked);
}
function setUserHomeStatus(msg, type){
  var el=document.getElementById('userHomeStatus');
  if(!el) return;
  if(msg){
    el.textContent=msg;
    el.style.display='';
  }else{
    el.textContent='';
    el.style.display='none';
  }
  el.dataset.status = type || '';
}
function renderUserHomeProfile(){
  var box=document.getElementById('userHomeProfile');
  var title=document.getElementById('userHomeTitle');
  if(!box) return;
  if(!userHomeState.profile){
    if(title) title.textContent='用户主页';
    box.innerHTML='<div class="forum-status" data-status="loading">正在加载用户信息...</div>';
    return;
  }
  var profile=userHomeState.profile;
  var profileDisplayName = profile.username || (profile.isSelf ? profile.loginId : '') || '用户';
  if(title) title.textContent = profileDisplayName + ' 的主页';
  var avatarHtml = renderAvatarHtml(profile, profileDisplayName, 'user-home-avatar');
  var displayNameHtml = renderDisplayNameWithBadges(profile, profileDisplayName, 'user-home-name');
  var safeId = escapeHtml(profile.loginId || '');
  var idHtml = profile.isSelf ? ('<div class="user-home-id">ID：'+safeId+'</div>') : '';
  var safeGender = escapeHtml(getGenderText(profile.gender));
  var zodiacText = getZodiacByBirthday(profile.birthday);
  var safeZodiac = zodiacText ? escapeHtml(zodiacText) : '';
  var safeBio = escapeHtmlWithBreaks(normalizeProfileBioText(profile.bio));
  var profileMetaHtml = '<span class="user-home-meta-chip">性别：'+safeGender+'</span>';
  if(safeZodiac) profileMetaHtml += '<span class="user-home-meta-chip">星座：'+safeZodiac+'</span>';
  if(!profile.isSelf){
    if(profile.mutualFollow){
      profileMetaHtml += '<span class="user-home-meta-chip"><span class="mutual-mark">互相关注</span></span>';
    }else if(profile.iFollow){
      profileMetaHtml += '<span class="user-home-meta-chip">我已关注</span>';
    }else if(profile.followsMe){
      profileMetaHtml += '<span class="user-home-meta-chip">对方关注了我</span>';
    }
  }
  var followingCount = Math.max(0, Number(profile.followingCount || 0));
  var followerCount = Math.max(0, Number(profile.followerCount || 0));
  var canViewSocialList = canViewUserHomeSocialList();
  var followBtn='';
  var chatBtn='';
  if(authUser && !profile.isSelf){
    followBtn='<button class="btn'+(profile.iFollow?' secondary':'')+'" id="userHomeFollowBtn" type="button">'+(profile.iFollow?'已关注':'关注')+'</button>';
    chatBtn='<button class="btn secondary" id="userHomeChatBtn" type="button"'+(profile.iFollow?'':' disabled')+'>'+(profile.iFollow?'聊天':'先关注')+'</button>';
  }
  var statsHtml = canViewSocialList
    ? (
      '<button class="user-home-stat-btn" type="button" data-user-home-view="following">关注 <strong>'+followingCount+'</strong></button>'+
      '<button class="user-home-stat-btn" type="button" data-user-home-view="followers">粉丝 <strong>'+followerCount+'</strong></button>'
    )
    : (
      '<span class="user-home-stat-text">关注 <strong>'+followingCount+'</strong></span>'+
      '<span class="user-home-stat-text">粉丝 <strong>'+followerCount+'</strong></span>'
    );
  box.innerHTML =
    '<div class="user-home-profile-top">'+
      '<div class="user-home-identity">'+
        avatarHtml+
        '<div>'+
          '<div>'+displayNameHtml+'</div>'+
          idHtml+
          '<div class="user-home-meta">'+profileMetaHtml+'</div>'+
          '<div class="user-home-bio">个人介绍：'+safeBio+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="user-home-actions">'+followBtn+chatBtn+'</div>'+
    '</div>'+
    '<div class="user-home-stats">'+
      statsHtml+
    '</div>';
  updateUserHomeTabs();
}
function renderUserHomeList(){
  var box=document.getElementById('userHomeList');
  if(!box) return;
  var view=userHomeState.view;
  if(view==='posts'){
    var posts=Array.isArray(userHomeState.posts) ? userHomeState.posts : [];
    if(!posts.length){
      box.innerHTML='<div class="forum-empty"><div class="forum-empty-title">暂无文章</div><div class="forum-empty-sub">TA 还没有发布可见内容</div></div>';
      return;
    }
    var postHtml='';
    posts.forEach(function(post){
      var title=escapeHtml(post.title || '未命名');
      postHtml += '<div class="user-home-post">'
        + '<button class="user-home-post-link" type="button" data-open-post-id="'+Number(post.id)+'">'+title+'</button>'
        + '<div class="user-home-post-meta">'+formatForumDate(post.createdAt)+' · '+formatForumSectionLabel(post.section)+' · '+(post.type==='image'?'图文':'文章')+'</div>'
        + '</div>';
    });
    box.innerHTML = postHtml;
    return;
  }
  if(!canViewUserHomeSocialList()){
    box.innerHTML='<div class="forum-empty"><div class="forum-empty-title">仅自己可见</div><div class="forum-empty-sub">他人的关注和粉丝列表不开放查看</div></div>';
    return;
  }
  var users=Array.isArray(userHomeState[view]) ? userHomeState[view] : [];
  if(!users.length){
    box.innerHTML='<div class="forum-empty"><div class="forum-empty-title">暂无数据</div><div class="forum-empty-sub">当前列表为空</div></div>';
    return;
  }
  var userHtml='';
  users.forEach(function(item){
    var name=item.username || item.loginId || '匿名';
    var nameHtml=renderDisplayNameWithBadges(item, name, 'forum-author-name');
    var mutualText = item.mutualFollow ? ' · <span class="mutual-mark">互相关注</span>' : '';
    userHtml += '<div class="user-home-user-item">'
      + '<button class="user-home-user-link" type="button" data-user-id="'+Number(item.id)+'">'+renderAvatarHtml(item, name)+nameHtml+'</button>'
      + '<div class="user-home-user-meta">关注 '+Math.max(0, Number(item.followingCount || 0))+' · 粉丝 '+Math.max(0, Number(item.followerCount || 0))+mutualText+'</div>'
      + '</div>';
  });
  box.innerHTML = userHtml;
}
async function loadUserHomeProfile(userId, seq){
  var r=await apiFetch('/api/users/'+encodeURIComponent(userId)+'/profile',{method:'GET'});
  var d=await r.json().catch(function(){ return {}; });
  if(seq !== userHomeRequestSeq) return false;
  if(!r.ok || !d || !d.profile){
    setUserHomeStatus('加载用户信息失败', 'error');
    return false;
  }
  userHomeState.profile = d.profile;
  renderUserHomeProfile();
  return true;
}
async function ensureUserHomeData(view, seq){
  var activeSeq = seq || userHomeRequestSeq;
  if(activeSeq !== userHomeRequestSeq) return;
  if(view!=='posts' && !canViewUserHomeSocialList()){
    setUserHomeStatus('');
    renderUserHomeList();
    return;
  }
  if(userHomeState.loaded[view]){
    renderUserHomeList();
    setUserHomeStatus('');
    return;
  }
  setUserHomeStatus('正在加载...', 'loading');
  try{
    var userId = Number(userHomeState.userId || 0);
    if(!Number.isFinite(userId) || userId <= 0){
      setUserHomeStatus('用户信息无效', 'error');
      return;
    }
    var endpoint = '/api/users/'+encodeURIComponent(userId)+'/'+(view==='posts' ? 'posts' : view);
    var r=await apiFetch(endpoint,{method:'GET'});
    var d=await r.json().catch(function(){ return {}; });
    if(activeSeq !== userHomeRequestSeq) return;
    if(!r.ok){
      setUserHomeStatus('加载失败，请稍后重试', 'error');
      return;
    }
    if(view==='posts'){
      userHomeState.posts = Array.isArray(d.posts) ? d.posts : [];
    }else{
      userHomeState[view] = Array.isArray(d.users) ? d.users : [];
    }
    userHomeState.loaded[view] = true;
    renderUserHomeList();
    setUserHomeStatus('');
  }catch(e){
    if(activeSeq !== userHomeRequestSeq) return;
    setUserHomeStatus('加载失败：'+(e.message||'网络错误'), 'error');
  }
}
function setUserHomeView(view, options){
  var next = String(view || 'posts');
  if(next!=='posts' && next!=='following' && next!=='followers') next='posts';
  if(next!=='posts' && !canViewUserHomeSocialList()) next='posts';
  userHomeState.view = next;
  updateUserHomeTabs();
  renderUserHomeList();
  if(options && options.silent) return;
  ensureUserHomeData(next, userHomeRequestSeq);
}
async function openUserHome(userId, view, options){
  var uid=Number(userId);
  if(!Number.isFinite(uid) || uid<=0) return;
  var modal=document.getElementById('userHomeModal');
  if(!modal) return;
  if(options && options.returnTo){
    userHomeReturnContext={ returnTo:String(options.returnTo) };
  }else if(!modal.classList.contains('open')){
    userHomeReturnContext=null;
  }
  var seq=++userHomeRequestSeq;
  resetUserHomeState(uid);
  setUserHomeStatus('');
  renderUserHomeProfile();
  renderUserHomeList();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  syncBodyNoScroll();
  var loaded=await loadUserHomeProfile(uid, seq);
  if(!loaded) return;
  setUserHomeView(view || 'posts', { silent:true });
  ensureUserHomeData(userHomeState.view, seq);
}
function restoreMePointsRanking(){
  var modal=document.getElementById('mePointsRankingModal');
  if(!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  syncBodyNoScroll();
}
function closeUserHome(options){
  var modal=document.getElementById('userHomeModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  var returnContext=userHomeReturnContext;
  userHomeReturnContext=null;
  if((!options || options.restoreParent!==false) && returnContext && returnContext.returnTo==='points-ranking'){
    restoreMePointsRanking();
  }else{
    syncBodyNoScroll();
  }
}
async function toggleUserHomeFollow(){
  var profile=userHomeState.profile;
  if(!profile || !Number.isFinite(Number(profile.id))) return;
  if(!authUser){
    showDevToast('请先登录');
    return;
  }
  if(profile.isSelf){
    showDevToast('不能关注自己');
    return;
  }
  var wasFollow = !!profile.iFollow;
  var followBtn=document.getElementById('userHomeFollowBtn');
  if(followBtn) followBtn.disabled=true;
  try{
    var method = wasFollow ? 'DELETE' : 'POST';
    var r=await apiFetch('/api/users/'+encodeURIComponent(profile.id)+'/follow',{method:method,body:'{}'});
    if(!r.ok){
      showDevToast('操作失败');
      return;
    }
    profile.iFollow = !wasFollow;
    profile.mutualFollow = !!(profile.iFollow && profile.followsMe);
    profile.followerCount = Math.max(0, Number(profile.followerCount || 0) + (wasFollow ? -1 : 1));
    if(authUser){
      authUser.followingCount = Math.max(0, Number(authUser.followingCount || 0) + (wasFollow ? -1 : 1));
      renderMe();
    }
    if(Number(chatState.activeUserId)===Number(profile.id)){
      chatState.relation.iFollow = !!profile.iFollow;
      chatState.relation.followsMe = !!profile.followsMe;
      chatState.relation.mutualFollow = !!profile.mutualFollow;
      updateChatInputState();
    }
    renderUserHomeProfile();
  }catch(e){
    showDevToast('操作失败：'+(e.message||'网络错误'));
  }finally{
    if(followBtn) followBtn.disabled=false;
  }
}
function getNextAvatarUploadAt(){
  if(!authUser || !authUser.avatarNextAt) return null;
  var d = new Date(authUser.avatarNextAt);
  if(Number.isNaN(d.getTime())) return null;
  return d;
}
function updateProfileAvatarHint(){
  var hint=document.getElementById('profileAvatarHint');
  var btn=document.getElementById('profileAvatarUpload');
  if(!hint) return;
  var next=getNextAvatarUploadAt();
  if(next && Date.now() < next.getTime()){
    hint.textContent='头像上传冷却中，下次可上传：'+formatShortDate(next)+' '+String(next.getHours()).padStart(2,'0')+':'+String(next.getMinutes()).padStart(2,'0');
    if(btn) btn.disabled=true;
  }else{
    hint.textContent='支持 PNG/JPG/WEBP/GIF，大小不超过 2MB，上传冷却时间 24 小时。';
    if(btn) btn.disabled=false;
  }
}
function updateProfileAvatarPreview(){
  var img=document.getElementById('profileAvatarPreview');
  if(!img) return;
  var safe = getAvatarUrl(authUser);
  if(safe){
    img.src = safe;
  }else{
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="100%" height="100%" fill="#1e293b"/><text x="50%" y="54%" text-anchor="middle" font-size="22" fill="#cbd5e1" font-family="Arial, sans-serif">?</text></svg>');
  }
}
function updateForumModalImageMeta(){
  var meta=document.getElementById('forumModalImageMeta');
  if(!meta) return;
  var count=Array.isArray(forumImageListData) ? forumImageListData.length : 0;
  if(count>0){
    meta.textContent='已添加 '+count+' 张图片';
    meta.classList.add('has-files');
  }else{
    meta.textContent='未选择任何文件';
    meta.classList.remove('has-files');
  }
}
function updateForumEmbedImageMeta(fileCount){
  var meta=document.getElementById('forumEmbedImageMeta');
  if(!meta) return;
  var count=Number(fileCount||0);
  if(count>0){
    meta.textContent='已插入 '+count+' 张插图';
    meta.classList.add('has-files');
  }else{
    meta.textContent='未选择任何文件';
    meta.classList.remove('has-files');
  }
}
function renderForumImageList(){
  var box=document.getElementById('forumImageList');
  if(!box) return;
  if(!forumImageListData.length){
    box.innerHTML='';
    updateForumModalImageMeta();
    return;
  }
  var html='';
  forumImageListData.forEach(function(src,idx){
    var safeSrc=sanitizeUrl(src);
    if(!safeSrc) return;
    html+='<div class="forum-image-item"><img src="'+escapeAttr(safeSrc)+'" alt="图片" loading="lazy"/><button class="forum-image-remove" type="button" data-remove="'+idx+'">×</button></div>';
  });
  box.innerHTML=html;
  updateForumModalImageMeta();
}
function setActiveImage(img){
  if(forumPostType !== 'article'){
    forumActiveImage = null;
    var sizerHide=document.getElementById('forumImageSizer');
    if(sizerHide) sizerHide.style.display='none';
    return;
  }
  forumActiveImage = img || null;
  var sizer=document.getElementById('forumImageSizer');
  if(!sizer) return;
  if(!forumActiveImage){
    sizer.style.display='none';
    return;
  }
  sizer.style.display='';
  var range=document.getElementById('forumImgWidthRange');
  var px=document.getElementById('forumImgWidthPx');
  var width=forumActiveImage.style.width || '';
  if(width.endsWith('%')){
    range.value=parseInt(width,10) || 100;
    px.value='';
  }else if(width.endsWith('px')){
    px.value=parseInt(width,10) || '';
    range.value=100;
  }else{
    range.value=100;
    px.value='';
  }
}
function bindEditorImageSelection(editor){
  if(!editor || editor._imageBind) return;
  editor._imageBind = true;
  editor.addEventListener('click', function(e){
    var img=e.target && e.target.closest ? e.target.closest('img') : null;
    if(img && editor.contains(img)) setActiveImage(img);
    else setActiveImage(null);
  });
  editor.addEventListener('keyup', function(){
    var sel=window.getSelection();
    if(!sel || !sel.anchorNode) return;
    var node=sel.anchorNode.nodeType===1 ? sel.anchorNode : sel.anchorNode.parentElement;
    var img=node && node.closest ? node.closest('img') : null;
    if(img && editor.contains(img)) setActiveImage(img);
  });
}
function formatForumDate(value){
  if(!value) return '—';
  var d=new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  var pad=function(n){return String(n).padStart(2,'0');};
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());
}
function setForumStatus(msg, type){
  var el=document.getElementById('forumStatus');
  if(!el) return;
  if(msg){
    el.textContent=msg;
    el.style.display='';
  }else{
    el.textContent='';
    el.style.display='none';
  }
  el.dataset.status = type || '';
}
function setPublishStatus(msg){
  var el=document.getElementById('forumPublishStatus');
  if(el) el.textContent=msg||'';
}
function updateForumFab(tab){
  var fab=document.getElementById('forumFab');
  if(!fab) return;
  fab.style.display = (tab==='forum') ? '' : 'none';
}
window.updateForumFab = updateForumFab;
function getForumMigrationGroupLabel(group){
  return forumMigrationGroupLabels[String(group)] || '全部';
}
function getForumRequestSection(){
  if(forumSection==='all') return 'all';
  if(forumSection!=='migration') return forumSection;
  if(forumMigrationGroup==='all') return 'migration';
  return 'migration-' + forumMigrationGroup;
}
function getForumPostingSection(){
  if(forumSection==='all') return '';
  if(forumSection!=='migration') return forumSection;
  if(forumMigrationGroup==='all') return '';
  return 'migration-' + forumMigrationGroup;
}
function refreshForumMigrationTabs(){
  var wrap=document.getElementById('forumMigrationTabs');
  if(wrap) wrap.style.display = forumSection==='migration' ? '' : 'none';
  document.querySelectorAll('.forum-migration-tab').forEach(function(btn){
    var group=btn.getAttribute('data-group') || 'all';
    btn.classList.toggle('active', group===forumMigrationGroup);
  });
}
function setForumMigrationGroup(group, options){
  var next=String(group||'all');
  if(!forumMigrationGroupLabels[next]) next='all';
  forumMigrationGroup=next;
  forumPage = 1;
  refreshForumMigrationTabs();
  if(options && options.silent) return;
  updateForumAccess();
  updateForumPublishAccess();
  loadForumPosts();
}
function canForumPost(){
  if(!authUser) return false;
  var info=forumSectionMap[forumSection];
  if(info && info.adminOnly && !(authUser.isAdmin || authUser.forumPublisher)) return false;
  return true;
}
function isForumModerator(){
  return !!(authUser && (authUser.isAdmin || authUser.forumPublisher));
}
function canEditForumPost(post){
  return !!(authUser && post && post.author && Number(authUser.id) === Number(post.author.id));
}
function canDeleteForumPost(post){
  return !!(authUser && post && post.author && (isForumModerator() || Number(authUser.id) === Number(post.author.id)));
}
function canDeleteForumComment(comment){
  if(!authUser || !comment) return false;
  if(isForumModerator()) return true;
  var myId=Number(authUser.id);
  var commentAuthorId=Number(comment.author && comment.author.id);
  var postAuthorId=Number(forumCurrentPost && forumCurrentPost.author && forumCurrentPost.author.id);
  return myId===commentAuthorId || myId===postAuthorId;
}
function updateForumAccess(){
  var titleEl=document.getElementById('forumSectionTitle');
  var sectionInfo=forumSectionMap[forumSection] || {};
  var migrationLabel = forumSection==='migration' ? (' · ' + getForumMigrationGroupLabel(forumMigrationGroup)) : '';
  document.querySelectorAll('.forum-tab').forEach(function(btn){
    btn.classList.toggle('active', btn.getAttribute('data-section')===forumSection);
  });
  if(titleEl){
    titleEl.textContent='交流论坛 · '+(sectionInfo.label||'')+migrationLabel;
  }
  var descEl=document.getElementById('forumSectionDesc');
  if(descEl){
    if(forumSection==='migration'){
      descEl.textContent = forumMigrationGroup==='all'
        ? '查看移民全部分组内容；发帖请先切换到具体组别。'
        : ('当前为移民' + getForumMigrationGroupLabel(forumMigrationGroup) + '，可在此分组发布与交流。');
    }else{
      descEl.textContent=sectionInfo.desc||'';
    }
  }
  refreshForumMigrationTabs();
}
function updateForumPublishAccess(){
  var submit=document.getElementById('forumPublishBtn');
  if(!submit) return;
  if(!authUser){
    setPublishStatus('请先登录后再发布内容。');
    submit.disabled=true;
    return;
  }
  if(forumSectionMap[forumSection]?.adminOnly && !(authUser.isAdmin || authUser.forumPublisher)){
    setPublishStatus('该分区仅授权用户可发布内容。');
    submit.disabled=true;
    return;
  }
  if(!forumEditingPostId && forumSection==='migration' && forumMigrationGroup==='all'){
    setPublishStatus('移民分区请先选择具体组别（1-10）再发布。');
    submit.disabled=true;
    return;
  }
  if(!forumEditingPostId && forumSection==='all'){
    setPublishStatus('全部分区仅用于浏览汇总，请先切换到具体分区再发布。');
    submit.disabled=true;
    return;
  }
  setPublishStatus('');
  submit.disabled=false;
}
function renderForumPosts(posts){
  var box=document.getElementById('forumList');
  if(!box) return;
  if(Array.isArray(posts)) forumLatestPosts = posts;
  var sourcePosts = Array.isArray(forumLatestPosts) ? forumLatestPosts : [];
  var activeHomeTab = (typeof window.getHomeTab === 'function') ? window.getHomeTab() : 'all';
  var isForumTab = activeHomeTab === 'forum';
  var isAllSearch = activeHomeTab === 'all' && forumHomeSearchQuery;
  var goWrap=document.getElementById('forumGoWrap');
  if(goWrap) goWrap.style.display = isForumTab ? 'none' : '';
  var pager=document.getElementById('forumPagination');
  if(pager) pager.style.display = isForumTab ? '' : 'none';
  var heroSub=document.getElementById('forumSectionDesc');
  if(heroSub && isAllSearch){
    heroSub.textContent = forumHomeSearchPosts.length
      ? ('搜索「'+forumHomeSearchQuery+'」命中 '+forumHomeSearchPosts.length+' 篇帖子')
      : ('搜索「'+forumHomeSearchQuery+'」暂无匹配帖子');
  } else if(heroSub && activeHomeTab === 'all'){
    var sectionInfo = forumSectionMap[forumSection] || {};
    heroSub.textContent = sectionInfo.desc || '汇总展示全部分区内容。';
  }
  var displayPosts;
  if(isAllSearch){
    displayPosts = forumHomeSearchPosts.slice(0, 10);
  } else if(isForumTab){
    displayPosts = sourcePosts;
  } else {
    displayPosts = sourcePosts.slice(0,3);
  }
  if(!displayPosts || displayPosts.length===0){
    box.innerHTML='<div class="forum-empty"><div class="forum-empty-title">暂无内容</div><div class="forum-empty-sub">成为第一个发布的人吧</div></div>';
    renderForumPagination();
    return;
  }
  var html='';
  displayPosts.forEach(function(p){
    var badge = p.isPinned ? '<span class="forum-badge pinned">置顶</span>' : '';
    var typeText = p.type==='image' ? '图文' : '文章';
    var summary = p.summary || (p.type==='image' ? '暂无图文内容' : '暂无文章内容');
    var authorName = p.author?.username || '匿名';
    var authorIdentity = renderForumAuthorIdentity(p.author, authorName);
    var images = Array.isArray(p.coverImages) ? p.coverImages : parseCoverImages(p.coverImage);
    var cover = images.length ? images[0] : '';
    var safeCover = sanitizeUrl(cover);
    var thumb = (p.type==='image' && safeCover)
      ? '<div class="forum-post-side"><img class="forum-post-cover" src="'+escapeAttr(buildForumImageThumbUrl(safeCover, 360, 52))+'" data-original-src="'+escapeAttr(safeCover)+'" alt="封面" loading="lazy" /></div>'
      : '';
    var viewCount = Number(p.viewCount || 0);
    var likeCount = Number(p.likeCount || 0);
    var favoriteCount = Number(p.favoriteCount || 0);
    var commentCount = Number(p.commentCount || 0);
    var stats = '<div class="forum-post-stats">'
      + '<span class="forum-stat">'+forumEyeSvg+'<span class="forum-view-count">'+viewCount+'</span></span>'
      + '<span class="forum-stat">'+forumHeartSvg+'<span class="forum-like-count">'+likeCount+'</span></span>'
      + '<span class="forum-stat">'+forumStarSvg+'<span class="forum-favorite-count">'+favoriteCount+'</span></span>'
      + '<span class="forum-stat">'+forumCommentSvg+'<span class="forum-comment-count">'+commentCount+'</span></span>'
      + '</div>';
    html += '<div class="forum-post'+(p.isPinned ? ' pinned' : '')+'" data-id="'+p.id+'">'+
      '<div class="forum-post-main">'+
        '<div class="forum-post-title">'+escapeHtml(p.title)+badge+'</div>'+
        '<div class="forum-post-meta"><span class="forum-meta-author">'+authorIdentity+'</span> · '+formatForumDate(p.createdAt)+' · '+typeText+'</div>'+
        '<div class="forum-post-summary">'+escapeHtml(summary)+'</div>'+
        '<div class="forum-post-actions">'+stats+'<button class="btn secondary forum-read" type="button">阅读</button></div>'+
      '</div>'+
      thumb+
    '</div>';
  });
  box.innerHTML=html;
  renderForumPagination();
}
function renderForumPagination(){
  var el=document.getElementById('forumPagination');
  if(!el) return;
  var activeHomeTab = (typeof window.getHomeTab === 'function') ? window.getHomeTab() : 'all';
  var isForumTab = activeHomeTab === 'forum';
  if(!isForumTab){ el.style.display='none'; el.innerHTML=''; return; }
  var p = forumPagination;
  if(!p || !p.totalPages || p.totalPages <= 1){
    el.innerHTML='';
    return;
  }
  var page = Number(p.page || forumPage || 1);
  var totalPages = Number(p.totalPages || 1);
  var total = Number(p.total || 0);
  var prevDisabled = !(p.hasPrev || page > 1);
  var nextDisabled = !(p.hasNext || page < totalPages);
  el.innerHTML =
    '<button class="page-btn" type="button" data-page-nav="prev" '+(prevDisabled?'disabled':'')+'>上一页</button>'+
    '<span class="page-info">第 '+page+' / '+totalPages+' 页（共 '+total+' 条）</span>'+
    '<button class="page-btn" type="button" data-page-nav="next" '+(nextDisabled?'disabled':'')+'>下一页</button>';
}
function refreshForumListView(){
  renderForumPosts();
}
window.refreshForumListView = refreshForumListView;
window.forumHomeSearchHasHits = function(){
  return !!(forumHomeSearchQuery && forumHomeSearchPosts && forumHomeSearchPosts.length);
};
window.forumHomeSearchIsActive = function(){
  return !!forumHomeSearchQuery;
};
window.triggerForumHomeSearch = function(keyword){
  var q = String(keyword || '').trim();
  forumHomeSearchQuery = q;
  if(forumHomeSearchTimer) clearTimeout(forumHomeSearchTimer);
  if(!q){
    forumHomeSearchPosts = [];
    window.__forumHomeSearchPostsSnapshot = [];
    refreshForumListView();
    if(typeof window.__refreshHomeSearch === 'function') window.__refreshHomeSearch();
    return;
  }
  window.__forumHomeSearchPostsSnapshot = [];
  refreshForumListView();
  if(typeof window.__refreshHomeSearch === 'function') window.__refreshHomeSearch();
  forumHomeSearchTimer = setTimeout(async function(){
    var seq = ++forumHomeSearchSeq;
    try{
      var qs = new URLSearchParams();
      qs.set('section', 'all');
      qs.set('q', q);
      qs.set('page', '1');
      qs.set('pageSize', '15');
      qs.set('_', String(Date.now()));
      var r = await apiFetch('/api/forum/posts?'+qs.toString(), { method: 'GET' });
      if(seq !== forumHomeSearchSeq) return;
      if(!r.ok){
        forumHomeSearchPosts = [];
      } else {
        var d = await r.json();
        forumHomeSearchPosts = Array.isArray(d) ? d : (d.posts || []);
      }
    }catch(_e){
      if(seq !== forumHomeSearchSeq) return;
      forumHomeSearchPosts = [];
    }
    window.__forumHomeSearchPostsSnapshot = forumHomeSearchPosts.slice();
    refreshForumListView();
    if(typeof window.__refreshHomeSearch === 'function') window.__refreshHomeSearch();
  }, 280);
};
async function loadForumPosts(opts){
  opts = opts || {};
  var box=document.getElementById('forumList');
  if(!box) return;
  if(!opts.silent) setForumStatus('正在加载...', 'loading');
  try{
    var qs=new URLSearchParams();
    qs.set('section', getForumRequestSection());
    qs.set('page', String(forumPage||1));
    qs.set('pageSize', String(forumPageSize||10));
    qs.set('_', String(Date.now()));
    qs.set('nc', String(Math.random()).slice(2, 12)+String(Date.now()));
    var r=await apiFetch('/api/forum/posts?'+qs.toString(),{method:'GET'});
    if(!r.ok){
      if(!opts.silent){ setForumStatus('加载失败，请检查后端服务是否启动。', 'error'); renderForumPosts([]); }
      return;
    }
    var d=await r.json();
    var list=Array.isArray(d) ? d : (d.posts||[]);
    forumLatestPosts = list;
    forumPagination = (d && !Array.isArray(d) && d.pagination) ? d.pagination : null;
    if(forumPagination && Number.isFinite(Number(forumPagination.page))){
      forumPage = Math.max(1, Number(forumPagination.page));
    }
    renderForumPosts();
    if(opts.restoreScrollY!==undefined && opts.restoreScrollY!==null){
      restoreForumScrollPosition(opts.restoreScrollY);
    }else if(forumReturnScrollY!==null){
      restoreForumScrollPosition(forumReturnScrollY);
      forumReturnScrollY=null;
      try{ sessionStorage.removeItem(FORUM_RETURN_STATE_KEY); }catch(_e){}
    }
    if(!opts.silent) setForumStatus('');
  }catch(e){
    if(!opts.silent){
      setForumStatus('加载失败，请检查网络或后端服务。', 'error');
      renderForumPosts([]);
    }
  }
}
function resetForumComposer(){
  forumEditingPostId = null;
  forumEditingSection = null;
  var titleInput=document.getElementById('forumModalTitle');
  if(titleInput) titleInput.value='';
  var articleEditor=document.getElementById('forumEditor');
  if(articleEditor) articleEditor.innerHTML='';
  var imageEditor=document.getElementById('forumImageEditor');
  if(imageEditor) imageEditor.innerHTML='';
  forumImageListData=[];
  renderForumImageList();
  var imageInput=document.getElementById('forumModalImage');
  if(imageInput) imageInput.value='';
  var embedInput=document.getElementById('forumEmbedImage');
  if(embedInput) embedInput.value='';
  updateForumEmbedImageMeta(0);
  var btn=document.getElementById('forumPublishBtn');
  if(btn) btn.textContent='发布';
}
function fillForumComposerFromPost(post){
  if(!post) return;
  forumEditingPostId = Number(post.id);
  forumEditingSection = post.section || null;
  var titleInput=document.getElementById('forumModalTitle');
  if(titleInput) titleInput.value=post.title || '';
  setForumType(post.type==='article' ? 'article' : 'image');
  if(forumPostType==='image'){
    var imageEditor=document.getElementById('forumImageEditor');
    if(imageEditor){
      if(post.contentHtml) imageEditor.innerHTML=sanitizeHtml(post.contentHtml);
      else imageEditor.textContent=post.contentText || '';
    }
    var images = Array.isArray(post.coverImages) ? post.coverImages : parseCoverImages(post.coverImage);
    forumImageListData = images.map(sanitizeUrl).filter(Boolean);
    renderForumImageList();
  }else{
    var articleEditor=document.getElementById('forumEditor');
    if(articleEditor) articleEditor.innerHTML=sanitizeHtml(post.contentHtml || '');
  }
  var btn=document.getElementById('forumPublishBtn');
  if(btn) btn.textContent='保存修改';
}
function openForumModal(post){
  var m=document.getElementById('forumModal');
  if(!m) return;
  if(!authUser) showDevToast('请先登录');
  if(post){
    fillForumComposerFromPost(post);
  }else{
    resetForumComposer();
    setForumType(forumPostType);
  }
  setPublishStatus('');
  updateForumPublishAccess();
  m.classList.add('open');
  m.setAttribute('aria-hidden','false');
}
function closeForumModal(){
  var m=document.getElementById('forumModal');
  if(!m) return;
  m.classList.remove('open');
  m.setAttribute('aria-hidden','true');
}
function setForumType(type){
  forumPostType = type;
  document.querySelectorAll('.forum-type-btn').forEach(function(btn){
    btn.classList.toggle('active', btn.getAttribute('data-type')===type);
  });
  document.getElementById('forumTypeImagePane').style.display = type==='image' ? '' : 'none';
  document.getElementById('forumTypeArticlePane').style.display = type==='article' ? '' : 'none';
  var embedGroup=document.getElementById('forumEmbedGroup');
  if(embedGroup) embedGroup.style.display = type==='article' ? '' : 'none';
  var sizer=document.getElementById('forumImageSizer');
  if(sizer && type!=='article') sizer.style.display='none';
  setActiveImage(null);
}
function applyFontSize(px){
  var editor=focusActiveEditor();
  document.execCommand('fontSize', false, '7');
  if(!editor) return;
  Array.from(editor.querySelectorAll('font[size=\"7\"]')).forEach(function(el){
    el.removeAttribute('size');
    el.style.fontSize = px+'px';
  });
}
async function submitForumPost(){
  if(!canForumPost()) return;
  var title=(document.getElementById('forumModalTitle').value||'').trim();
  if(!title){ setPublishStatus('请填写标题'); return; }
  var editing = !!forumEditingPostId;
  var targetSection = editing ? (forumEditingSection || forumSection) : getForumPostingSection();
  if(!editing && !targetSection){
    if(forumSection==='all'){
      setPublishStatus('全部分区仅用于浏览汇总，请先切换到具体分区再发布。');
    }else{
      setPublishStatus('移民分区请先选择具体组别（1-10）再发布。');
    }
    return;
  }
  var payload={ section: targetSection, title: title, type: forumPostType };
  var btn=document.getElementById('forumPublishBtn');
  if(forumPostType==='image'){
    var imgHtml=(document.getElementById('forumImageEditor').innerHTML||'').trim();
    if(imgHtml === '<br>') imgHtml = '';
    var cleanedHtml = stripImagesFromHtml(imgHtml);
    if(cleanedHtml !== imgHtml){
      showDevToast('图文不支持插图，已移除');
      imgHtml = cleanedHtml;
    }
    imgHtml = sanitizeHtml(imgHtml);
    document.getElementById('forumImageEditor').innerHTML = imgHtml;
    var imgText=getPlainTextFromHtml(imgHtml);
    if(!imgText){ setPublishStatus('请填写内容'); return; }
    var safeImages = forumImageListData.map(sanitizeUrl).filter(Boolean);
    if(!safeImages.length){ setPublishStatus('请上传图片'); return; }
    payload.contentText = imgText;
    payload.contentHtml = imgHtml;
    payload.coverImage = safeImages.length===1 ? safeImages[0] : safeImages;
  }else{
    var html=document.getElementById('forumEditor').innerHTML.trim();
    html = sanitizeHtml(html);
    if(!html || html === '<br>'){ setPublishStatus('请填写文章内容'); return; }
    if(html.length > MAX_FORUM_CONTENT_HTML){
      setPublishStatus('Article content is too large. Please reduce embedded image size.');
      return;
    }
    payload.contentHtml = html;
  }
  setPublishStatus(editing ? '保存中...' : '发布中...');
  if(btn) btn.disabled=true;
  try{
    var url = editing ? ('/api/forum/posts/'+forumEditingPostId+'/update') : '/api/forum/posts';
    var method = 'POST';
    var r=await apiFetchWithTimeout(url,{method:method,body:JSON.stringify(payload)},15000);
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      setPublishStatus((editing ? '保存失败：' : '发布失败：')+(d.error||r.status));
      return;
    }
    var pending = d && d.post && d.post.status === 'pending';
    setPublishStatus(editing ? '保存成功' : (pending ? '发布成功，等待审核' : '发布成功'));
    resetForumComposer();
    closeForumModal();
    if(editing && forumCurrentPostId){
      await loadForumDetail(forumCurrentPostId);
    }
    loadForumPosts();
  }catch(e){
    if(e && e.name==='AbortError') setPublishStatus((editing ? '保存超时' : '发布超时')+'，请检查后端服务');
    else setPublishStatus((editing ? '保存失败：' : '发布失败：')+(e.message||'网络错误'));
  }finally{
    if(btn) btn.disabled=false;
  }
}
function setForumSection(section){
  if(!forumSectionMap[section]) return;
  forumSection=section;
  forumPage = 1;
  document.querySelectorAll('.forum-tab').forEach(function(btn){
    btn.classList.toggle('active', btn.getAttribute('data-section')===section);
  });
  refreshForumMigrationTabs();
  updateForumAccess();
  updateForumPublishAccess();
  loadForumPosts();
}
async function openForumView(id){
  forumViewReturnScrollY = getWindowScrollY();
  forumCurrentPostId = id;
  forumReplyToComment = null;
  forumExpandedReplyThreads = {};
  forumOpenCommentMenuId = null;
  var m=document.getElementById('forumViewModal');
  if(!m) return;
  m.classList.add('open');
  m.setAttribute('aria-hidden','false');
  syncBodyNoScroll();
  var likeBtn=document.getElementById('forumLikeBtn');
  var favoriteBtn=document.getElementById('forumFavoriteBtn');
  if(likeBtn){
    likeBtn.disabled=true;
    likeBtn.classList.add('loading');
  }
  if(favoriteBtn){
    favoriteBtn.disabled=true;
    favoriteBtn.classList.add('loading');
  }
  await loadForumDetail(id, { recordView: true });
}
var forumLightboxState = { originalUrl:'', showingOriginal:false, sizeBytes:0 };
function resetForumImageLightboxOriginalBtn(){
  var btn=document.getElementById('forumImageLightboxOriginal');
  var stage=document.getElementById('forumImageLightboxStage');
  if(stage) stage.classList.remove('is-original');
  if(!btn) return;
  btn.style.display='none';
  btn.disabled=false;
  btn.textContent='查看原图';
  forumLightboxState = { originalUrl:'', showingOriginal:false, sizeBytes:0 };
}
function updateForumImageLightboxOriginalBtn(meta){
  var btn=document.getElementById('forumImageLightboxOriginal');
  if(!btn) return;
  if(forumLightboxState.showingOriginal || !forumLightboxState.originalUrl || forumLightboxState.originalUrl.indexOf('/uploads/')!==0){
    btn.style.display='none';
    return;
  }
  btn.style.display='';
  var sizeLabel=formatForumOriginalSizeLabel(meta && meta.size ? meta.size : forumLightboxState.sizeBytes);
  btn.textContent=sizeLabel ? ('查看原图（'+sizeLabel+'）') : '查看原图';
}
function openForumImageLightbox(src, altText, originalSrc){
  var safeOriginal=getForumImageOriginalUrl(originalSrc || src);
  var previewSrc=isForumUploadImageUrl(safeOriginal)
    ? buildForumImageThumbUrl(safeOriginal, 1200, 75)
    : sanitizeUrl(src);
  var modal=document.getElementById('forumImageLightbox');
  var img=document.getElementById('forumImageLightboxImg');
  if(!modal || !img || !previewSrc) return;
  resetForumImageLightboxOriginalBtn();
  forumLightboxState.originalUrl=safeOriginal;
  forumLightboxState.showingOriginal=false;
  img.src=previewSrc;
  img.alt=String(altText||'图片预览');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  syncBodyNoScroll();
  updateForumImageLightboxOriginalBtn(null);
  if(safeOriginal && safeOriginal.indexOf('/uploads/')===0){
    fetchForumImageMeta(safeOriginal).then(function(meta){
      if(forumLightboxState.originalUrl!==safeOriginal || forumLightboxState.showingOriginal) return;
      if(meta && meta.size) forumLightboxState.sizeBytes=meta.size;
      updateForumImageLightboxOriginalBtn(meta);
    });
  }
}
function showForumImageLightboxOriginal(){
  var img=document.getElementById('forumImageLightboxImg');
  var stage=document.getElementById('forumImageLightboxStage');
  var originalUrl=forumLightboxState.originalUrl;
  if(!img || !originalUrl || originalUrl.indexOf('/uploads/')!==0) return;
  forumLightboxState.showingOriginal=true;
  img.src=originalUrl;
  if(stage) stage.classList.add('is-original');
  updateForumImageLightboxOriginalBtn(null);
}
function closeForumImageLightbox(){
  var modal=document.getElementById('forumImageLightbox');
  var img=document.getElementById('forumImageLightboxImg');
  if(!modal || !img) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  img.removeAttribute('src');
  resetForumImageLightboxOriginalBtn();
  syncBodyNoScroll();
}
function closeForumView(){
  var m=document.getElementById('forumViewModal');
  if(!m) return;
  closeForumImageLightbox();
  m.classList.remove('open');
  m.setAttribute('aria-hidden','true');
  syncBodyNoScroll();
  forumCurrentPostId = null;
  forumCurrentPost = null;
  forumCurrentComments = [];
  forumReplyToComment = null;
  forumExpandedReplyThreads = {};
  forumOpenCommentMenuId = null;
  var replyHint=document.getElementById('forumReplyHint');
  if(replyHint){
    replyHint.style.display='none';
    replyHint.innerHTML='';
  }
  loadForumPosts({ silent: true, restoreScrollY: forumViewReturnScrollY });
  restoreForumScrollPosition(forumViewReturnScrollY);
}
function setForumReplyTarget(comment){
  forumReplyToComment = comment || null;
  var replyHint=document.getElementById('forumReplyHint');
  var input=document.getElementById('forumCommentInput');
  if(!replyHint) return;
  if(!forumReplyToComment){
    replyHint.style.display='none';
    replyHint.innerHTML='';
    if(input && authUser) input.placeholder='写下你的评论';
    return;
  }
  var username = forumReplyToComment.author?.username || '匿名';
  replyHint.innerHTML = '正在回复 <strong>'+escapeHtml(username)+'</strong>'
    + '<button class="btn secondary forum-cancel-reply" type="button">取消</button>';
  replyHint.style.display='';
  if(input && authUser) input.placeholder='写下你的回复';
}
function renderComments(comments){
  var box=document.getElementById('forumCommentList');
  if(!box) return;
  forumCurrentComments = Array.isArray(comments) ? comments : [];
  if(!comments || comments.length===0){
    box.innerHTML='<div class="forum-status">暂无评论</div>';
    return;
  }
  var byId=new Map();
  comments.forEach(function(c){ byId.set(Number(c.id), c); });
  if(forumOpenCommentMenuId && !byId.has(Number(forumOpenCommentMenuId))){
    forumOpenCommentMenuId = null;
  }
  var topLevel=[];
  var repliesByTop=new Map();
  comments.forEach(function(c){
    var parentId=Number(c.replyToCommentId||0);
    if(!parentId || !byId.has(parentId)){
      topLevel.push(c);
      return;
    }
    var root=byId.get(parentId);
    var guard=0;
    while(root && root.replyToCommentId && byId.has(Number(root.replyToCommentId)) && guard<32){
      root=byId.get(Number(root.replyToCommentId));
      guard++;
    }
    if(!root){
      topLevel.push(c);
      return;
    }
    var rootId=Number(root.id);
    if(!repliesByTop.has(rootId)) repliesByTop.set(rootId, []);
    repliesByTop.get(rootId).push(c);
  });
  repliesByTop.forEach(function(arr){
    arr.sort(function(a,b){ return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); });
  });
  function renderCommentItem(c, isReply){
    var pinBadge = c.isPinned ? '<span class="forum-badge pinned">置顶</span>' : '';
    var canPin = authUser && (authUser.isAdmin || (forumCurrentPost && Number(authUser.id)===Number(forumCurrentPost.author?.id)));
    var pinBtn = canPin ? '<button class="forum-comment-menu-btn forum-pin-comment" data-id="'+c.id+'" type="button">'+(c.isPinned?'取消置顶':'置顶')+'</button>' : '';
    var canDelete = canDeleteForumComment(c);
    var deleteBtn = canDelete ? '<button class="forum-comment-menu-btn danger forum-delete-comment" data-id="'+c.id+'" type="button">删除</button>' : '';
    var replyBtn = authUser ? '<button class="btn secondary forum-reply-comment" data-id="'+c.id+'" type="button">回复</button>' : '';
    var isPostAuthor = !!(forumCurrentPost && c.author && Number(c.author.id)===Number(forumCurrentPost.author?.id));
    var authorMark = isPostAuthor
      ? '<span class="forum-author-mark"><span class="forum-author-mark-icon" aria-hidden="true"></span>作者</span>'
      : '';
    var authorName = c.author?.username || '匿名';
    var authorIdentity = renderForumAuthorIdentity(c.author, authorName);
    var replyMeta = '';
    if(c.replyTo){
      var replyName = c.replyTo.author?.username || '匿名';
      replyMeta = '<div class="forum-comment-meta">回复 @'+escapeHtml(replyName)+'</div>';
    }
    var menuActions = pinBtn + deleteBtn;
    var menuHtml = '';
    if(menuActions){
      var isOpen = Number(forumOpenCommentMenuId)===Number(c.id);
      menuHtml = '<div class="forum-comment-menu-wrap">'
        + '<button class="forum-comment-more" data-id="'+c.id+'" type="button" aria-label="更多操作">⋯</button>'
        + '<div class="forum-comment-menu'+(isOpen?' open':'')+'">'+menuActions+'</div>'
        + '</div>';
    }
    var bottomActions = replyBtn ? ('<div class="forum-comment-actions">'+replyBtn+'</div>') : '';
    return '<div class="forum-comment'+(isReply?' reply':'')+'">'+
      '<div class="forum-comment-head">'
        + '<div class="forum-comment-meta"><span class="forum-meta-author">'+authorIdentity+authorMark+'</span> · '+formatForumDate(c.createdAt)+pinBadge+'</div>'
        + menuHtml
      + '</div>'+
      replyMeta+
      '<div class="forum-post-content">'+escapeHtmlWithBreaks(c.content)+'</div>'+
      bottomActions+
    '</div>';
  }
  var html='';
  topLevel.forEach(function(c){
    html += renderCommentItem(c, false);
    var replies = repliesByTop.get(Number(c.id)) || [];
    if(!replies.length) return;
    var expanded = !!forumExpandedReplyThreads[c.id];
    var visibleReplies = expanded ? replies : replies.slice(0, 1);
    html += '<div class="forum-replies">';
    visibleReplies.forEach(function(reply){
      html += renderCommentItem(reply, true);
    });
    if(replies.length > 1){
      var hiddenCount = replies.length - 1;
      var text = expanded ? '收起回复' : ('展开'+hiddenCount+'条回复');
      html += '<div class="forum-reply-toggle" data-thread-id="'+c.id+'">'+text+'</div>';
    }
    html += '</div>';
  });
  box.innerHTML=html;
}
function toggleReplyThread(commentId){
  var id=Number(commentId);
  if(!id) return;
  forumExpandedReplyThreads[id] = !forumExpandedReplyThreads[id];
  renderComments(forumCurrentComments);
}
function toggleCommentMenu(commentId){
  var id=Number(commentId);
  if(!id) return;
  forumOpenCommentMenuId = Number(forumOpenCommentMenuId)===id ? null : id;
  renderComments(forumCurrentComments);
}
function updateForumLikeUI(post, comments){
  var btn=document.getElementById('forumLikeBtn');
  var countEl=document.getElementById('forumLikeCount');
  var favoriteBtn=document.getElementById('forumFavoriteBtn');
  var favoriteCountEl=document.getElementById('forumFavoriteCount');
  var viewEl=document.getElementById('forumDetailViewCount');
  var commentEl=document.getElementById('forumDetailCommentCount');
  var viewCount = Number(post && post.viewCount || 0);
  var likeCount = Number(post && post.likeCount || 0);
  var favoriteCount = Number(post && post.favoriteCount || 0);
  var commentCount = Number(post && post.commentCount || (comments ? comments.length : 0));
  if(viewEl) viewEl.textContent = viewCount;
  if(countEl) countEl.textContent = likeCount;
  if(favoriteCountEl) favoriteCountEl.textContent = favoriteCount;
  if(commentEl) commentEl.textContent = commentCount;
  if(btn){
    var liked = !!(post && post.likedByMe);
    btn.classList.toggle('liked', liked);
    btn.classList.remove('loading');
    btn.disabled = !authUser;
  }
  if(favoriteBtn){
    var favorited = !!(post && post.favoritedByMe);
    favoriteBtn.classList.toggle('favorited', favorited);
    favoriteBtn.classList.remove('loading');
    favoriteBtn.disabled = !authUser;
  }
}
function updateForumListStats(postId, likeCount, commentCount, favoriteCount, viewCount){
  var card=document.querySelector('.forum-post[data-id=\"'+postId+'\"]');
  if(!card) return;
  var viewEl=card.querySelector('.forum-view-count');
  var likeEl=card.querySelector('.forum-like-count');
  var favoriteEl=card.querySelector('.forum-favorite-count');
  var commentEl=card.querySelector('.forum-comment-count');
  if(viewEl && viewCount !== undefined && viewCount !== null) viewEl.textContent = viewCount;
  if(likeEl && likeCount !== undefined && likeCount !== null) likeEl.textContent = likeCount;
  if(favoriteEl && favoriteCount !== undefined && favoriteCount !== null) favoriteEl.textContent = favoriteCount;
  if(commentEl && commentCount !== undefined && commentCount !== null) commentEl.textContent = commentCount;
}
async function loadForumDetail(id, opts){
  opts = opts || {};
  try{
    var qs=new URLSearchParams();
    qs.set('_', String(Date.now()));
    qs.set('nc', Math.random().toString(36).slice(2, 14)+String(Date.now()));
    if(opts.recordView) qs.set('incrementView', '1');
    var r=await apiFetch('/api/forum/posts/'+id+'?'+qs.toString(),{method:'GET'});
    if(!r.ok){ return; }
    var d=await r.json();
    var post=d.post;
    forumCurrentPost = post;
    updateForumLikeUI(post, d.comments||[]);
    mergeForumLatestPostSnapshot(post);
    // 打开详情会触发浏览量 +1，这里把最新数据同步回列表卡片
    updateForumListStats(id, post.likeCount, post.commentCount, post.favoriteCount, post.viewCount);
    document.getElementById('forumViewTitle').textContent = post.title || '阅读内容';
    var detailAuthorName = post.author?.username || '匿名';
    var detailAuthorIdentity = renderForumAuthorIdentity(post.author, detailAuthorName);
    var aid = Number(post.author && post.author.id);
    var followPart = '';
    if(Number.isFinite(aid) && aid>0){
      if(authUser && Number(authUser.id)===aid){
        followPart = '';
      }else if(authUser){
        var on = !!(post.author && post.author.iFollow);
        followPart = '<button type="button" class="btn secondary forum-detail-follow-btn" data-forum-follow="'+aid+'">'+(on?'已关注':'关注')+'</button>';
      }else{
        followPart = '<button type="button" class="btn secondary forum-detail-follow-btn" data-forum-follow-login="1">关注</button>';
      }
    }
    var typeLbl = post.type==='image'?'图文':'文章';
    document.getElementById('forumViewMeta').innerHTML =
      '<div class="forum-detail-meta-row">'
      +'<span class="forum-meta-author">'+detailAuthorIdentity+'</span>'
      + followPart
      +'<span class="forum-detail-meta-rest">'+formatForumDate(post.createdAt)+' · '+typeLbl+'</span>'
      +'</div>';
    var contentBox=document.getElementById('forumViewContent');
  if(post.type==='image'){
    var images = Array.isArray(post.coverImages) ? post.coverImages : parseCoverImages(post.coverImage);
    var safeImages = images.map(sanitizeUrl).filter(Boolean);
    var imgHtml = safeImages.length
      ? '<div class="forum-image-grid">'+safeImages.map(function(src){ return buildForumImageTag(src, { previewWidth: 720, previewQuality: 58, alt: '图片' }); }).join('')+'</div>'
      : '';
    var bodyHtml = post.contentHtml
      ? sanitizeHtml(post.contentHtml)
      : '<div class="forum-post-content">'+escapeHtmlWithBreaks(post.contentText||'')+'</div>';
    contentBox.innerHTML = bodyHtml + imgHtml;
    enhanceForumImages(contentBox, { previewWidth: 720, previewQuality: 58 });
  }else{
    contentBox.innerHTML = sanitizeHtml(post.contentHtml || '');
    enhanceForumImages(contentBox, { previewWidth: 720, previewQuality: 58 });
  }
    var pinBtn=document.getElementById('forumPinPostBtn');
    if(pinBtn){
      if(authUser && (authUser.isAdmin || authUser.forumPublisher)){
        pinBtn.style.display='';
        pinBtn.textContent = post.isPinned ? '取消置顶' : '置顶';
      }else{
        pinBtn.style.display='none';
      }
    }
    var editPostBtn=document.getElementById('forumEditPostBtn');
    if(editPostBtn) editPostBtn.style.display = canEditForumPost(post) ? '' : 'none';
    var deletePostBtn=document.getElementById('forumDeletePostBtn');
    if(deletePostBtn) deletePostBtn.style.display = canDeleteForumPost(post) ? '' : 'none';
    var commentInput=document.getElementById('forumCommentInput');
    var commentSubmit=document.getElementById('forumCommentSubmit');
    if(commentInput){
      commentInput.disabled = !authUser;
      commentInput.placeholder = authUser ? (forumReplyToComment ? '写下你的回复' : '写下你的评论') : '请先登录后评论';
    }
    if(commentSubmit) commentSubmit.disabled = !authUser;
    renderComments(d.comments||[]);
    if(forumReplyToComment){
      var nextReply = (d.comments||[]).find(function(item){ return Number(item.id)===Number(forumReplyToComment.id); });
      setForumReplyTarget(nextReply || null);
    }else{
      setForumReplyTarget(null);
    }
    if(opts.recordView) loadForumPosts({ silent: true });
  }catch(e){}
}
async function toggleForumDetailFollow(uid){
  uid = Number(uid);
  if(!Number.isFinite(uid) || uid<=0) return;
  if(!authUser){ showDevToast('请先登录'); return; }
  if(Number(authUser.id)===uid){ showDevToast('不能关注自己'); return; }
  var btn=document.querySelector('#forumViewMeta [data-forum-follow="'+uid+'"]');
  var post=forumCurrentPost;
  if(!post || !post.author || Number(post.author.id)!==uid) return;
  var was=!!post.author.iFollow;
  if(btn) btn.disabled=true;
  try{
    var method = was ? 'DELETE' : 'POST';
    var r=await apiFetch('/api/users/'+encodeURIComponent(uid)+'/follow',{method:method,body:'{}'});
    if(!r.ok){ showDevToast('操作失败'); return; }
    post.author.iFollow = !was;
    if(authUser){
      authUser.followingCount = Math.max(0, Number(authUser.followingCount || 0) + (was ? -1 : 1));
      renderMe();
    }
    if(Number(userHomeState.userId)===uid && userHomeState.profile){
      userHomeState.profile.iFollow = post.author.iFollow;
      userHomeState.profile.followerCount = Math.max(0, Number(userHomeState.profile.followerCount || 0) + (was ? -1 : 1));
      renderUserHomeProfile();
    }
    if(Number(chatState.activeUserId)===uid){
      chatState.relation.iFollow = !!post.author.iFollow;
      updateChatInputState();
    }
    if(btn){
      btn.textContent = post.author.iFollow ? '已关注' : '关注';
    }
  }catch(e){
    showDevToast('操作失败：'+(e.message||'网络错误'));
  }finally{
    if(btn) btn.disabled=false;
  }
}
async function submitComment(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var content=(document.getElementById('forumCommentInput').value||'').trim();
  if(!content){ return; }
  if(!forumCurrentPostId) return;
  try{
    var payload = { postId: forumCurrentPostId, content: content };
    if(forumReplyToComment && forumReplyToComment.id){
      payload.replyToCommentId = Number(forumReplyToComment.id);
    }
    var r=await apiFetch('/api/forum/comments',{method:'POST',body:JSON.stringify(payload)});
    if(!r.ok){ return; }
    document.getElementById('forumCommentInput').value='';
    setForumReplyTarget(null);
    loadForumDetail(forumCurrentPostId);
  }catch(e){}
}
async function toggleLike(){
  if(!forumCurrentPostId) return;
  if(!authUser){ showDevToast('请先登录'); return; }
  var btn=document.getElementById('forumLikeBtn');
  if(btn){
    btn.disabled=true;
    btn.classList.add('loading');
  }
  try{
    var r=await apiFetch('/api/forum/posts/'+forumCurrentPostId+'/like',{method:'POST',body:'{}'});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok) return;
    if(!forumCurrentPost) forumCurrentPost = { id: forumCurrentPostId };
    forumCurrentPost.likeCount = Number(d.likeCount || 0);
    forumCurrentPost.likedByMe = !!d.liked;
    updateForumLikeUI(forumCurrentPost, null);
    mergeForumLatestPostSnapshot({ id: forumCurrentPostId, likeCount: forumCurrentPost.likeCount, likedByMe: forumCurrentPost.likedByMe });
    updateForumListStats(forumCurrentPostId, forumCurrentPost.likeCount);
    loadMyCollections();
  }catch(e){} finally{
    if(btn){
      btn.classList.remove('loading');
      if(authUser) btn.disabled=false;
    }
    if(forumCurrentPost) updateForumLikeUI(forumCurrentPost, null);
  }
}
async function toggleFavorite(){
  if(!forumCurrentPostId) return;
  if(!authUser){ showDevToast('请先登录'); return; }
  var btn=document.getElementById('forumFavoriteBtn');
  if(btn){
    btn.disabled=true;
    btn.classList.add('loading');
  }
  try{
    var r=await apiFetch('/api/forum/posts/'+forumCurrentPostId+'/favorite',{method:'POST',body:'{}'});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok) return;
    if(!forumCurrentPost) forumCurrentPost = { id: forumCurrentPostId };
    forumCurrentPost.favoriteCount = Number(d.favoriteCount || 0);
    forumCurrentPost.favoritedByMe = !!d.favorited;
    updateForumLikeUI(forumCurrentPost, null);
    mergeForumLatestPostSnapshot({ id: forumCurrentPostId, favoriteCount: forumCurrentPost.favoriteCount, favoritedByMe: forumCurrentPost.favoritedByMe });
    updateForumListStats(forumCurrentPostId, forumCurrentPost.likeCount, undefined, forumCurrentPost.favoriteCount);
    loadMyCollections();
  }catch(e){} finally{
    if(btn){
      btn.classList.remove('loading');
      if(authUser) btn.disabled=false;
    }
    if(forumCurrentPost) updateForumLikeUI(forumCurrentPost, null);
  }
}
async function togglePostPin(){
  if(!forumCurrentPostId) return;
  if(!(authUser && (authUser.isAdmin || authUser.forumPublisher))) return;
  try{
    var r=await apiFetch('/api/forum/posts/'+forumCurrentPostId+'/pin',{method:'POST',body:JSON.stringify({pinned: !forumCurrentPost?.isPinned})});
    if(!r.ok) return;
    await loadForumDetail(forumCurrentPostId);
    loadForumPosts();
  }catch(e){}
}
async function toggleCommentPin(commentId){
  if(!commentId) return;
  try{
    var r=await apiFetch('/api/forum/comments/'+commentId+'/pin',{method:'POST',body:JSON.stringify({})});
    if(!r.ok) return;
    loadForumDetail(forumCurrentPostId);
  }catch(e){}
}
function startReplyComment(commentId){
  if(!authUser){ showDevToast('请先登录'); return; }
  var comment = forumCurrentComments.find(function(item){ return Number(item.id)===Number(commentId); });
  if(!comment) return;
  setForumReplyTarget(comment);
  var input=document.getElementById('forumCommentInput');
  if(input) input.focus();
}
function editCurrentPost(){
  var post = forumCurrentPost;
  if(!post || !canEditForumPost(post)) return;
  closeForumView();
  openForumModal(post);
}
async function deleteCurrentPost(){
  var post = forumCurrentPost;
  if(!post || !forumCurrentPostId || !canDeleteForumPost(post)) return;
  if(!window.confirm('确定删除这篇内容吗？删除后不可恢复。')) return;
  try{
    var r=await apiFetch('/api/forum/posts/'+forumCurrentPostId,{method:'DELETE'});
    if(!r.ok){
      showDevToast('删除失败');
      return;
    }
    closeForumView();
    loadForumPosts();
  }catch(e){}
}
async function deleteForumComment(commentId){
  if(!commentId) return;
  if(!window.confirm('确定删除这条评论吗？')) return;
  try{
    var r=await apiFetch('/api/forum/comments/'+commentId,{method:'DELETE'});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      showDevToast('删除失败');
      return;
    }
    if(forumReplyToComment && Number(forumReplyToComment.id)===Number(commentId)){
      setForumReplyTarget(null);
    }
    if(forumCurrentPostId){
      if(forumCurrentPost){
        forumCurrentPost.commentCount = Number(d.commentCount || 0);
        updateForumLikeUI(forumCurrentPost, null);
      }
      updateForumListStats(forumCurrentPostId, forumCurrentPost?.likeCount, d.commentCount);
      loadForumDetail(forumCurrentPostId);
    }
  }catch(e){}
}
function openAuthModal(){ var m=document.getElementById('authModal'); if(m){ m.classList.add('open'); m.setAttribute('aria-hidden','false'); document.getElementById('authError').textContent=''; document.getElementById('authUsername').value=''; document.getElementById('authPassword').value=''; setTimeout(function(){ document.getElementById('authUsername').focus(); },0); } }
function closeAuthModal(){ var m=document.getElementById('authModal'); if(m){ m.classList.remove('open'); m.setAttribute('aria-hidden','true'); } }
var pendingProfileAvatarDataUrl = '';
function updateProfileUsernameText(){
  var usernameText=document.getElementById('profileUsernameText');
  if(usernameText) usernameText.textContent=(authUser && authUser.username) ? authUser.username : '-';
}
function updateProfileBaseFields(){
  var gender=document.getElementById('profileGender');
  var birthday=document.getElementById('profileBirthday');
  var birthdayPublic=document.getElementById('profileBirthdayPublic');
  var bio=document.getElementById('profileBio');
  if(gender){
    gender.value = normalizeGenderCode(authUser && authUser.gender);
  }
  if(birthday){
    birthday.value = normalizeBirthdayText(authUser && authUser.birthday);
  }
  if(birthdayPublic){
    birthdayPublic.value = (authUser && authUser.birthdayPublic) ? '1' : '0';
  }
  if(bio){
    bio.value = normalizeProfileBioText(authUser && authUser.bio);
  }
}
function openProfileModal(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var m=document.getElementById('profileModal');
  if(!m) return;
  var avatarInput=document.getElementById('profileAvatarInput');
  var err=document.getElementById('profileError');
  if(err) err.textContent='';
  if(avatarInput) avatarInput.value='';
  pendingProfileAvatarDataUrl = '';
  updateProfileUsernameText();
  updateProfileBaseFields();
  updateProfileAvatarPreview();
  updateProfileAvatarHint();
  updateProfileHint();
  m.classList.add('open');
  m.setAttribute('aria-hidden','false');
  setTimeout(function(){
    var btn=document.getElementById('profileUsernameTrigger');
    if(btn) btn.focus();
  },0);
}
function closeProfileModal(){
  var m=document.getElementById('profileModal');
  if(!m) return;
  m.classList.remove('open');
  m.setAttribute('aria-hidden','true');
  closeProfileNameModal();
  closeAvatarPreviewModal();
}
function updateProfileHint(){
  var hint=document.getElementById('profileHint');
  if(!hint) return;
  var nextChange=getNextUsernameChangeAt();
  var remain=getUsernameChangeRemaining();
  updateProfileAvatarHint();
  updateProfileUsernameText();
  updateProfileNameHint();
  if(remain<=0){
    hint.textContent='本月修改次数已用完，下次可修改：'+formatShortDate(nextChange);
  }else{
    hint.textContent='点击用户名可修改，本月还可修改'+remain+'次（2-15字，中英文/数字/下划线）';
  }
}
function openProfileNameModal(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var modal=document.getElementById('profileNameModal');
  var input=document.getElementById('profileNameInput');
  var err=document.getElementById('profileNameError');
  if(err) err.textContent='';
  if(input) input.value=authUser.username||'';
  updateProfileNameHint();
  if(modal){
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
  }
  setTimeout(function(){ if(input) input.focus(); },0);
}
function closeProfileNameModal(){
  var modal=document.getElementById('profileNameModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
}
function updateProfileNameHint(){
  var hint=document.getElementById('profileNameHint');
  var btn=document.getElementById('profileNameConfirm');
  if(!hint) return;
  var nextChange=getNextUsernameChangeAt();
  var remain=getUsernameChangeRemaining();
  if(remain<=0){
    hint.textContent='本月修改次数已用完，下次可修改：'+formatShortDate(nextChange);
    if(btn) btn.disabled=true;
  }else{
    hint.textContent='当前可修改，本月还可修改'+remain+'次（2-15字，中英文/数字/下划线）';
    if(btn) btn.disabled=false;
  }
}
function openAvatarPreviewModal(dataUrl){
  var modal=document.getElementById('avatarPreviewModal');
  var img=document.getElementById('avatarPreviewImage');
  var err=document.getElementById('avatarPreviewError');
  if(!modal || !img || !dataUrl) return;
  if(err) err.textContent='';
  img.src=String(dataUrl);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
}
function closeAvatarPreviewModal(){
  var modal=document.getElementById('avatarPreviewModal');
  var input=document.getElementById('profileAvatarInput');
  var err=document.getElementById('avatarPreviewError');
  if(modal){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
  }
  if(err) err.textContent='';
  pendingProfileAvatarDataUrl = '';
  if(input) input.value='';
}
async function handleProfileAvatarFileChange(){
  if(!authUser) return;
  var input=document.getElementById('profileAvatarInput');
  var err=document.getElementById('profileError');
  if(!input || !input.files || !input.files.length) return;
  var file=input.files[0];
  if(!file || !/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type || '')){
    if(err) err.textContent='仅支持 PNG/JPG/WEBP/GIF';
    input.value='';
    return;
  }
  if(file.size > 2 * 1024 * 1024){
    if(err) err.textContent='图片大小不能超过 2MB';
    input.value='';
    return;
  }
  if(err) err.textContent='';
  try{
    var dataUrl=await new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onload=function(){ resolve(String(reader.result||'')); };
      reader.onerror=function(){ reject(new Error('READ_FILE_FAILED')); };
      reader.readAsDataURL(file);
    });
    pendingProfileAvatarDataUrl = dataUrl;
    openAvatarPreviewModal(dataUrl);
  }catch(e){
    if(err) err.textContent='读取头像失败';
    input.value='';
  }
}
function uploadProfileAvatar(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var input=document.getElementById('profileAvatarInput');
  var btn=document.getElementById('profileAvatarUpload');
  var err=document.getElementById('profileError');
  var next=getNextAvatarUploadAt();
  if(next && Date.now() < next.getTime()){
    if(err) err.textContent='头像上传冷却中，下次可上传：'+formatShortDate(next);
    if(btn) btn.disabled=true;
    return;
  }
  if(btn) btn.disabled=false;
  if(err) err.textContent='';
  if(input) input.click();
}
async function confirmProfileAvatarUpload(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var dataUrl=String(pendingProfileAvatarDataUrl || '');
  var err=document.getElementById('avatarPreviewError');
  var profileErr=document.getElementById('profileError');
  var btn=document.getElementById('avatarPreviewConfirm');
  if(!dataUrl){
    if(err) err.textContent='请先选择头像图片';
    return;
  }
  if(err) err.textContent='';
  if(btn) btn.disabled=true;
  try{
    var r=await apiFetch('/api/profile/avatar',{method:'POST',body:JSON.stringify({imageDataUrl:dataUrl})});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      var msg='头像上传失败';
      if(d && d.error==='TOO_SOON'){
        msg='头像上传冷却中';
        if(d.nextAt) msg+='，下次可上传：'+formatShortDate(d.nextAt);
        if(authUser) authUser.avatarNextAt = d.nextAt || null;
      }else if(d && d.error==='BAD_IMAGE'){
        msg='图片格式或大小不符合要求';
      }
      if(err) err.textContent=msg;
      if(profileErr) profileErr.textContent=msg;
      updateProfileAvatarHint();
      return;
    }
    if(authUser){
      authUser.avatarUrl = d.avatarUrl || authUser.avatarUrl || null;
      authUser.avatarUpdatedAt = d.updatedAt || new Date().toISOString();
      authUser.avatarNextAt = d.nextAt || null;
    }
    if(profileErr) profileErr.textContent='';
    updateProfileAvatarPreview();
    updateProfileAvatarHint();
    loadForumPosts();
    if(forumCurrentPostId) loadForumDetail(forumCurrentPostId);
    closeAvatarPreviewModal();
    showDevToast('头像上传成功');
  }catch(e){
    var errorMsg='头像上传失败：'+(e.message||'网络错误');
    if(err) err.textContent=errorMsg;
    if(profileErr) profileErr.textContent=errorMsg;
  }finally{
    if(btn) btn.disabled=false;
    var uploadBtn=document.getElementById('profileAvatarUpload');
    if(uploadBtn){
      var nextAt=getNextAvatarUploadAt();
      uploadBtn.disabled=!!(nextAt && Date.now() < nextAt.getTime());
    }
  }
}
async function saveProfileBase(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var genderEl=document.getElementById('profileGender');
  var birthdayEl=document.getElementById('profileBirthday');
  var birthdayPublicEl=document.getElementById('profileBirthdayPublic');
  var bioEl=document.getElementById('profileBio');
  var err=document.getElementById('profileError');
  var btn=document.getElementById('profileBaseSave');
  var nextGender=normalizeGenderCode(genderEl && genderEl.value);
  var nextBirthday=normalizeBirthdayText(birthdayEl && birthdayEl.value);
  var nextBirthdayPublic=!!(birthdayPublicEl && birthdayPublicEl.value==='1');
  var nextBio=String(bioEl && bioEl.value || '').trim();
  if(countChars(nextBio) > PROFILE_BIO_MAX_CHARS){
    if(err) err.textContent='个人介绍最多 120 字';
    return;
  }
  if(err) err.textContent='';
  if(btn) btn.disabled=true;
  try{
    var r=await apiFetch('/api/profile',{method:'POST',body:JSON.stringify({
      gender: nextGender,
      birthday: nextBirthday || null,
      birthdayPublic: nextBirthdayPublic,
      bio: nextBio
    })});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      var msg='保存失败';
      if(d && d.error==='BAD_BIRTHDAY') msg='生日格式错误，请选择有效日期';
      if(d && d.error==='BAD_GENDER') msg='性别参数错误';
      if(d && d.error==='BAD_BIO') msg='个人介绍最多 120 字';
      if(err) err.textContent=msg;
      return;
    }
    if(d && d.user){
      authUser=d.user;
      updateAuthUI();
      renderMe();
      updateForumAccess();
      updateForumPublishAccess();
      updateProfileBaseFields();
      updateProfileHint();
      if(userHomeState && userHomeState.profile && Number(userHomeState.profile.id)===Number(authUser.id)){
        userHomeState.profile.gender = authUser.gender;
        userHomeState.profile.birthday = authUser.birthday;
        userHomeState.profile.birthdayPublic = !!authUser.birthdayPublic;
        userHomeState.profile.bio = authUser.bio;
        renderUserHomeProfile();
      }
      showDevToast('资料保存成功');
    }
  }catch(e){
    if(err) err.textContent='网络错误';
  }finally{
    if(btn) btn.disabled=false;
  }
}
async function saveProfile(){
  if(!authUser){ showDevToast('请先登录'); return; }
  var input=document.getElementById('profileNameInput');
  var err=document.getElementById('profileNameError');
  var btn=document.getElementById('profileNameConfirm');
  var next=(input && input.value || '').trim();
  if(!isValidDisplayName(next)){ if(err) err.textContent='用户名需2-15字，仅中英文/数字/下划线'; return; }
  if(next === String(authUser.username||'')){ closeProfileNameModal(); return; }
  if(err) err.textContent='';
  if(btn) btn.disabled=true;
  try{
    var r=await apiFetch('/api/profile',{method:'POST',body:JSON.stringify({username: next})});
    var d=await r.json().catch(function(){ return {}; });
    if(!r.ok){
      var msg='修改失败';
      if(d && d.error==='USERNAME_TAKEN') msg='用户名已被占用';
      if(d && d.error==='TOO_SOON'){
        msg='本月修改次数已用完';
        if(d.nextAt) msg += '，下次可修改：'+formatShortDate(d.nextAt);
        if(authUser){
          authUser.usernameChangeRemaining = 0;
          authUser.usernameChangeNextAt = d.nextAt || null;
        }
        updateProfileHint();
      }
      if(d && d.error==='BAD_NAME') msg='用户名需2-15字，仅中英文/数字/下划线';
      if(err) err.textContent=msg;
      return;
    }
    if(d && d.user){
      authUser=d.user;
      updateAuthUI();
      renderMe();
      updateForumAccess();
      updateForumPublishAccess();
      updateProfileHint();
      updateProfileUsernameText();
      closeProfileNameModal();
      showDevToast('用户名修改成功');
    }
  }catch(e){
    if(err) err.textContent='网络错误';
  }finally{
    if(btn) btn.disabled=false;
  }
}
async function refreshMe(opts){
  try{
    var r=await apiFetch('/api/auth/me',{method:'GET'});
    var d=await r.json();
    var next=(d&&d.authenticated)?d.user:null;
    if(next || !(opts && opts.keepExisting)) authUser=next;
  }catch(e){
    if(!(opts && opts.keepExisting)) authUser=null;
  }
  authChecked=true;
  updateAuthUI();
  renderMe();
  loadMyCollections();
  loadMeRewards();
  if(authUser){
    syncChatSeenAtFromStorage();
    updateChatEntryCard();
    loadChatConversations();
    startChatPolling();
  }else{
    if(chatPollingTimer){ clearInterval(chatPollingTimer); chatPollingTimer=null; }
    resetChatState();
  }
  updateForumAccess();
  updateForumPublishAccess();
  await loadHomepageAnnouncement({ autoPopup:true });
  loadForumPosts();
}
function mapAuthApiError(msg, fallback){
  var v=String(msg||'');
  if(v==='PASSWORD_RULE') return '密码需8-18位且包含字母+数字';
  if(v==='PASSWORD_WEAK') return '密码过于简单，请更换';
  if(v==='USERNAME_TAKEN') return 'ID已被占用';
  if(v==='INVALID_CREDENTIALS') return 'ID或密码错误';
  if(v==='BANNED') return '账号已被拉黑';
  if(v==='CAPTCHA_REQUIRED') return '请先完成验证码';
  if(v==='CAPTCHA_INVALID') return '验证码参数无效，请重试';
  if(v==='CAPTCHA_RETRY' || v==='CAPTCHA_FAILED') return '验证码未通过，请重试';
  if(v==='CAPTCHA_VERIFY_ERROR') return '验证码服务繁忙，请稍后重试';
  if(v==='CAPTCHA_NOT_CONFIGURED') return '验证码服务未配置';
  return v || String(fallback||'操作失败');
}
async function doLogin(){
  var u=(document.getElementById('authUsername').value||'').trim();
  var p=(document.getElementById('authPassword').value||'').trim();
  var err=document.getElementById('authError');
  if(!u||!p){ if(err)err.textContent='请输入ID和密码'; return; }
  if(!isValidId(u)){ if(err)err.textContent='ID需8-18位且仅字母/数字/下划线'; return; }
  if(p.length<8||p.length>18){ if(err)err.textContent='密码8-18位'; return; }
  try{
    var r=await apiFetch('/api/auth/login',{method:'POST',body:JSON.stringify({loginId:u,password:p})});
    var d=await r.json();
    if(!r.ok){
      var msg = mapAuthApiError(d && d.error ? d.error : '', '登录失败');
      if(err) err.textContent=msg;
      return;
    }
    closeAuthModal();
    if(d && d.user){
      authUser=d.user;
      authChecked=true;
      updateAuthUI();
      renderMe();
      loadMyCollections();
      loadMeRewards();
      syncChatSeenAtFromStorage();
      updateChatEntryCard();
      loadChatConversations();
      startChatPolling();
      updateForumAccess();
      updateForumPublishAccess();
      loadForumPosts();
      setTimeout(function(){ refreshMe({ keepExisting:true }); }, 300);
    }else{
      await refreshMe();
    }
  }catch(e){
    if(err)err.textContent='网络错误：请确认通过网站访问（非 file://）且后端已启动，/api 已反代到 3001。';
  }
}
function openRegisterModal(){
  var m=document.getElementById('registerModal');
  if(!m) return;
  var err=document.getElementById('registerError');
  if(err) err.textContent='';
  document.getElementById('registerId').value='';
  document.getElementById('registerPassword').value='';
  document.getElementById('registerPassword2').value='';
  closeAuthModal();
  m.classList.add('open');
  m.setAttribute('aria-hidden','false');
  setTimeout(function(){ document.getElementById('registerId').focus(); },0);
}
function closeRegisterModal(){
  var m=document.getElementById('registerModal');
  if(!m) return;
  m.classList.remove('open');
  m.setAttribute('aria-hidden','true');
}
async function doRegister(){
  var u=(document.getElementById('registerId').value||'').trim();
  var p=(document.getElementById('registerPassword').value||'').trim();
  var p2=(document.getElementById('registerPassword2').value||'').trim();
  var err=document.getElementById('registerError');
  if(!u||!p||!p2){ if(err)err.textContent='请填写完整信息'; return; }
  if(!isValidId(u)){ if(err)err.textContent='ID需8-18位且仅字母/数字/下划线'; return; }
  if(p!==p2){ if(err)err.textContent='两次密码不一致'; return; }
  if(!isValidPassword(p)){
    if(err) err.textContent = isWeakPassword(p) ? '密码过于简单，请更换' : '密码需8-18位且包含字母+数字';
    return;
  }
  try{
    var r=await apiFetch('/api/auth/register',{method:'POST',body:JSON.stringify({loginId:u,password:p})});
    var d=await r.json();
    if(!r.ok){
      var msg = mapAuthApiError(d && d.error ? d.error : '', '注册失败');
      if(err) err.textContent=msg;
      return;
    }
    closeRegisterModal();
    showDevToast('注册成功，请登录');
  }catch(e){
    if(err)err.textContent='网络错误：请确认通过网站访问（非 file://）且后端已启动，/api 已反代到 3001。';
  }
}
async function logout(){
  try{ await apiFetch('/api/auth/logout',{method:'POST',body:'{}'}); }catch(e){}
  authUser=null;
  closeUserHome({restoreParent:false});
  closeMyCollectionModal();
  closeMeShopModal();
  closeMePointsRanking();
  closeMeRedeemModal();
  updateAuthUI();
  renderMe();
  meRewardsState.rewards=null;
  meShopState.items=[];
  renderMeRewards();
  renderMeShop();
  clearMyCollections();
  if(chatPollingTimer){ clearInterval(chatPollingTimer); chatPollingTimer=null; }
  resetChatState();
  loadForumPosts();
}
document.getElementById('btnLogin')&&document.getElementById('btnLogin').addEventListener('click',openAuthModal);
document.getElementById('btnLogout')&&document.getElementById('btnLogout').addEventListener('click',logout);
document.getElementById('authClose')&&document.getElementById('authClose').addEventListener('click',closeAuthModal);
document.getElementById('authModal')&&document.getElementById('authModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='authModal')closeAuthModal(); });
document.getElementById('authDoLogin')&&document.getElementById('authDoLogin').addEventListener('click',function(){ doLogin(); });
document.getElementById('openRegister')&&document.getElementById('openRegister').addEventListener('click',openRegisterModal);
document.getElementById('registerDo')&&document.getElementById('registerDo').addEventListener('click',doRegister);
document.getElementById('registerClose')&&document.getElementById('registerClose').addEventListener('click',closeRegisterModal);
document.getElementById('registerModal')&&document.getElementById('registerModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='registerModal')closeRegisterModal(); });
document.getElementById('profileBtn')&&document.getElementById('profileBtn').addEventListener('click',openProfileModal);
document.getElementById('meCheckInBtn')&&document.getElementById('meCheckInBtn').addEventListener('click',doMeCheckIn);
document.getElementById('openMeShopModalBtn')&&document.getElementById('openMeShopModalBtn').addEventListener('click',openMeShopModal);
document.getElementById('openMePointsRankingBtn')&&document.getElementById('openMePointsRankingBtn').addEventListener('click',openMePointsRanking);
document.getElementById('openMeRedeemModalBtn')&&document.getElementById('openMeRedeemModalBtn').addEventListener('click',openMeRedeemModal);
document.getElementById('meShopModalClose')&&document.getElementById('meShopModalClose').addEventListener('click',closeMeShopModal);
document.getElementById('meShopModal')&&document.getElementById('meShopModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='meShopModal') closeMeShopModal(); });
document.getElementById('mePointsRankingClose')&&document.getElementById('mePointsRankingClose').addEventListener('click',closeMePointsRanking);
document.getElementById('mePointsRankingModal')&&document.getElementById('mePointsRankingModal').addEventListener('click',function(e){
  var userBtn=e.target.closest('[data-user-id]');
  if(userBtn){
    var userId=Number(userBtn.getAttribute('data-user-id'));
    if(Number.isFinite(userId)&&userId>0){
      closeMePointsRanking();
      openUserHome(userId,'posts',{ returnTo:'points-ranking' });
    }
    return;
  }
  if(e.target&&e.target.id==='mePointsRankingModal') closeMePointsRanking();
});
document.getElementById('meRedeemModalClose')&&document.getElementById('meRedeemModalClose').addEventListener('click',closeMeRedeemModal);
document.getElementById('meRedeemModal')&&document.getElementById('meRedeemModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='meRedeemModal') closeMeRedeemModal(); });
document.getElementById('meRedeemCodeBtn')&&document.getElementById('meRedeemCodeBtn').addEventListener('click',doMeRedeemCode);
document.getElementById('meRedeemCodeInput')&&document.getElementById('meRedeemCodeInput').addEventListener('keydown',function(e){
  if(e.key==='Enter'){ e.preventDefault(); doMeRedeemCode(); }
});
document.getElementById('profileClose')&&document.getElementById('profileClose').addEventListener('click',closeProfileModal);
document.getElementById('profileAvatarUpload')&&document.getElementById('profileAvatarUpload').addEventListener('click',uploadProfileAvatar);
document.getElementById('profileAvatarInput')&&document.getElementById('profileAvatarInput').addEventListener('change',handleProfileAvatarFileChange);
document.getElementById('avatarPreviewClose')&&document.getElementById('avatarPreviewClose').addEventListener('click',closeAvatarPreviewModal);
document.getElementById('avatarPreviewCancel')&&document.getElementById('avatarPreviewCancel').addEventListener('click',closeAvatarPreviewModal);
document.getElementById('avatarPreviewConfirm')&&document.getElementById('avatarPreviewConfirm').addEventListener('click',confirmProfileAvatarUpload);
document.getElementById('avatarPreviewModal')&&document.getElementById('avatarPreviewModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='avatarPreviewModal')closeAvatarPreviewModal(); });
document.getElementById('profileUsernameTrigger')&&document.getElementById('profileUsernameTrigger').addEventListener('click',openProfileNameModal);
document.getElementById('profileBaseSave')&&document.getElementById('profileBaseSave').addEventListener('click',saveProfileBase);
document.getElementById('profileNameClose')&&document.getElementById('profileNameClose').addEventListener('click',closeProfileNameModal);
document.getElementById('profileNameCancel')&&document.getElementById('profileNameCancel').addEventListener('click',closeProfileNameModal);
document.getElementById('profileNameConfirm')&&document.getElementById('profileNameConfirm').addEventListener('click',saveProfile);
document.getElementById('profileNameInput')&&document.getElementById('profileNameInput').addEventListener('keydown',function(e){ if(e.key==='Enter') saveProfile(); });
document.getElementById('profileNameModal')&&document.getElementById('profileNameModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='profileNameModal')closeProfileNameModal(); });
document.getElementById('profileModal')&&document.getElementById('profileModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='profileModal')closeProfileModal(); });
document.getElementById('meSummary')&&document.getElementById('meSummary').addEventListener('click',function(e){
  if(!authUser) return;
  var actionBtn=e.target.closest('[data-me-open]');
  if(actionBtn){
    var view=actionBtn.getAttribute('data-me-open') || 'posts';
    openUserHome(Number(authUser.id), view);
    return;
  }
  var userBtn=e.target.closest('[data-user-id]');
  if(userBtn){
    var userId=Number(userBtn.getAttribute('data-user-id'));
    if(Number.isFinite(userId) && userId>0){
      openUserHome(userId, 'posts');
    }
  }
});
document.getElementById('meFavoritesCard')&&document.getElementById('meFavoritesCard').addEventListener('click',function(){
  openMyCollectionModal('favorites');
});
document.getElementById('meLikesCard')&&document.getElementById('meLikesCard').addEventListener('click',function(){
  openMyCollectionModal('likes');
});
document.getElementById('chatEntryBtn')&&document.getElementById('chatEntryBtn').addEventListener('click',function(){
  openChatFriendList();
});
document.getElementById('chatBackToEntryBtn')&&document.getElementById('chatBackToEntryBtn').addEventListener('click',function(){
  closeChatModal();
  renderChatConversations();
  updateChatEntryCard();
});
document.getElementById('chatModalClose')&&document.getElementById('chatModalClose').addEventListener('click',function(){
  closeChatModal();
  renderChatConversations();
  updateChatEntryCard();
});
document.getElementById('chatModal')&&document.getElementById('chatModal').addEventListener('click',function(e){
  if(e.target && e.target.id==='chatModal'){
    closeChatModal();
    renderChatConversations();
    updateChatEntryCard();
  }
});
document.getElementById('chatBackToListBtn')&&document.getElementById('chatBackToListBtn').addEventListener('click',function(){
  setChatStage('list');
  markChatSeen();
});
document.getElementById('meCollectionClose')&&document.getElementById('meCollectionClose').addEventListener('click',closeMyCollectionModal);
document.getElementById('meCollectionModal')&&document.getElementById('meCollectionModal').addEventListener('click',function(e){
  if(e.target && e.target.id==='meCollectionModal') closeMyCollectionModal();
});
document.getElementById('meCollectionSearch')&&document.getElementById('meCollectionSearch').addEventListener('input',function(){
  renderMyCollectionModalList();
});
document.getElementById('meCollectionSearch')&&document.getElementById('meCollectionSearch').addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    e.currentTarget.value='';
    renderMyCollectionModalList();
  }
});
document.getElementById('meCollectionSearchClear')&&document.getElementById('meCollectionSearchClear').addEventListener('click',function(){
  var input=document.getElementById('meCollectionSearch');
  if(!input) return;
  input.value='';
  renderMyCollectionModalList();
  input.focus();
});
document.getElementById('meCollectionList')&&document.getElementById('meCollectionList').addEventListener('click',function(e){
  var postBtn=e.target.closest('[data-open-post-id]');
  if(!postBtn) return;
  var postId=Number(postBtn.getAttribute('data-open-post-id'));
  if(!(Number.isFinite(postId) && postId>0)) return;
  closeMyCollectionModal();
  if(typeof window.setHomeTab==='function') window.setHomeTab('forum');
  openForumView(postId);
});
document.getElementById('chatRefreshBtn')&&document.getElementById('chatRefreshBtn').addEventListener('click',function(){
  loadChatConversations();
  if(chatState.activeUserId && chatState.stage==='thread') loadChatMessages(chatState.activeUserId,{ silent:true, keepScroll:true });
});
document.getElementById('chatPeerList')&&document.getElementById('chatPeerList').addEventListener('click',function(e){
  var btn=e.target.closest('[data-chat-peer]');
  if(!btn) return;
  var peerId=Number(btn.getAttribute('data-chat-peer'));
  if(!(Number.isFinite(peerId) && peerId>0)) return;
  var hit=(chatState.conversations||[]).find(function(item){ return Number(item.peerId)===peerId; });
  chatState.activePeer = hit ? (hit.peer || chatState.activePeer) : chatState.activePeer;
  chatState.activeUserId = peerId;
  chatState.messages = [];
  setChatStage('thread');
  renderChatConversations();
  renderChatThread();
  loadChatMessages(peerId).then(function(){ markChatSeen(); });
});
document.getElementById('chatSendBtn')&&document.getElementById('chatSendBtn').addEventListener('click',sendChatMessage);
document.getElementById('chatPeerTitle')&&document.getElementById('chatPeerTitle').addEventListener('click',function(){
  var peerId=Number(chatState.activeUserId);
  if(!(Number.isFinite(peerId)&&peerId>0)) return;
  closeChatModal();
  openUserHome(peerId,'posts');
});
document.getElementById('chatInput')&&document.getElementById('chatInput').addEventListener('keydown',function(e){
  if(e.key==='Enter' && !e.shiftKey){
    e.preventDefault();
    sendChatMessage();
  }
});
document.getElementById('chatInput')&&document.getElementById('chatInput').addEventListener('input',autoResizeChatInput);
autoResizeChatInput();
window.addEventListener('resize',function(){
  if(chatState.stage==='list' || chatState.stage==='thread'){
    setChatStage(chatState.stage);
  }
});
document.getElementById('userHomeClose')&&document.getElementById('userHomeClose').addEventListener('click',closeUserHome);
document.getElementById('userHomeModal')&&document.getElementById('userHomeModal').addEventListener('click',function(e){
  if(e.target && e.target.id==='userHomeModal') closeUserHome();
});
document.getElementById('userHomeTabs')&&document.getElementById('userHomeTabs').addEventListener('click',function(e){
  var tabBtn=e.target.closest('[data-user-home-view]');
  if(!tabBtn) return;
  setUserHomeView(tabBtn.getAttribute('data-user-home-view'));
});
document.getElementById('userHomeProfile')&&document.getElementById('userHomeProfile').addEventListener('click',function(e){
  var followBtn=e.target.closest('#userHomeFollowBtn');
  if(followBtn){
    toggleUserHomeFollow();
    return;
  }
  var chatBtn=e.target.closest('#userHomeChatBtn');
  if(chatBtn){
    if(!authUser){ showDevToast('请先登录'); return; }
    var profile=userHomeState.profile;
    if(!profile || !Number.isFinite(Number(profile.id)) || Number(profile.id)<=0) return;
    if(!profile.iFollow){
      showDevToast('请先关注对方');
      return;
    }
    openChatWithUser(Number(profile.id), profile);
    closeUserHome({restoreParent:false});
    return;
  }
  var viewBtn=e.target.closest('[data-user-home-view]');
  if(viewBtn){
    setUserHomeView(viewBtn.getAttribute('data-user-home-view'));
  }
});
document.getElementById('userHomeList')&&document.getElementById('userHomeList').addEventListener('click',function(e){
  var userBtn=e.target.closest('[data-user-id]');
  if(userBtn){
    var userId=Number(userBtn.getAttribute('data-user-id'));
    if(Number.isFinite(userId) && userId>0){
      openUserHome(userId, 'posts');
    }
    return;
  }
  var postBtn=e.target.closest('[data-open-post-id]');
  if(postBtn){
    var postId=Number(postBtn.getAttribute('data-open-post-id'));
    if(Number.isFinite(postId) && postId>0){
      closeUserHome({restoreParent:false});
      if(typeof window.setHomeTab==='function') window.setHomeTab('forum');
      openForumView(postId);
    }
  }
});
document.getElementById('openAnnouncement')&&document.getElementById('openAnnouncement').addEventListener('click',function(){ openAnnouncementModal({ markSeen:true }); });
document.getElementById('closeAnnouncement')&&document.getElementById('closeAnnouncement').addEventListener('click',closeAnnouncementModal);
document.getElementById('announcementModal')&&document.getElementById('announcementModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='announcementModal')closeAnnouncementModal(); });
document.getElementById('openContactModalBtn')&&document.getElementById('openContactModalBtn').addEventListener('click',openContactModal);
document.getElementById('openContributionModalBtn')&&document.getElementById('openContributionModalBtn').addEventListener('click',openContributionModal);
document.getElementById('closeContactModal')&&document.getElementById('closeContactModal').addEventListener('click',closeContactModal);
document.getElementById('contactModal')&&document.getElementById('contactModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='contactModal')closeContactModal(); });
document.getElementById('copyContactEmailBtn')&&document.getElementById('copyContactEmailBtn').addEventListener('click',copyContactEmail);
document.getElementById('closeContributionModal')&&document.getElementById('closeContributionModal').addEventListener('click',closeContributionModal);
document.getElementById('cancelContributionBtn')&&document.getElementById('cancelContributionBtn').addEventListener('click',closeContributionModal);
document.getElementById('submitContributionBtn')&&document.getElementById('submitContributionBtn').addEventListener('click',submitContribution);
document.getElementById('contributionContent')&&document.getElementById('contributionContent').addEventListener('input',updateContributionCount);
document.getElementById('contributionModal')&&document.getElementById('contributionModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='contributionModal')closeContributionModal(); });
document.addEventListener('keydown',function(e){
  if(e.key!=='Escape') return;
  var forumImageLightbox=document.getElementById('forumImageLightbox');
  if(forumImageLightbox && forumImageLightbox.classList.contains('open')){ closeForumImageLightbox(); return; }
  var nameModal=document.getElementById('profileNameModal');
  if(nameModal && nameModal.classList.contains('open')){ closeProfileNameModal(); return; }
  var avatarModal=document.getElementById('avatarPreviewModal');
  if(avatarModal && avatarModal.classList.contains('open')){ closeAvatarPreviewModal(); return; }
  var announcementModal=document.getElementById('announcementModal');
  if(announcementModal && announcementModal.classList.contains('open')){ closeAnnouncementModal(); return; }
  var contactModal=document.getElementById('contactModal');
  if(contactModal && contactModal.classList.contains('open')){ closeContactModal(); return; }
  var contributionModal=document.getElementById('contributionModal');
  if(contributionModal && contributionModal.classList.contains('open')){ closeContributionModal(); return; }
  var chatModal=document.getElementById('chatModal');
  if(chatModal && chatModal.classList.contains('open')){ closeChatModal(); return; }
  var meShopModal=document.getElementById('meShopModal');
  if(meShopModal && meShopModal.classList.contains('open')){ closeMeShopModal(); return; }
  var meRedeemModal=document.getElementById('meRedeemModal');
  if(meRedeemModal && meRedeemModal.classList.contains('open')){ closeMeRedeemModal(); return; }
  var meCollectionModal=document.getElementById('meCollectionModal');
  if(meCollectionModal && meCollectionModal.classList.contains('open')){ closeMyCollectionModal(); return; }
  var userHomeModal=document.getElementById('userHomeModal');
  if(userHomeModal && userHomeModal.classList.contains('open')){ closeUserHome(); return; }
  var profileModal=document.getElementById('profileModal');
  if(profileModal && profileModal.classList.contains('open')) closeProfileModal();
});
document.querySelectorAll('.forum-tab').forEach(function(btn){
  btn.addEventListener('click',function(){
    setForumSection(btn.getAttribute('data-section'));
  });
});
document.querySelectorAll('.forum-migration-tab').forEach(function(btn){
  btn.addEventListener('click',function(){
    setForumMigrationGroup(btn.getAttribute('data-group'));
  });
});
document.getElementById('forumPagination')&&document.getElementById('forumPagination').addEventListener('click',function(e){
  var btn=e.target.closest('[data-page-nav]');
  if(!btn) return;
  if(btn.disabled) return;
  var nav=btn.getAttribute('data-page-nav');
  if(nav==='prev') forumPage = Math.max(1, Number(forumPage||1) - 1);
  else if(nav==='next') forumPage = Math.max(1, Number(forumPage||1) + 1);
  loadForumPosts();
});
document.getElementById('forumFab')&&document.getElementById('forumFab').addEventListener('click',function(){
  openForumModal();
});
document.getElementById('forumPublishEntry')&&document.getElementById('forumPublishEntry').addEventListener('click',function(){
  openForumModal();
});
document.getElementById('forumGoTabBtn')&&document.getElementById('forumGoTabBtn').addEventListener('click',function(){
  if(typeof window.setHomeTab === 'function'){
    window.setHomeTab('forum');
    return;
  }
  var btn=document.querySelector('#mainTabs [data-tab=\"forum\"]');
  if(btn) btn.click();
});
document.getElementById('forumClose')&&document.getElementById('forumClose').addEventListener('click',closeForumModal);
document.getElementById('forumModal')&&document.getElementById('forumModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='forumModal')closeForumModal(); });
document.querySelectorAll('#forumTypeTabs .forum-type-btn').forEach(function(btn){
  btn.addEventListener('click',function(){ setForumType(btn.getAttribute('data-type')); });
});
document.getElementById('forumModalImage')&&document.getElementById('forumModalImage').addEventListener('change',function(e){
  var files=Array.from(e.target.files||[]);
  if(!files.length){
    updateForumModalImageMeta();
    return;
  }
  var imageMeta=document.getElementById('forumModalImageMeta');
  if(imageMeta){
    imageMeta.textContent='正在添加 '+files.length+' 张图片...';
    imageMeta.classList.add('has-files');
  }
  files.forEach(function(file){
    if(forumImageListData.length >= MAX_FORUM_IMAGES){
      showDevToast('最多上传'+MAX_FORUM_IMAGES+'张图片');
      return;
    }
    var validation=validateForumImageFile(file, false);
    if(!validation.ok){
      showDevToast(validation.message);
      return;
    }
    if(getForumCoverImagesBytes() + Number(file.size||0) > MAX_FORUM_TOTAL_IMAGE_FILE_SIZE){
      showDevToast('图文图片总大小不能超过 '+formatForumFileSize(MAX_FORUM_TOTAL_IMAGE_FILE_SIZE));
      return;
    }
    var reader=new FileReader();
    reader.onload=function(){
      forumImageListData.push(String(reader.result||''));
      renderForumImageList();
    };
    reader.readAsDataURL(file);
  });
  e.target.value='';
});
document.getElementById('forumImageList')&&document.getElementById('forumImageList').addEventListener('click',function(e){
  var btn=e.target.closest('.forum-image-remove');
  if(!btn) return;
  var idx=Number(btn.getAttribute('data-remove'));
  if(Number.isNaN(idx)) return;
  forumImageListData.splice(idx,1);
  renderForumImageList();
});
document.getElementById('forumEmbedImage')&&document.getElementById('forumEmbedImage').addEventListener('change',function(e){
  var files=Array.from(e.target.files||[]);
  if(!files.length){
    updateForumEmbedImageMeta(0);
    return;
  }
  if(forumPostType !== 'article') return;
  updateForumEmbedImageMeta(files.length);
  var editor=focusActiveEditor();
  if(!editor) return;
  files.forEach(function(file){
    var validation=validateForumImageFile(file, true);
    if(!validation.ok){
      showDevToast(validation.message);
      return;
    }
    if(getForumEditorImagesBytes(editor) + Number(file.size||0) > MAX_FORUM_TOTAL_EMBED_IMAGE_FILE_SIZE){
      showDevToast('文章插图总大小不能超过 '+formatForumFileSize(MAX_FORUM_TOTAL_EMBED_IMAGE_FILE_SIZE));
      return;
    }
    var reader=new FileReader();
    reader.onload=function(){
      editor.focus();
      document.execCommand('insertImage', false, String(reader.result||''));
      setTimeout(function(){
        var imgs=editor.querySelectorAll('img');
        var img=imgs[imgs.length-1];
        if(img){
          img.style.maxWidth='100%';
          img.style.height='auto';
          setActiveImage(img);
        }
      },0);
    };
    reader.readAsDataURL(file);
  });
  e.target.value='';
});
document.getElementById('forumFontFamily')&&document.getElementById('forumFontFamily').addEventListener('change',function(e){
  if(!e.target.value) return;
  focusActiveEditor();
  document.execCommand('fontName', false, e.target.value);
});
document.getElementById('forumFontSize')&&document.getElementById('forumFontSize').addEventListener('change',function(e){
  var v=Number(e.target.value||0);
  if(v>0) applyFontSize(v);
});
document.getElementById('forumColor')&&document.getElementById('forumColor').addEventListener('input',function(e){
  focusActiveEditor();
  document.execCommand('foreColor', false, e.target.value);
});
document.getElementById('forumBgColor')&&document.getElementById('forumBgColor').addEventListener('input',function(e){
  focusActiveEditor();
  document.execCommand('hiliteColor', false, e.target.value);
});
document.querySelectorAll('.forum-toolbar [data-cmd]').forEach(function(btn){
  btn.addEventListener('click',function(){
    var cmd=btn.getAttribute('data-cmd');
    var val=btn.getAttribute('data-value')||undefined;
    focusActiveEditor();
    if(cmd==='createLink'){
      var url=prompt('请输入链接地址');
      if(!url) return;
      document.execCommand('createLink', false, url);
      return;
    }
    document.execCommand(cmd, false, val);
  });
});
document.getElementById('forumImgWidthRange')&&document.getElementById('forumImgWidthRange').addEventListener('input',function(e){
  if(!forumActiveImage) return;
  forumActiveImage.style.width = e.target.value + '%';
  forumActiveImage.style.height = 'auto';
  var px=document.getElementById('forumImgWidthPx');
  if(px) px.value='';
});
document.getElementById('forumImgWidthPx')&&document.getElementById('forumImgWidthPx').addEventListener('input',function(e){
  if(!forumActiveImage) return;
  var v=Number(e.target.value||0);
  if(v<=0) return;
  forumActiveImage.style.width = v + 'px';
  forumActiveImage.style.height = 'auto';
  var range=document.getElementById('forumImgWidthRange');
  if(range) range.value=100;
});
document.getElementById('forumImgReset')&&document.getElementById('forumImgReset').addEventListener('click',function(){
  if(!forumActiveImage) return;
  forumActiveImage.style.width = '';
  forumActiveImage.style.height = '';
  forumActiveImage.style.maxWidth = '100%';
  setActiveImage(forumActiveImage);
});
bindEditorImageSelection(document.getElementById('forumEditor'));
bindEditorImageSelection(document.getElementById('forumImageEditor'));
document.getElementById('forumPublishBtn')&&document.getElementById('forumPublishBtn').addEventListener('click',submitForumPost);
document.getElementById('forumViewClose')&&document.getElementById('forumViewClose').addEventListener('click',closeForumView);
document.getElementById('forumViewModal')&&document.getElementById('forumViewModal').addEventListener('click',function(e){ if(e.target&&e.target.id==='forumViewModal')closeForumView(); });
(function(){
  var pingTimer=null;
  window.addEventListener('storage', function(ev){
    if(ev.key !== 'wjdr_forum_ping') return;
    clearTimeout(pingTimer);
    pingTimer = setTimeout(function(){
      if(typeof loadForumPosts === 'function') loadForumPosts({ silent: true });
    }, 150);
  });
})();
document.getElementById('forumViewContent')&&document.getElementById('forumViewContent').addEventListener('click',function(e){
  var img=e.target && e.target.closest ? e.target.closest('img') : null;
  if(!img) return;
  e.preventDefault();
  openForumImageLightbox(
    img.getAttribute('src') || img.src || '',
    img.getAttribute('alt') || '图片预览',
    img.getAttribute('data-original-src') || ''
  );
});
document.getElementById('forumImageLightboxClose')&&document.getElementById('forumImageLightboxClose').addEventListener('click',closeForumImageLightbox);
document.getElementById('forumImageLightboxOriginal')&&document.getElementById('forumImageLightboxOriginal').addEventListener('click',function(e){
  e.preventDefault();
  e.stopPropagation();
  showForumImageLightboxOriginal();
});
document.getElementById('forumImageLightbox')&&document.getElementById('forumImageLightbox').addEventListener('click',function(e){
  if(e.target && e.target.id==='forumImageLightbox') closeForumImageLightbox();
});
document.getElementById('forumEditPostBtn')&&document.getElementById('forumEditPostBtn').addEventListener('click',editCurrentPost);
document.getElementById('forumDeletePostBtn')&&document.getElementById('forumDeletePostBtn').addEventListener('click',deleteCurrentPost);
document.getElementById('forumPinPostBtn')&&document.getElementById('forumPinPostBtn').addEventListener('click',togglePostPin);
document.getElementById('forumLikeBtn')&&document.getElementById('forumLikeBtn').addEventListener('click',toggleLike);
document.getElementById('forumFavoriteBtn')&&document.getElementById('forumFavoriteBtn').addEventListener('click',toggleFavorite);
document.getElementById('forumCommentSubmit')&&document.getElementById('forumCommentSubmit').addEventListener('click',submitComment);
document.getElementById('forumReplyHint')&&document.getElementById('forumReplyHint').addEventListener('click',function(e){
  var cancelBtn=e.target.closest('.forum-cancel-reply');
  if(cancelBtn){ setForumReplyTarget(null); }
});
document.getElementById('forumList')&&document.getElementById('forumList').addEventListener('click',function(e){
  var authorBtn=e.target.closest('.forum-author-link');
  if(authorBtn){
    var authorId=Number(authorBtn.getAttribute('data-user-id'));
    if(Number.isFinite(authorId) && authorId>0){
      openUserHome(authorId, 'posts');
    }
    return;
  }
  var readBtn=e.target.closest('.forum-read');
  var card=e.target.closest('.forum-post');
  var titleBtn=e.target.closest('.forum-post-title');
  if(readBtn && card){
    var postId=Number(card.getAttribute('data-id'));
    if(Number.isFinite(postId) && postId>0){
      saveForumReturnState();
      window.location.assign('/function/forum-post.html?id='+encodeURIComponent(String(postId)));
    }
    return;
  }
  if(titleBtn && card){ openForumView(Number(card.getAttribute('data-id'))); }
});
document.getElementById('forumViewMeta')&&document.getElementById('forumViewMeta').addEventListener('click',function(e){
  var followBtn=e.target.closest('[data-forum-follow]');
  if(followBtn){
    e.preventDefault();
    toggleForumDetailFollow(Number(followBtn.getAttribute('data-forum-follow')));
    return;
  }
  if(e.target.closest('[data-forum-follow-login]')){
    e.preventDefault();
    showDevToast('请先登录');
    return;
  }
  var authorBtn=e.target.closest('.forum-author-link');
  if(!authorBtn) return;
  var authorId=Number(authorBtn.getAttribute('data-user-id'));
  if(Number.isFinite(authorId) && authorId>0){
    openUserHome(authorId, 'posts');
  }
});
document.getElementById('forumCommentList')&&document.getElementById('forumCommentList').addEventListener('click',function(e){
  var authorBtn=e.target.closest('.forum-author-link');
  if(authorBtn){
    var authorId=Number(authorBtn.getAttribute('data-user-id'));
    if(Number.isFinite(authorId) && authorId>0){
      openUserHome(authorId, 'posts');
    }
    return;
  }
  var threadToggle=e.target.closest('.forum-reply-toggle');
  if(threadToggle){ toggleReplyThread(Number(threadToggle.getAttribute('data-thread-id'))); return; }
  var moreBtn=e.target.closest('.forum-comment-more');
  if(moreBtn){ toggleCommentMenu(Number(moreBtn.getAttribute('data-id'))); return; }
  var menuArea=e.target.closest('.forum-comment-menu');
  if(menuArea && !e.target.closest('.forum-comment-menu-btn')) return;
  var pinBtn=e.target.closest('.forum-pin-comment');
  if(pinBtn){
    forumOpenCommentMenuId = null;
    toggleCommentPin(Number(pinBtn.getAttribute('data-id')));
    return;
  }
  var replyBtn=e.target.closest('.forum-reply-comment');
  if(replyBtn){
    forumOpenCommentMenuId = null;
    startReplyComment(Number(replyBtn.getAttribute('data-id')));
    return;
  }
  var deleteBtn=e.target.closest('.forum-delete-comment');
  if(deleteBtn){
    forumOpenCommentMenuId = null;
    deleteForumComment(Number(deleteBtn.getAttribute('data-id')));
    return;
  }
  if(forumOpenCommentMenuId && !e.target.closest('.forum-comment-menu-wrap')){
    forumOpenCommentMenuId = null;
    renderComments(forumCurrentComments);
  }
});
document.addEventListener('click',function(e){
  if(!forumOpenCommentMenuId) return;
  if(e.target && e.target.closest && e.target.closest('.forum-comment-menu-wrap')) return;
  forumOpenCommentMenuId = null;
  if(forumCurrentComments && forumCurrentComments.length){
    renderComments(forumCurrentComments);
  }
});
refreshMe();
// 赞助与支付弹窗（支付接口预留）
(function(){
  var payModal=document.getElementById('payModal'),payClose=document.getElementById('payClose'),payAmount=document.getElementById('payAmount'),payGift=document.getElementById('payGift');
  function openPayModal(amount,gift){
    if(payAmount)payAmount.textContent='￥'+amount;
    if(payGift)payGift.textContent=gift;
    if(payModal){payModal.classList.add('open');payModal.setAttribute('aria-hidden','false');}
  }
  function closePayModal(){if(payModal){payModal.classList.remove('open');payModal.setAttribute('aria-hidden','true');}}
  document.querySelectorAll('.sponsor-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var t=btn.closest('.sponsor-tier');
      if(t)openPayModal(t.getAttribute('data-amount')||'0',t.getAttribute('data-gift')||'—');
    });
  });
  if(payClose)payClose.addEventListener('click',closePayModal);
  if(payModal)payModal.addEventListener('click',function(e){if(e.target===payModal)closePayModal();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&payModal&&payModal.classList.contains('open'))closePayModal();});
})();

// 更新日志弹窗
(function(){
  var m=document.getElementById('changelogModal'),o=document.getElementById('openChangelog'),c=document.getElementById('closeChangelog');
  function openChangelog(){if(m){m.classList.add('open');m.setAttribute('aria-hidden','false');}}
  function closeChangelog(){if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true');}}
  if(o)o.addEventListener('click',openChangelog);
  if(c)c.addEventListener('click',closeChangelog);
  if(m)m.addEventListener('click',function(e){if(e.target===m)closeChangelog();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeChangelog();});
})();

// 首页工具显示和角标由后台统一配置；接口异常时保留静态默认状态。
(function(){
  function badgeLabel(value){
    return value==='new' ? '新' : (value==='hot' ? '热' : '');
  }
  function updateToolBadge(card, badge){
    var title=card.querySelector('.tool-tile-name, .tool-entry-title');
    if(!title)return;
    var current=title.querySelector('.tool-status-badge');
    var label=badgeLabel(badge);
    card.classList.toggle('has-tool-status-badge',Boolean(label));
    if(!label){
      if(current)current.remove();
      return;
    }
    if(!current){
      current=document.createElement('span');
      title.insertBefore(current,title.firstChild);
    }
    current.className='tool-status-badge '+(badge==='hot'?'badge-hot':'badge-new');
    current.textContent=label;
  }
  function applyToolManagement(payload){
    var list=payload&&Array.isArray(payload.tools)?payload.tools:[];
    var byId={};
    list.forEach(function(config){
      if(config&&config.id)byId[String(config.id)]=config;
    });
    document.querySelectorAll('[data-tool-id]').forEach(function(card){
      var config=byId[card.getAttribute('data-tool-id')];
      if(!config)return;
      var managedHidden=config.visible === false;
      card.dataset.toolManagedHidden=managedHidden?'1':'0';
      card.toggleAttribute('hidden',managedHidden);
      if(managedHidden)card.setAttribute('aria-hidden','true');
      else card.removeAttribute('aria-hidden');
      var badge=String(config.badge||'none').toLowerCase();
      if(badge === 'new' || badge === 'hot')updateToolBadge(card,badge);
      else updateToolBadge(card,'none');
    });
    document.dispatchEvent(new CustomEvent('toolmanagementchange'));
  }
  window.__wjdrApplyToolManagement=applyToolManagement;
  fetch('/api/tool-management',{credentials:'same-origin',headers:{'Accept':'application/json'}})
    .then(function(response){return response.ok?response.json():null;})
    .then(function(data){if(data)applyToolManagement(data);})
    .catch(function(){});
})();

// 顶部分栏：按类型筛选卡片 + 全部搜索
(function(){
  var tabBar=document.getElementById('mainTabs');
  if(!tabBar)return;
  var tabButtons=tabBar.querySelectorAll('[data-tab]');
  var cards=document.querySelectorAll('.card[data-category]');
  var toolSubTabs=document.getElementById('toolSubTabs');
  var toolSubButtons=toolSubTabs ? toolSubTabs.querySelectorAll('[data-tool-tab]') : [];
  var toolGroups=document.querySelectorAll('[data-tool-group]');
  var searchWrap=document.getElementById('allTabSearch');
  var searchInput=document.getElementById('allTabSearchInput');
  var searchClear=document.getElementById('allTabSearchClear');
  var userSearchTimer=null;
  var userSearchSeq=0;
  var userSearchQuery='';
  var userSearchUsers=[];
  var userSearchLoading=false;
  var activeTab='all';
  var activeToolTab='calcTools';
  var calendarEmbedLoaded=false;
  var calendarEmbedLoading=false;
  var homeNavigationReady=false;
  function normalizeTab(tab){
    if(!tab) return '';
    var raw=String(tab).trim();
    var lower=raw.toLowerCase();
    if(lower==='tools'||lower==='calculator'||lower==='calc'||lower==='calctools'||lower==='data'||lower==='query'||lower==='dataquery'||lower==='minigames'||lower==='game'||lower==='games') return 'tools';
    return raw;
  }
  function normalizeToolTab(tab){
    if(!tab) return '';
    var raw=String(tab).trim();
    var lower=raw.toLowerCase();
    if(lower==='calctools'||lower==='calculator'||lower==='calc') return 'calcTools';
    if(lower==='dataquery'||lower==='data'||lower==='query') return 'dataQuery';
    if(lower==='minigames'||lower==='game'||lower==='games') return 'miniGames';
    return '';
  }
  function setToolSubTabsVisible(tab){
    if(!toolSubTabs) return;
    toolSubTabs.style.display = (tab==='tools') ? '' : 'none';
  }
  function refreshToolSubTabs(){
    toolSubButtons.forEach(function(btn){
      btn.classList.toggle('active', btn.getAttribute('data-tool-tab')===activeToolTab);
    });
  }
  function getSearchText(card){
    if(card.dataset.searchText) return card.dataset.searchText;
    var chunks=[];
    var title=card.querySelector('.card-title');
    var desc=card.querySelector('.desc');
    var pill=card.querySelector('.pill');
    if(title) chunks.push(title.textContent||'');
    if(desc) chunks.push(desc.textContent||'');
    if(pill) chunks.push(pill.textContent||'');
    var text=chunks.join(' ').toLowerCase();
    card.dataset.searchText=text;
    return text;
  }
  function normalizeGiftKeyword(raw){
    return String(raw||'').trim().toLowerCase().replace(/[\s·•\-_.，。、；;：:（）()【】\[\]《》<>]/g,'');
  }
  function giftPackCategoryHasMatch(cat, normQ){
    var blobs = window.__giftPackSearchBlobs;
    if(!blobs||!normQ) return false;
    var list = blobs[cat];
    if(!list||!list.length) return false;
    for(var i=0;i<list.length;i++){
      if(list[i].t.indexOf(normQ)>-1) return true;
    }
    return false;
  }
  function collectGiftPackMatches(cat, normQ){
    var blobs = window.__giftPackSearchBlobs;
    var out=[];
    if(!blobs||!normQ) return out;
    var list = blobs[cat]||[];
    for(var i=0;i<list.length;i++){
      if(list[i].t.indexOf(normQ)>-1) out.push(list[i].n);
    }
    return out;
  }
  function escGiftHint(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function renderForumSearchHints(keyword){
    var el=document.getElementById('forumSearchHint');
    if(!el) return;
    if(activeTab!=='all'||!keyword){
      el.innerHTML='';
      el.classList.remove('open');
      return;
    }
    var posts=(window.__forumHomeSearchPostsSnapshot||[]);
    var pending=typeof window.forumHomeSearchIsActive==='function' && window.forumHomeSearchIsActive() && !posts.length;
    if(pending){
      el.innerHTML='<div class="gift-pack-search-hint-head">论坛帖子</div><div class="gift-pack-search-hint-row">正在搜索…</div>';
      el.classList.add('open');
      return;
    }
    if(!posts.length){
      el.innerHTML='';
      el.classList.remove('open');
      return;
    }
    var maxShow=8;
    var show=posts.slice(0,maxShow);
    var more=posts.length>maxShow?' <span class="gift-pack-search-hint-more">等 '+posts.length+' 篇帖子</span>':'';
    var links=show.map(function(p){
      var title=String(p.title||'无标题').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      return '<a href="#" class="forum-search-hint-link" data-post-id="'+Number(p.id)+'">'+title+'</a>';
    }).join(' · ');
    el.innerHTML='<div class="gift-pack-search-hint-head">论坛帖子命中</div><div class="gift-pack-search-hint-row">'+links+more+'</div>';
    el.classList.add('open');
  }
  function renderUserSearchHints(keyword){
    var el=document.getElementById('userSearchHint');
    if(!el) return;
    if(activeTab!=='all'||!keyword||keyword!==userSearchQuery){
      el.innerHTML='';
      el.classList.remove('open');
      return;
    }
    if(userSearchLoading){
      el.innerHTML='<div class="gift-pack-search-hint-head">用户</div><div class="gift-pack-search-hint-row">正在搜索用户名…</div>';
      el.classList.add('open');
      return;
    }
    if(!userSearchUsers.length){
      el.innerHTML='';
      el.classList.remove('open');
      return;
    }
    var links=userSearchUsers.map(function(user){
      return '<a href="?user='+Number(user.id)+'" class="user-search-hint-link" data-user-id="'+Number(user.id)+'">'+escGiftHint(user.username||('用户'+user.id))+'</a>';
    }).join(' · ');
    el.innerHTML='<div class="gift-pack-search-hint-head">用户名搜索</div><div class="gift-pack-search-hint-row">'+links+'</div>';
    el.classList.add('open');
  }
  function triggerUserSearch(raw){
    var q=String(raw||'').trim().toLowerCase();
    userSearchQuery=q;
    userSearchUsers=[];
    userSearchLoading=!!q;
    if(userSearchTimer) clearTimeout(userSearchTimer);
    renderUserSearchHints(q);
    if(!q) return;
    userSearchTimer=setTimeout(async function(){
      var seq=++userSearchSeq;
      try{
        var r=await apiFetch('/api/users/search?q='+encodeURIComponent(q),{method:'GET'});
        var d=await r.json().catch(function(){return {};});
        if(seq!==userSearchSeq||q!==userSearchQuery) return;
        userSearchUsers=r.ok&&Array.isArray(d.users)?d.users:[];
      }catch(_e){
        if(seq!==userSearchSeq||q!==userSearchQuery) return;
        userSearchUsers=[];
      }
      userSearchLoading=false;
      renderUserSearchHints(q);
    },280);
  }
  function renderGiftPackHints(normQ){
    var el=document.getElementById('giftPackSearchHint');
    if(!el) return;
    if(activeTab!=='all'||!normQ){
      el.innerHTML='';
      el.classList.remove('open');
      return;
    }
    if(!window.__giftPackSearchBlobs){
      el.innerHTML='<div class="gift-pack-search-hint-head">礼包道具命中</div><div class="gift-pack-search-hint-row">正在加载礼包索引…</div>';
      el.classList.add('open');
      if(window.__giftPackSearchBlobsPromise){
        window.__giftPackSearchBlobsPromise.then(function(){
          if(typeof window.__refreshHomeSearch==='function') window.__refreshHomeSearch();
        });
      }
      return;
    }
    var r=collectGiftPackMatches('regular',normQ);
    var s=collectGiftPackMatches('special',normQ);
    if(!r.length&&!s.length){
      el.innerHTML='';
      el.classList.remove('open');
      return;
    }
    var qRaw=String(searchInput&&searchInput.value?searchInput.value:'').trim();
    var qEnc=encodeURIComponent(qRaw);
    var maxShow=8;
    function rowHtml(label, names, baseHref){
      var show=names.slice(0,maxShow);
      var more=names.length>maxShow?' <span class="gift-pack-search-hint-more">等 '+names.length+' 个礼包</span>':'';
      var links=show.map(function(n){
        return '<a href="'+baseHref+'?q='+qEnc+'&pack='+encodeURIComponent(n)+'">'+escGiftHint(n)+'</a>';
      }).join(' · ');
      return '<div class="gift-pack-search-hint-row"><strong>'+label+'</strong> '+links+more+'</div>';
    }
    el.innerHTML='<div class="gift-pack-search-hint-head">礼包道具命中（与常规/特惠页内搜索规则一致）</div>'
      +(r.length?rowHtml('常规礼包',r,'function/Zero/regular-gift-data.html'):'')
      +(s.length?rowHtml('特惠礼包',s,'function/Zero/special-gift-data.html'):'');
    el.classList.add('open');
  }
  function matchTab(card, tab){
    var cat=card.getAttribute('data-category');
    if(!tab||tab==='all') return cat!=='my';
    if(tab==='tools') return cat===activeToolTab;
    return cat===tab;
  }
  function refreshToolGroupVisibility(){
    toolGroups.forEach(function(group){
      var visible=false;
      group.querySelectorAll('.card[data-category]').forEach(function(card){
        if(card.style.display!=='none') visible=true;
      });
      group.style.display=visible?'':'none';
    });
  }
  function isPermanentlyHidden(card){
    return card.hasAttribute('hidden') || card.dataset.toolManagedHidden==='1';
  }
  function applyTab(tab){
    var keyword='';
    var giftKw='';
    if(tab==='all'&&searchInput){
      var raw=String(searchInput.value||'').trim();
      keyword=raw.toLowerCase();
      giftKw=normalizeGiftKeyword(raw);
    }
    cards.forEach(function(card){
      if(isPermanentlyHidden(card)){
        card.style.display='none';
        return;
      }
      var visible=matchTab(card, tab);
      if(visible && (keyword || giftKw)){
        var cat=card.getAttribute('data-category');
        var txtHit = keyword && getSearchText(card).indexOf(keyword)>-1;
        var giftCat = card.getAttribute('data-gift-search');
        var giftHit = !!(giftCat && giftKw && giftPackCategoryHasMatch(giftCat, giftKw));
        var forumHit = !!(keyword && cat === 'forum' && typeof window.forumHomeSearchIsActive === 'function' && window.forumHomeSearchIsActive());
        visible = txtHit || giftHit || forumHit;
      }
      card.style.display=visible?'':'none';
    });
    refreshToolGroupVisibility();
    renderGiftPackHints(giftKw);
    renderForumSearchHints(keyword);
    renderUserSearchHints(keyword);
  }
  window.__refreshHomeSearch = function(){
    if(activeTab!=='all'||!searchInput) return;
    applyTab(activeTab);
  };
  document.addEventListener('toolmanagementchange',function(){applyTab(activeTab);});
  function isValidTab(tab){
    if(!tab){ return false; }
    var btn=tabBar.querySelector('[data-tab="'+tab+'"]');
    return !!(btn && !btn.hasAttribute('hidden'));
  }
  function firstVisibleTab(){
    var button=tabBar.querySelector('[data-tab]:not([hidden])');
    return button ? button.getAttribute('data-tab') : 'all';
  }
  function renderCalendarEmbedError(){
    var host=document.getElementById('homeCalendarEmbedHost');
    if(!host) return;
    calendarEmbedLoading=false;
    calendarEmbedLoaded=false;
    host.innerHTML='<div class="home-calendar-error"><strong>活动日历加载失败</strong><span>请检查网络后重试。</span><button class="home-calendar-retry" id="calendarEmbedRetry" type="button">重新加载</button></div>';
    var retry=document.getElementById('calendarEmbedRetry');
    if(retry) retry.addEventListener('click',function(){ ensureCalendarEmbed(true); });
  }
  function ensureCalendarEmbed(forceRetry){
    if(!homeNavigationReady) return;
    if(!isValidTab('calendar')) return;
    var host=document.getElementById('homeCalendarEmbedHost');
    if(!host || calendarEmbedLoading || (calendarEmbedLoaded && !forceRetry)) return;
    var oldFrame=host.querySelector('iframe');
    if(oldFrame && !forceRetry) return;
    calendarEmbedLoading=true;
    calendarEmbedLoaded=false;
    host.innerHTML='<div class="home-calendar-loading"><strong>正在加载活动日历</strong><span>首次打开需要一点时间。</span></div>';
    var iframe=document.createElement('iframe');
    iframe.title='活动日历';
    iframe.loading='eager';
    iframe.src='/function/calendar.html?embed=1';
    iframe.addEventListener('load',function(){
      calendarEmbedLoading=false;
      calendarEmbedLoaded=true;
    },{once:true});
    iframe.addEventListener('error',renderCalendarEmbedError,{once:true});
    host.innerHTML='';
    host.appendChild(iframe);
  }
  function applyHomeNavigation(items){
    var visibility={};
    (Array.isArray(items)?items:[]).forEach(function(item){
      if(item && typeof item.id==='string' && typeof item.visible==='boolean') visibility[item.id]=item.visible;
    });
    document.querySelectorAll('[data-home-nav-id]').forEach(function(control){
      var id=control.getAttribute('data-home-nav-id');
      control.toggleAttribute('hidden', visibility[id]===false);
    });
    if(!isValidTab(activeTab)) setActiveTab(firstVisibleTab());
    document.dispatchEvent(new CustomEvent('homenavigationchange',{detail:{items:items||[]}}));
  }
  async function loadHomeNavigation(){
    try{
      var response=await apiFetch('/api/home-navigation',{method:'GET'});
      var data=await response.json().catch(function(){ return {}; });
      homeNavigationReady=true;
      if(response.ok && Array.isArray(data.items)) applyHomeNavigation(data.items);
    }catch(_error){
      homeNavigationReady=true;
    }
    if(activeTab==='calendar') ensureCalendarEmbed();
  }
  function setSearchVisible(tab){
    if(!searchWrap) return;
    var show = tab==='all';
    searchWrap.style.display=show?'':'none';
    if(searchInput){
      searchInput.disabled=!show;
      if(!show) searchInput.value='';
    }
    var hintEl=document.getElementById('giftPackSearchHint');
    if(hintEl && !show){
      hintEl.innerHTML='';
      hintEl.classList.remove('open');
    }
    var forumHintEl=document.getElementById('forumSearchHint');
    if(forumHintEl && !show){
      forumHintEl.innerHTML='';
      forumHintEl.classList.remove('open');
      if(typeof window.triggerForumHomeSearch === 'function') window.triggerForumHomeSearch('');
    }
    var userHintEl=document.getElementById('userSearchHint');
    if(userHintEl && !show){
      userHintEl.innerHTML='';
      userHintEl.classList.remove('open');
      triggerUserSearch('');
    }
  }
  function updateTabQuery(){
    if (!(history && history.replaceState)) return;
    var url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    if(activeTab==='tools'){
      url.searchParams.set('toolTab', activeToolTab);
    }else{
      url.searchParams.delete('toolTab');
    }
    history.replaceState(null, '', url.toString());
  }
  function setActiveToolTab(toolTab, skipApply){
    var normalizedTool=normalizeToolTab(toolTab);
    if(!normalizedTool) normalizedTool='calcTools';
    activeToolTab=normalizedTool;
    refreshToolSubTabs();
    if(!skipApply && activeTab==='tools'){
      applyTab(activeTab);
      updateTabQuery();
    }
  }
  function setActiveTab(tab){
    var normalized=normalizeTab(tab);
    if(!isValidTab(normalized)) normalized=firstVisibleTab();
    activeTab=normalized;
    setToolSubTabsVisible(activeTab);
    setSearchVisible(activeTab);
    applyTab(activeTab);
    tabButtons.forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-tab')===activeTab);
    });
    if(typeof window.refreshForumListView === 'function') window.refreshForumListView();
    if (window.updateForumFab) window.updateForumFab(activeTab);
    if(activeTab==='my' && authUser){ loadMeRewards(); }
    if(activeTab==='calendar') ensureCalendarEmbed();
    updateTabQuery();
  }
  window.setHomeTab = setActiveTab;
  window.getHomeTab = function(){ return activeTab; };
  tabButtons.forEach(function(btn){
    btn.addEventListener('click',function(){
      var tab=btn.getAttribute('data-tab');
      setActiveTab(tab);
    });
  });
  toolSubButtons.forEach(function(btn){
    btn.addEventListener('click',function(){
      setActiveToolTab(btn.getAttribute('data-tool-tab'));
    });
  });
  if(searchInput){
    searchInput.addEventListener('input',function(){
      if(activeTab==='all'){
        var raw=String(searchInput.value||'').trim();
        if(typeof window.triggerForumHomeSearch === 'function') window.triggerForumHomeSearch(raw);
        triggerUserSearch(raw);
        applyTab(activeTab);
      }
    });
    searchInput.addEventListener('keydown',function(e){
      if(e.key==='Escape'){
        searchInput.value='';
        if(typeof window.triggerForumHomeSearch === 'function') window.triggerForumHomeSearch('');
        triggerUserSearch('');
        applyTab(activeTab);
      }
    });
  }
  if(searchClear){
    searchClear.addEventListener('click',function(){
      if(!searchInput) return;
      searchInput.value='';
      if(typeof window.triggerForumHomeSearch === 'function') window.triggerForumHomeSearch('');
      triggerUserSearch('');
      applyTab(activeTab);
      searchInput.focus();
    });
  }
  var forumSearchHintEl=document.getElementById('forumSearchHint');
  if(forumSearchHintEl){
    forumSearchHintEl.addEventListener('click',function(e){
      var link=e.target.closest('.forum-search-hint-link');
      if(!link) return;
      e.preventDefault();
      var postId=Number(link.getAttribute('data-post-id'));
      if(!Number.isFinite(postId)||postId<=0) return;
      if(typeof openForumView === 'function') openForumView(postId);
    });
  }
  var userSearchHintEl=document.getElementById('userSearchHint');
  if(userSearchHintEl){
    userSearchHintEl.addEventListener('click',function(e){
      var link=e.target.closest('.user-search-hint-link');
      if(!link) return;
      e.preventDefault();
      var userId=Number(link.getAttribute('data-user-id'));
      if(Number.isFinite(userId)&&userId>0) openUserHome(userId,'posts');
    });
  }
  var urlTab = '';
  var urlToolTab = '';
  var urlParams=null;
  try{
    urlParams=new URLSearchParams(window.location.search);
    urlTab = urlParams.get('tab') || '';
    urlToolTab = urlParams.get('toolTab') || '';
  }catch(_e){}
  var initialToolTab = normalizeToolTab(urlToolTab) || normalizeToolTab(urlTab) || 'calcTools';
  setActiveToolTab(initialToolTab, true);
  var initialTab = normalizeTab(urlTab);
  initialTab = isValidTab(initialTab) ? initialTab : firstVisibleTab();
  setActiveTab(initialTab);
  loadHomeNavigation();
  var deepOpenUser = '';
  if(urlParams) deepOpenUser = urlParams.get('openUser') || '';
  var deepUid = Number(deepOpenUser);
  if(urlParams && Number.isFinite(deepUid) && deepUid > 0 && typeof openUserHome === 'function'){
    setTimeout(function(){ openUserHome(deepUid, 'posts'); }, 0);
    try{
      urlParams.delete('openUser');
      var nextQs = urlParams.toString();
      var pu = window.location.pathname + (nextQs ? '?' + nextQs : '') + window.location.hash;
      history.replaceState(null, '', pu);
    }catch(_hist){}
  }
})();

// 时钟（小装饰）
var clockEl = document.getElementById('clock');
function pad2(n){return String(n).padStart(2,'0')}
function tick(){
  const d = new Date();
  clockEl.textContent = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
if(clockEl){ tick(); setInterval(tick, 1000); }

// 飘雪：生成雪花（纯本地，无依赖）
const snowChars = ['❄', '✦', '✧', '❅', '❆'];
function rand(min, max){ return Math.random() * (max - min) + min; }

function spawnSnowflake(){
  const el = document.createElement('div');
  el.className = 'snowflake';
  el.textContent = snowChars[Math.floor(Math.random() * snowChars.length)];

  const size = rand(10, 18);
  const startX = rand(0, window.innerWidth);
  const drift = rand(-120, 120);
  const duration = rand(7, 14);
  const opacity = rand(0.25, 0.85);
  const rotate = rand(-360, 360);

  el.style.left = `${startX}px`;
  el.style.fontSize = `${size}px`;
  el.style.opacity = opacity.toFixed(2);

  const start = performance.now();
  function step(now){
    const t = (now - start) / (duration * 1000);
    if (t >= 1){
      el.remove();
      return;
    }
    const y = t * (window.innerHeight + 80) - 40;
    const x = startX + drift * t + Math.sin(t * Math.PI * 2) * 12;
    el.style.transform = `translate(${x - startX}px, ${y}px) rotate(${rotate * t}deg)`;
    requestAnimationFrame(step);
  }

  document.body.appendChild(el);
  requestAnimationFrame(step);
}

// 控制密度
const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReduced){
  setInterval(spawnSnowflake, 180);
}
